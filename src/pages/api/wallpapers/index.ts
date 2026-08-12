import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { handleApiError, jsonResponse, requestId } from '@/lib/http';
import { parseWallpaperFilters } from '@/lib/validation';
import { DBService } from '@worker/services/db.service';

export const GET: APIRoute = async ({ request }) => {
  const id = requestId(request);
  try {
    const filters = parseWallpaperFilters(new URL(request.url).searchParams, true);
    const result = await DBService.listWallpapers(env.DB, filters);
    return jsonResponse({ success: true, ...result });
  } catch (error) {
    return handleApiError(error, id, '/api/wallpapers', 'Wallpaper service is unavailable', 503);
  }
};
