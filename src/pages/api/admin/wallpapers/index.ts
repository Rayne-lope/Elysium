import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { handleApiError, HttpError, jsonResponse, requestId } from '@/lib/http';
import { parseWallpaperUpload } from '@/lib/upload-validation';
import { parseWallpaperFilters } from '@/lib/validation';
import type { WallpaperStatus } from '@/types';
import { DBService } from '@worker/services/db.service';
import { WallpaperIngestionService } from '@worker/services/ingestion.service';

const MAX_MULTIPART_BYTES = 95 * 1024 * 1024;

export const GET: APIRoute = async ({ request }) => {
  const id = requestId(request);
  try {
    const url = new URL(request.url);
    const filters = parseWallpaperFilters(url.searchParams, false);
    const status = url.searchParams.get('status');
    if (status && !['draft', 'published', 'archived'].includes(status)) {
      throw new HttpError('Invalid status', 400, 'VALIDATION_ERROR');
    }
    const result = await DBService.listWallpapers(env.DB, {
      ...filters,
      status: status as WallpaperStatus | undefined,
    });
    return jsonResponse({ success: true, ...result });
  } catch (error) {
    return handleApiError(error, id, '/api/admin/wallpapers', 'Could not load wallpapers');
  }
};

export const POST: APIRoute = async ({ request }) => {
  const id = requestId(request);
  try {
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BYTES) {
      throw new HttpError('Upload request is too large', 413, 'BODY_TOO_LARGE');
    }
    const upload = await parseWallpaperUpload(await request.formData());
    const result = await WallpaperIngestionService.ingest({
      db: env.DB,
      originalBucket: env.ORIGINAL_BUCKET,
      previewBucket: env.PREVIEW_BUCKET,
      images: env.IMAGES,
    }, {
      bytes: await upload.file.arrayBuffer(),
      mimeType: upload.mimeType,
      title: upload.title,
      description: upload.description,
      creator: upload.creator,
      categoryId: upload.categoryId,
      tagIds: upload.tagIds,
      sourceProvenance: upload.sourceProvenance,
      licenseNote: upload.licenseNote,
      status: upload.status,
      isFeatured: upload.isFeatured,
      declaredWidth: upload.declaredWidth,
      declaredHeight: upload.declaredHeight,
      providedPreviews: upload.providedPreviews,
    });
    if (result.status === 'duplicate') {
      return jsonResponse({
        success: false, error: result.reason, code: 'DUPLICATE', requestId: id, isDuplicate: true,
      }, { status: 409 });
    }
    return jsonResponse({ success: true, data: result.wallpaper }, { status: 201 });
  } catch (error) {
    return handleApiError(error, id, '/api/admin/wallpapers', 'Upload failed');
  }
};
