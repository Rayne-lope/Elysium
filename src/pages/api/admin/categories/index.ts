import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { apiFailure, handleApiError, jsonResponse, readJsonBody, requestId } from '@/lib/http';
import { asObject, assertAllowedKeys, boundedString } from '@/lib/validation';
import { generateSlug } from '@/lib/metadata';
import { DBService } from '@worker/services/db.service';

export const GET: APIRoute = async ({ request }) => {
  const id = requestId(request);
  try {
    return jsonResponse({ success: true, data: await DBService.getCategories(env.DB) });
  } catch (error) {
    return handleApiError(error, id, '/api/admin/categories', 'Could not load categories');
  }
};

export const POST: APIRoute = async ({ request }) => {
  const id = requestId(request);
  try {
    const body = asObject(await readJsonBody(request));
    assertAllowedKeys(body, ['name', 'description']);
    const name = boundedString(body.name, 'name', { min: 1, max: 100 }) || '';
    const description = boundedString(body.description, 'description', { max: 500, optional: true });
    const slug = generateSlug(name);
    if (await DBService.getCategoryBySlug(env.DB, slug)) {
      return apiFailure(`Category "${name}" already exists`, 'CATEGORY_CONFLICT', 409, id);
    }
    const category = await DBService.createCategory(env.DB, {
      id: `cat_${slug.slice(0, 40)}`,
      slug,
      name,
      description,
    });
    return jsonResponse({ success: true, data: category }, { status: 201 });
  } catch (error) {
    return handleApiError(error, id, '/api/admin/categories', 'Could not create category');
  }
};
