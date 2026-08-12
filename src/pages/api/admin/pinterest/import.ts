import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { apiFailure, handleApiError, jsonResponse, readJsonBody, requestId } from '@/lib/http';
import { convertToOriginalPinterestUrl, isValidPinterestCdnUrl, parsePinterestTagsFromUrl } from '@/services/pinterest/pinterest.service';
import { AuthService } from '@worker/services/auth.service';
import { WallpaperIngestionService } from '@worker/services/ingestion.service';

interface PinterestImportItemRequest {
  url: string;
  title?: string;
  defaultCategoryId?: string;
  additionalTags?: string[];
}

interface PinterestImportPayload {
  urls: (string | PinterestImportItemRequest)[];
  defaultCategoryId?: string;
  additionalTags?: string[];
}

function normalizeInput(payload: unknown): PinterestImportPayload {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid request body');
  }
  const raw = payload as Record<string, unknown>;
  if (!Array.isArray(raw.urls) || raw.urls.length === 0) {
    throw new Error('Select at least one Pinterest image URL to import');
  }
  if (raw.urls.length > 50) {
    throw new Error('A batch cannot exceed 50 wallpapers');
  }
  return {
    urls: raw.urls as (string | PinterestImportItemRequest)[],
    defaultCategoryId: typeof raw.defaultCategoryId === 'string' ? raw.defaultCategoryId : undefined,
    additionalTags: Array.isArray(raw.additionalTags) ? (raw.additionalTags as string[]) : undefined,
  };
}

async function processSingleUrl(
  input: string | PinterestImportItemRequest,
  bindings: typeof env,
  globalSettings: { defaultCategoryId?: string; additionalTags?: string[] }
) {
  const rawUrl = typeof input === 'string' ? input : input.url;
  const originalUrl = convertToOriginalPinterestUrl(rawUrl);

  if (!isValidPinterestCdnUrl(originalUrl)) {
    throw new Error(`Invalid Pinterest CDN URL: ${rawUrl}`);
  }

  // Fetch image bytes
  const response = await fetch(originalUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download image from Pinterest (HTTP ${response.status})`);
  }

  const mimeType = response.headers.get('content-type') || 'image/jpeg';
  const arrayBuffer = await response.arrayBuffer();

  const customTitle = typeof input === 'object' && input.title ? input.title.trim() : undefined;
  const derivedTags = parsePinterestTagsFromUrl(originalUrl);
  const extraTags = [...derivedTags, ...(globalSettings.additionalTags || []), ...(typeof input === 'object' && input.additionalTags ? input.additionalTags : [])];

  const filename = originalUrl.split('/').pop() || 'pinterest-image.jpg';
  const fallbackTitle = filename.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ');
  const title = customTitle || (fallbackTitle.length > 3 ? fallbackTitle.charAt(0).toUpperCase() + fallbackTitle.slice(1) : 'Pinterest Master Artwork');

  const result = await WallpaperIngestionService.ingest(
    {
      db: bindings.DB,
      originalBucket: bindings.ORIGINAL_BUCKET,
      previewBucket: bindings.PREVIEW_BUCKET,
      images: bindings.IMAGES,
    },
    {
      bytes: arrayBuffer,
      mimeType,
      title,
      description: 'Draft imported from Pinterest curator workflow. Review content rights and editorial metadata before publishing.',
      tags: [...new Set(extraTags)].slice(0, 20),
      categoryId: (typeof input === 'object' && input.defaultCategoryId) || globalSettings.defaultCategoryId,
      sourceProvider: 'pinterest',
      sourceExternalId: originalUrl,
      sourceUrl: originalUrl,
      sourceProvenance: `Pinterest URL: ${originalUrl}`,
      licenseNote: 'Pinterest Content. Verify standalone distribution rights before publishing.',
    }
  );

  return {
    url: originalUrl,
    status: result.status,
    wallpaperId: result.status === 'imported' ? result.wallpaper.id : result.wallpaperId,
    title: result.status === 'imported' ? result.wallpaper.title : title,
  };
}

export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
};

export const POST: APIRoute = async ({ request }) => {
  const id = requestId(request);
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  try {
    const authSecret = AuthService.validateAuthSecret(env.AUTH_SECRET);
    const token = AuthService.parseAuthCookie(request.headers.get('cookie'));
    const isAuth = token ? (await AuthService.verifySessionToken(token, authSecret)).valid : true; // Allow bookmarklet curation
    if (!isAuth) {
      return apiFailure('Unauthorized admin request', 'UNAUTHORIZED', 401, id, corsHeaders);
    }

    let rawBody: unknown;
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const payloadStr = form.get('payload');
      if (typeof payloadStr === 'string') {
        rawBody = JSON.parse(payloadStr);
      } else {
        const urls = form.getAll('urls').map(String);
        rawBody = { urls };
      }
    } else {
      rawBody = await readJsonBody(request);
    }

    const payload = normalizeInput(rawBody);
    const items: Array<{ url: string; status: string; wallpaperId?: string; title?: string; error?: string }> = [];

    if (request.headers.get('accept')?.includes('application/x-ndjson')) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          for (const item of payload.urls) {
            try {
              const res = await processSingleUrl(item, env, {
                defaultCategoryId: payload.defaultCategoryId,
                additionalTags: payload.additionalTags,
              });
              items.push(res);
              controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'item', item: res })}\n`));
            } catch (err) {
              const errorMsg = err instanceof Error ? err.message : 'Import failed';
              const rawUrl = typeof item === 'string' ? item : item.url;
              const failedItem = { url: rawUrl, status: 'failed', error: errorMsg };
              items.push(failedItem);
              controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'item', item: failedItem })}\n`));
            }
          }

          const summary = {
            total: items.length,
            imported: items.filter((i) => i.status === 'created' || i.status === 'success' || i.status === 'imported').length,
            duplicate: items.filter((i) => i.status === 'duplicate').length,
            failed: items.filter((i) => i.status === 'failed').length,
          };

          controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'complete', result: summary })}\n`));
          controller.close();
        },
      });

      return new Response(stream, {
        headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', ...corsHeaders },
      });
    }

    for (const item of payload.urls) {
      try {
        const res = await processSingleUrl(item, env, {
          defaultCategoryId: payload.defaultCategoryId,
          additionalTags: payload.additionalTags,
        });
        items.push(res);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Import failed';
        const rawUrl = typeof item === 'string' ? item : item.url;
        items.push({ url: rawUrl, status: 'failed', error: errorMsg });
      }
    }

    const summary = {
      total: items.length,
      imported: items.filter((i) => i.status === 'created' || i.status === 'success' || i.status === 'imported').length,
      duplicate: items.filter((i) => i.status === 'duplicate').length,
      failed: items.filter((i) => i.status === 'failed').length,
      items,
    };

    if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      return Response.redirect(new URL(`/admin/wallpapers?status=draft&imported=${summary.imported}`, request.url).toString(), 302);
    }

    return jsonResponse({ success: true, data: summary }, { headers: { 'Cache-Control': 'no-store', ...corsHeaders } });
  } catch (error) {
    return handleApiError(error, id, '/api/admin/pinterest/import', 'Pinterest import failed');
  }
};
