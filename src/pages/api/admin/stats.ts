import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { handleApiError, jsonResponse, requestId } from '@/lib/http';
import { DBService } from '@worker/services/db.service';

export const GET: APIRoute = async ({ request }) => {
  const id = requestId(request);
  try {
    const [totalRow, publishedRow, draftRow, downloadRow, categoriesRow, recentResult] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) as count FROM wallpapers').first<{ count: number }>(),
      env.DB.prepare("SELECT COUNT(*) as count FROM wallpapers WHERE status = 'published'").first<{ count: number }>(),
      env.DB.prepare("SELECT COUNT(*) as count FROM wallpapers WHERE status = 'draft'").first<{ count: number }>(),
      env.DB.prepare('SELECT SUM(download_count) as total FROM wallpapers').first<{ total: number }>(),
      env.DB.prepare('SELECT COUNT(*) as count FROM categories').first<{ count: number }>(),
      DBService.listWallpapers(env.DB, { limit: 5, page: 1, sortBy: 'newest' }),
    ]);
    return jsonResponse({
      success: true,
      data: {
        totalWallpapers: totalRow?.count || 0,
        publishedCount: publishedRow?.count || 0,
        draftCount: draftRow?.count || 0,
        totalDownloads: downloadRow?.total || 0,
        totalCategories: categoriesRow?.count || 0,
        recentWallpapers: recentResult.wallpapers,
      },
    });
  } catch (error) {
    return handleApiError(error, id, '/api/admin/stats', 'Could not load statistics');
  }
};
