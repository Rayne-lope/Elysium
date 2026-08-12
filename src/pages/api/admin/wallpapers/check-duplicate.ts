import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { handleApiError, HttpError, jsonResponse, readJsonBody, requestId } from '@/lib/http';
import { asObject, assertAllowedKeys } from '@/lib/validation';
import { DBService } from '@worker/services/db.service';

export const POST: APIRoute = async ({ request }) => {
  const id = requestId(request);
  try {
    const body = asObject(await readJsonBody(request));
    assertAllowedKeys(body, ['fileHash']);
    if (typeof body.fileHash !== 'string' || !/^[a-f0-9]{64}$/i.test(body.fileHash)) {
      throw new HttpError('fileHash must be a SHA-256 hexadecimal digest', 400, 'VALIDATION_ERROR');
    }
    const existing = await DBService.checkDuplicateHash(env.DB, body.fileHash.toLowerCase());
    return jsonResponse({
      success: true,
      isDuplicate: Boolean(existing),
      existingWallpaper: existing ? { id: existing.id, title: existing.title, slug: existing.slug } : null,
    });
  } catch (error) {
    return handleApiError(error, id, '/api/admin/wallpapers/check-duplicate', 'Duplicate check failed');
  }
};
