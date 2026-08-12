import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { apiFailure, handleApiError, HttpError, jsonResponse, readJsonBody, requestId } from '@/lib/http';
import { asObject, assertAllowedKeys, boundedString, requireId, uniqueStringArray } from '@/lib/validation';
import type { WallpaperStatus } from '@/types';
import { DBService } from '@worker/services/db.service';
import { WallpaperLifecycleService } from '@worker/services/wallpaper-lifecycle.service';

function routeId(value: string | undefined): string {
  const id = requireId(value, 'wallpaperId');
  if (!id.startsWith('wp_')) throw new HttpError('wallpaperId is invalid', 400, 'VALIDATION_ERROR');
  return id;
}

function optionalText(body: Record<string, unknown>, field: string, current?: string, max = 2000): string | null {
  if (!(field in body)) return current || null;
  return boundedString(body[field], field, { max, optional: true }) || null;
}

export const GET: APIRoute = async ({ params, request }) => {
  const id = requestId(request);
  try {
    const wallpaper = await DBService.getWallpaperById(env.DB, routeId(params.id));
    if (!wallpaper) return apiFailure('Wallpaper not found', 'NOT_FOUND', 404, id);
    return jsonResponse({ success: true, data: wallpaper });
  } catch (error) {
    return handleApiError(error, id, '/api/admin/wallpapers/:id', 'Could not load wallpaper');
  }
};

export const PUT: APIRoute = async ({ params, request }) => {
  const id = requestId(request);
  try {
    const wallpaperId = routeId(params.id);
    const existing = await DBService.getWallpaperById(env.DB, wallpaperId);
    if (!existing) return apiFailure('Wallpaper not found', 'NOT_FOUND', 404, id);
    const body = asObject(await readJsonBody(request));
    assertAllowedKeys(body, [
      'title', 'description', 'categoryId', 'status', 'isFeatured', 'creator',
      'sourceProvenance', 'licenseNote', 'tagIds',
    ]);
    const title = 'title' in body
      ? boundedString(body.title, 'title', { min: 1, max: 150 }) || ''
      : existing.title;
    const statusValue = body.status === undefined ? existing.status : body.status;
    if (typeof statusValue !== 'string' || !['draft', 'published', 'archived'].includes(statusValue)) {
      throw new HttpError('Invalid status', 400, 'VALIDATION_ERROR');
    }
    if (body.isFeatured !== undefined && typeof body.isFeatured !== 'boolean') {
      throw new HttpError('isFeatured must be a boolean', 400, 'VALIDATION_ERROR');
    }
    let categoryId = existing.categoryId || null;
    if ('categoryId' in body) {
      if (body.categoryId !== null && body.categoryId !== '') {
        categoryId = requireId(body.categoryId, 'categoryId');
        if (!categoryId.startsWith('cat_') || !(await DBService.getCategoryById(env.DB, categoryId))) {
          throw new HttpError('Unknown category', 400, 'VALIDATION_ERROR');
        }
      } else categoryId = null;
    }
    let tagIds: string[] | undefined;
    if ('tagIds' in body) {
      tagIds = uniqueStringArray(body.tagIds, 'tagIds', 20, 128);
      const known = new Set((await DBService.getTags(env.DB)).map((tag) => tag.id));
      if (tagIds.some((tagId) => !tagId.startsWith('tag_') || !known.has(tagId))) {
        throw new HttpError('Unknown tag', 400, 'VALIDATION_ERROR');
      }
    }
    const status = statusValue as WallpaperStatus;
    const update = {
      title,
      description: optionalText(body, 'description', existing.description),
      categoryId,
      status,
      isFeatured: body.isFeatured === undefined ? existing.isFeatured : body.isFeatured,
      creator: optionalText(body, 'creator', existing.creator, 200),
      sourceProvenance: optionalText(body, 'sourceProvenance', existing.sourceProvenance, 500),
      licenseNote: optionalText(body, 'licenseNote', existing.licenseNote, 500),
      tagIds,
    };
    if (status === 'published') {
      await WallpaperLifecycleService.assertPublishable(
        { db: env.DB, originalBucket: env.ORIGINAL_BUCKET, previewBucket: env.PREVIEW_BUCKET },
        {
          ...existing,
          title: update.title,
          description: update.description || undefined,
          categoryId: categoryId || undefined,
          status: update.status,
          isFeatured: update.isFeatured,
          creator: update.creator || undefined,
          sourceProvenance: update.sourceProvenance || undefined,
          licenseNote: update.licenseNote || undefined,
        }
      );
    }
    const updated = await DBService.updateWallpaperAtomic(env.DB, wallpaperId, update);
    return jsonResponse({ success: true, data: updated });
  } catch (error) {
    return handleApiError(error, id, '/api/admin/wallpapers/:id', 'Could not update wallpaper');
  }
};

export const DELETE: APIRoute = async ({ params, request }) => {
  const id = requestId(request);
  try {
    const wallpaper = await DBService.getWallpaperById(env.DB, routeId(params.id));
    if (!wallpaper) return apiFailure('Wallpaper not found', 'NOT_FOUND', 404, id);
    await WallpaperLifecycleService.safeDelete(
      { db: env.DB, originalBucket: env.ORIGINAL_BUCKET, previewBucket: env.PREVIEW_BUCKET },
      wallpaper
    );
    return jsonResponse({ success: true, message: 'Wallpaper deleted' });
  } catch (error) {
    return handleApiError(error, id, '/api/admin/wallpapers/:id', 'Delete could not be completed; the item remains archived');
  }
};
