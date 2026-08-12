import type { APIRoute } from 'astro';
import { apiFailure, handleApiError, jsonResponse, readJsonBody, requestId } from '@/lib/http';
import { asObject, assertAllowedKeys, boundedString, optionalId, uniqueStringArray } from '@/lib/validation';
import { env } from 'cloudflare:workers';
import { PIXABAY_MAX_IMPORT_BATCH } from '@/services/pixabay/pixabay.constants';
import { PixabayService } from '@/services/pixabay/pixabay.service';
import type {
  PixabayImportItemResult,
  PixabayImportRequest,
  PixabayImportResult,
} from '@/services/pixabay/pixabay.types';
import { PixabayImportService } from '@worker/services/pixabay-import.service';
import { AuthService } from '@worker/services/auth.service';
import { PixabayApiCache } from '@worker/services/pixabay-cache.service';
import { clientIdentity, RateLimitService } from '@worker/services/rate-limit.service';

const IMPORT_PACING_MS = 1_000;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function validateRequest(value: unknown): PixabayImportRequest {
  const candidate = asObject(value);
  assertAllowedKeys(candidate, ['images', 'settings']);
  if (!Array.isArray(candidate.images) || candidate.images.length === 0) throw new Error('Select at least one image');
  if (candidate.images.length > PIXABAY_MAX_IMPORT_BATCH) {
    throw new Error(`A batch cannot exceed ${PIXABAY_MAX_IMPORT_BATCH} images`);
  }
  const ids = candidate.images.map((item) => {
    const image = asObject(item);
    assertAllowedKeys(image, ['pixabayId']);
    return image.pixabayId;
  });
  if (ids.some((id) => !Number.isSafeInteger(id) || Number(id) <= 0)) throw new Error('Invalid Pixabay ID');
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate Pixabay IDs in request');
  const rawSettings = candidate.settings === undefined ? {} : asObject(candidate.settings);
  assertAllowedKeys(rawSettings, ['defaultCategoryId', 'sourceCategory', 'additionalTags']);
  const additionalTags = uniqueStringArray(rawSettings.additionalTags, 'additionalTags', 20, 50);
  const settings: NonNullable<PixabayImportRequest['settings']> = {
    defaultCategoryId: optionalId(rawSettings.defaultCategoryId, 'defaultCategoryId', 'cat'),
    sourceCategory: boundedString(rawSettings.sourceCategory, 'sourceCategory', { max: 50, optional: true }),
    additionalTags,
  };
  return { images: ids.map((pixabayId) => ({ pixabayId: Number(pixabayId) })), settings };
}

function summarize(items: PixabayImportItemResult[]): PixabayImportResult {
  return {
    imported: items.filter((item) => item.status === 'imported').length,
    duplicate: items.filter((item) => item.status === 'duplicate').length,
    failed: items.filter((item) => item.status === 'failed').length,
    total: items.length,
    items,
  };
}

export async function processWithLimit(
  request: PixabayImportRequest,
  importer: PixabayImportService,
  onItem?: (item: PixabayImportItemResult) => void,
  options: { intervalMilliseconds?: number; sleeper?: (milliseconds: number) => Promise<void> } = {}
): Promise<PixabayImportItemResult[]> {
  const results: PixabayImportItemResult[] = [];
  // Pixabay rate limits by API key. Keep metadata requests serial so one
  // curated batch cannot create a burst of parallel detail lookups.
  for (const image of request.images) {
    let result: PixabayImportItemResult;
    try {
      result = await importer.importOne(image.pixabayId, request.settings);
    } catch (error) {
      result = {
        pixabayId: image.pixabayId,
        status: 'failed',
        reason: error instanceof Error ? error.message : 'Import failed',
      };
    }
    results.push(result);
    onItem?.(result);
    if (results.length < request.images.length && (options.intervalMilliseconds || 0) > 0) {
      await (options.sleeper || delay)(options.intervalMilliseconds || 0);
    }
  }
  return results;
}

export const POST: APIRoute = async ({ request }) => {
  const id = requestId(request);
  if (!env.DB || !env.ORIGINAL_BUCKET || !env.PREVIEW_BUCKET || !env.IMAGES) {
    return apiFailure('Required Cloudflare bindings are missing', 'SERVER_MISCONFIGURED', 503, id);
  }

  try {
    const authSecret = AuthService.validateAuthSecret(env.AUTH_SECRET);
    const identity = AuthService.parseAuthCookie(request.headers.get('cookie')) || clientIdentity(request);
    const rate = await RateLimitService.consume(
      env.DB,
      'pixabay-import',
      identity,
      authSecret,
      { limit: 5, windowSeconds: 60 }
    );
    if (!rate.allowed) {
      return apiFailure('Import rate limit reached. Try again shortly.', 'RATE_LIMITED', 429, id, {
        'Retry-After': String(rate.retryAfter),
      });
    }
    const body = validateRequest(await readJsonBody(request));
    const apiKey = env.PIXABAY_API_KEY || '';
    const importer = new PixabayImportService(new PixabayService(apiKey, fetch, new PixabayApiCache(env.DB)), {
      db: env.DB,
      originalBucket: env.ORIGINAL_BUCKET,
      previewBucket: env.PREVIEW_BUCKET,
      images: env.IMAGES,
    });

    if (request.headers.get('accept')?.includes('application/x-ndjson')) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          void processWithLimit(body, importer, (item) => {
            controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'item', item })}\n`));
          }, { intervalMilliseconds: IMPORT_PACING_MS }).then((items) => {
            controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'complete', result: summarize(items) })}\n`));
            controller.close();
          }).catch((error) => controller.error(error));
        },
      });
      return new Response(stream, {
        headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' },
      });
    }

    const items = await processWithLimit(body, importer, undefined, { intervalMilliseconds: IMPORT_PACING_MS });
    return jsonResponse({ success: true, data: summarize(items) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof Error && /^(Invalid|Select|A batch|Duplicate|Too many|Unknown|.*required|.*cannot exceed)/i.test(error.message)) {
      return apiFailure(error.message, 'INVALID_REQUEST', 400, id);
    }
    return handleApiError(error, id, '/api/admin/pixabay/import', 'Import failed');
  }
};
