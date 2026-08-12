import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { handleApiError, HttpError, jsonResponse, requestId } from '@/lib/http';
import { parseWallpaperUpload } from '@/lib/upload-validation';
import { WallpaperIngestionService } from '@worker/services/ingestion.service';

export const POST: APIRoute = async ({ request }) => {
  const id = requestId(request);
  try {
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (Number.isFinite(contentLength) && contentLength > 95 * 1024 * 1024) {
      throw new HttpError('Upload request is too large', 413, 'BODY_TOO_LARGE');
    }
    const form = await request.formData();
    const file = form.get('originalFile');
    const fallback = file instanceof File
      ? file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim()
      : undefined;
    const upload = await parseWallpaperUpload(form, fallback || 'Untitled Wallpaper');
    const result = await WallpaperIngestionService.ingest({
      db: env.DB, originalBucket: env.ORIGINAL_BUCKET, previewBucket: env.PREVIEW_BUCKET, images: env.IMAGES,
    }, {
      bytes: await upload.file.arrayBuffer(), mimeType: upload.mimeType, title: upload.title,
      categoryId: upload.categoryId, status: upload.status, isFeatured: upload.isFeatured,
      declaredWidth: upload.declaredWidth, declaredHeight: upload.declaredHeight,
      providedPreviews: upload.providedPreviews,
    });
    if (result.status === 'duplicate') {
      return jsonResponse({
        success: false, error: result.reason, code: 'DUPLICATE', requestId: id, isDuplicate: true,
      }, { status: 409 });
    }
    return jsonResponse({ success: true, data: result.wallpaper }, { status: 201 });
  } catch (error) {
    return handleApiError(error, id, '/api/admin/wallpapers/bulk', 'Bulk upload failed');
  }
};
