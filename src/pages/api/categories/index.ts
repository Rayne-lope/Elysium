import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { handleApiError, jsonResponse, requestId } from '@/lib/http';
import { DBService } from '@worker/services/db.service';

export const GET: APIRoute = async ({ request }) => {
  const id = requestId(request);
  try {
    return jsonResponse({ success: true, data: await DBService.getCategories(env.DB) });
  } catch (error) {
    return handleApiError(error, id, '/api/categories', 'Category service is unavailable', 503);
  }
};
