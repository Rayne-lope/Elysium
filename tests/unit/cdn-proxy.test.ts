import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from 'cloudflare:workers';
import { GET } from '../../src/pages/cdn-proxy/[...key]';
import { PREVIEW_CACHE_CONTROL } from '../../src/lib/preview-assets';

const key = 'preview/wp_test/480.webp';

function context(request: Request, assetKey = key): Parameters<typeof GET>[0] {
  return {
    params: { key: assetKey },
    request,
  } as unknown as Parameters<typeof GET>[0];
}

function previewObject(): R2ObjectBody {
  const bytes = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
  return {
    size: bytes.byteLength,
    etag: 'test-etag',
    httpEtag: '"test-etag"',
    httpMetadata: { contentType: 'image/webp' },
    body: new Response(bytes).body,
  } as unknown as R2ObjectBody;
}

afterEach(() => {
  Reflect.deleteProperty(env, 'PREVIEW_BUCKET');
});

describe('preview CDN proxy', () => {
  it('serves numeric WebP variants with immutable caching', async () => {
    env.PREVIEW_BUCKET = { get: vi.fn(async () => previewObject()) } as unknown as R2Bucket;
    const response = await GET(context(new Request(`https://example.com/cdn-proxy/${key}`)));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(response.headers.get('cache-control')).toBe(PREVIEW_CACHE_CONTROL);
  });

  it('returns cache metadata with a matching 304 response', async () => {
    env.PREVIEW_BUCKET = { get: vi.fn(async () => previewObject()) } as unknown as R2Bucket;
    const response = await GET(context(new Request(`https://example.com/cdn-proxy/${key}`, {
      headers: { 'If-None-Match': '"test-etag"' },
    })));
    expect(response.status).toBe(304);
    expect(response.headers.get('etag')).toBe('"test-etag"');
    expect(response.headers.get('cache-control')).toBe(PREVIEW_CACHE_CONTROL);
  });

  it('rejects original and traversal keys before reading R2', async () => {
    const get = vi.fn();
    env.PREVIEW_BUCKET = { get } as unknown as R2Bucket;
    const original = await GET(context(new Request('https://example.com/cdn-proxy/original/x.jpg'), 'original/wp_test/original.jpg'));
    const traversal = await GET(context(new Request('https://example.com/cdn-proxy/x'), 'preview/wp_test/../../original.jpg'));
    expect(original.status).toBe(404);
    expect(traversal.status).toBe(404);
    expect(get).not.toHaveBeenCalled();
  });
});
