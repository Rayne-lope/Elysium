import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { apiFailure, handleApiError, jsonResponse, readJsonBody, requestId } from '@/lib/http';
import { asObject, assertAllowedKeys, boundedString } from '@/lib/validation';
import { generateSlug } from '@/lib/metadata';
import { DBService } from '@worker/services/db.service';

export const GET: APIRoute = async ({ request }) => {
  const id = requestId(request);
  try {
    return jsonResponse({ success: true, data: await DBService.getTags(env.DB) });
  } catch (error) {
    return handleApiError(error, id, '/api/admin/tags', 'Could not load tags');
  }
};

export const POST: APIRoute = async ({ request }) => {
  const id = requestId(request);
  try {
    const body = asObject(await readJsonBody(request));
    assertAllowedKeys(body, ['name']);
    const name = boundedString(body.name, 'name', { min: 1, max: 50 }) || '';
    const slug = generateSlug(name);
    const existing = (await DBService.getTags(env.DB)).find(
      (tag) => tag.slug === slug || tag.name.toLowerCase() === name.toLowerCase()
    );
    if (existing) return apiFailure(`Tag "${name}" already exists`, 'TAG_CONFLICT', 409, id);
    const tag = await DBService.createTag(env.DB, {
      id: `tag_${slug.slice(0, 40)}_${crypto.randomUUID().slice(0, 6)}`,
      slug,
      name,
    });
    return jsonResponse({ success: true, data: tag }, { status: 201 });
  } catch (error) {
    return handleApiError(error, id, '/api/admin/tags', 'Could not create tag');
  }
};
