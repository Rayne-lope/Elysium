import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { apiFailure, handleApiError, HttpError, jsonResponse, readJsonBody, requestId } from '@/lib/http';
import { asObject, assertAllowedKeys, requireId, uniqueStringArray } from '@/lib/validation';
import { DBService } from '@worker/services/db.service';
import { WallpaperLifecycleService } from '@worker/services/wallpaper-lifecycle.service';

type BulkAction = 'publish' | 'set_category' | 'add_tag' | 'remove_tag' | 'delete';
interface ItemResult { id: string; success: boolean; error?: string }

async function mutateOne(id: string, action: BulkAction, value: unknown): Promise<void> {
  const wallpaper = await DBService.getWallpaperById(env.DB, id);
  if (!wallpaper) throw new HttpError('Wallpaper not found', 404, 'NOT_FOUND');
  if (action === 'publish') {
    await WallpaperLifecycleService.assertPublishable(
      { db: env.DB, originalBucket: env.ORIGINAL_BUCKET, previewBucket: env.PREVIEW_BUCKET },
      wallpaper
    );
    await DBService.bulkSetStatus(env.DB, [id], 'published');
  } else if (action === 'set_category') {
    const categoryId = value === null || value === '' ? null : requireId(value, 'categoryId');
    if (categoryId && (!categoryId.startsWith('cat_') || !(await DBService.getCategoryById(env.DB, categoryId)))) {
      throw new HttpError('Category not found', 404, 'NOT_FOUND');
    }
    await DBService.bulkSetCategory(env.DB, [id], categoryId);
  } else if (action === 'add_tag' || action === 'remove_tag') {
    const tagId = requireId(value, 'tagId');
    if (!tagId.startsWith('tag_') || !(await DBService.getTags(env.DB)).some((tag) => tag.id === tagId)) {
      throw new HttpError('Tag not found', 404, 'NOT_FOUND');
    }
    await DBService.bulkUpdateTag(env.DB, [id], tagId, action === 'add_tag' ? 'add' : 'remove');
  } else {
    await WallpaperLifecycleService.safeDelete(
      { db: env.DB, originalBucket: env.ORIGINAL_BUCKET, previewBucket: env.PREVIEW_BUCKET },
      wallpaper
    );
  }
}

export const POST: APIRoute = async ({ request }) => {
  const requestIdentifier = requestId(request);
  try {
    const body = asObject(await readJsonBody(request));
    assertAllowedKeys(body, ['wallpaperIds', 'action', 'value']);
    const ids = uniqueStringArray(body.wallpaperIds, 'wallpaperIds', 100, 128);
    if (ids.length === 0 || ids.some((id) => !id.startsWith('wp_'))) {
      throw new HttpError('Select valid wallpapers', 400, 'VALIDATION_ERROR');
    }
    const action = body.action;
    if (typeof action !== 'string' || !['publish', 'set_category', 'add_tag', 'remove_tag', 'delete'].includes(action)) {
      throw new HttpError('Invalid bulk action', 400, 'VALIDATION_ERROR');
    }
    const queue = [...ids];
    const items: ItemResult[] = [];
    const worker = async () => {
      while (queue.length) {
        const id = queue.shift();
        if (!id) return;
        try {
          await mutateOne(id, action as BulkAction, body.value);
          items.push({ id, success: true });
        } catch (error) {
          items.push({ id, success: false, error: error instanceof Error ? error.message : 'Action failed' });
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    const updated = items.filter((item) => item.success).length;
    return jsonResponse({ success: updated === ids.length, updated, failed: ids.length - updated, items });
  } catch (error) {
    if (error instanceof HttpError) {
      return apiFailure(error.message, error.code, error.status, requestIdentifier);
    }
    return handleApiError(error, requestIdentifier, '/api/admin/wallpapers/actions', 'Bulk action failed');
  }
};
