import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { isPreviewAssetKey, PREVIEW_CACHE_CONTROL } from '@/lib/preview-assets';

const MIME_BY_EXTENSION: Record<string, string> = { avif: 'image/avif', webp: 'image/webp' };

function etagMatches(value: string | null, etag: string): boolean {
  if (!value) return false;
  return value.split(',').some((candidate) => candidate.trim() === etag || candidate.trim() === '*');
}

export const GET: APIRoute = async ({ params, request }) => {
  const key = params.key || '';
  if (!isPreviewAssetKey(key)) return new Response('Asset not found', { status: 404 });
  try {
    const object = await env.PREVIEW_BUCKET.get(key);
    if (!object) return new Response('Asset not found', { status: 404 });
    const expectedMime = MIME_BY_EXTENSION[key.split('.').pop() || ''];
    const storedMime = object.httpMetadata?.contentType;
    if (!expectedMime || (storedMime && storedMime !== expectedMime)) {
      return new Response('Asset unavailable', { status: 502 });
    }
    const etag = object.httpEtag || `"${object.etag}"`;
    if (etagMatches(request.headers.get('if-none-match'), etag)) {
      return new Response(null, {
        status: 304,
        headers: {
          'Cache-Control': PREVIEW_CACHE_CONTROL,
          'Content-Type': expectedMime,
          ETag: etag,
        },
      });
    }
    return new Response(object.body, {
      headers: {
        'Content-Type': expectedMime,
        'Content-Length': String(object.size),
        'Cache-Control': PREVIEW_CACHE_CONTROL,
        ETag: etag,
      },
    });
  } catch {
    return new Response('Asset unavailable', { status: 503 });
  }
};
