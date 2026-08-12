import { describe, expect, it, vi } from 'vitest';
import { calculateSHA256 } from '../../src/lib/metadata';
import { inspectImageHeader } from '../../src/lib/image-inspector';
import { isSameOriginRequest, readJsonBody, requestId } from '../../src/lib/http';
import { parseWallpaperFilters } from '../../src/lib/validation';
import { PixabayService, type PixabayCacheStore } from '../../src/services/pixabay/pixabay.service';
import type { PixabayApiImage, PixabaySearchParams } from '../../src/services/pixabay/pixabay.types';
import { PixabayApiCache } from '../../worker/services/pixabay-cache.service';
import { RateLimitService } from '../../worker/services/rate-limit.service';
import { R2StorageService } from '../../worker/services/r2.service';
import { SecurityService } from '../../worker/services/security.service';

const params: PixabaySearchParams = {
  q: 'mountain', page: 1, perPage: 3, orientation: 'all', minWidth: 0, minHeight: 0, order: 'popular',
};

const hit: PixabayApiImage = {
  id: 1, pageURL: 'https://pixabay.com/photos/test-1/', type: 'photo', tags: 'mountain',
  previewURL: 'https://cdn.pixabay.com/photo/preview.jpg', previewWidth: 100, previewHeight: 60,
  webformatURL: 'https://cdn.pixabay.com/photo/web.jpg', webformatWidth: 640, webformatHeight: 384,
  largeImageURL: 'https://cdn.pixabay.com/photo/large.jpg', imageURL: 'https://pixabay.com/get/original.jpg',
  imageWidth: 3000, imageHeight: 2000, imageSize: 1000, views: 2, downloads: 1, likes: 1,
  user_id: 9, user: 'maker',
};

describe('request hardening', () => {
  it('reuses one request ID across middleware and route handling', () => {
    const request = new Request('https://example.com/api');
    expect(requestId(request)).toBe(requestId(request));
  });

  it('accepts only exact same-origin CSRF headers', () => {
    expect(isSameOriginRequest(new Request('https://example.com/api/admin/x', {
      method: 'POST', headers: { Origin: 'https://example.com' },
    }))).toBe(true);
    expect(isSameOriginRequest(new Request('https://example.com/api/admin/x', {
      method: 'POST', headers: { Origin: 'https://example.com.evil.test' },
    }))).toBe(false);
    expect(isSameOriginRequest(new Request('https://example.com/api/admin/x', { method: 'POST' }))).toBe(false);
  });

  it('rejects JSON bodies larger than the streaming limit', async () => {
    const request = new Request('https://example.com/api', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ x: 'a'.repeat(100) }),
    });
    await expect(readJsonBody(request, 32)).rejects.toMatchObject({ status: 413, code: 'BODY_TOO_LARGE' });
  });

  it('validates public pagination, enums, and query length', () => {
    expect(() => parseWallpaperFilters(new URLSearchParams('page=0'))).toThrow();
    expect(() => parseWallpaperFilters(new URLSearchParams('limit=51'))).toThrow();
    expect(() => parseWallpaperFilters(new URLSearchParams('orientation=diagonal'))).toThrow();
    expect(() => parseWallpaperFilters(new URLSearchParams(`q=${'x'.repeat(101)}`))).toThrow();
    expect(() => parseWallpaperFilters(new URLSearchParams('debug=true'))).toThrow(/Unexpected/);
  });
});

describe('binary hardening', () => {
  it('reads PNG dimensions from the correct typed-array offset', () => {
    const bytes = new Uint8Array(40);
    const png = bytes.subarray(5, 29);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    png.set([0x49, 0x48, 0x44, 0x52], 12);
    new DataView(bytes.buffer).setUint32(5 + 16, 1920);
    new DataView(bytes.buffer).setUint32(5 + 20, 1080);
    expect(inspectImageHeader(png)).toEqual({ mimeType: 'image/png', width: 1920, height: 1080 });
  });

  it('hashes only the supplied typed-array view', async () => {
    const backing = new TextEncoder().encode('xxabczz');
    const view = backing.subarray(2, 5);
    expect(await calculateSHA256(view)).toBe(await calculateSHA256(new TextEncoder().encode('abc')));
  });

  it('rejects signatures without bounded dimensions', () => {
    expect(() => inspectImageHeader(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toThrow(/dimensions/);
  });
});

describe('Pixabay upstream and cache hardening', () => {
  it('never exposes the original asset URL in search DTOs', async () => {
    const service = new PixabayService('key', vi.fn(async () => Response.json({ total: 1, totalHits: 1, hits: [hit] })) as typeof fetch);
    const result = await service.search(params);
    expect(result.images[0]).not.toHaveProperty('sourceAssetUrl');
    expect(result.meta.cache).toBe('miss');
  });

  it('rejects malformed upstream payloads', async () => {
    const service = new PixabayService('key', vi.fn(async () => Response.json({ total: 1, totalHits: 1, hits: [{ id: 1 }] })) as typeof fetch);
    await expect(service.search(params)).rejects.toThrow(/metadata|URL/);
  });

  it('uses a stale cache only after bounded upstream failure', async () => {
    const cache: PixabayCacheStore = {
      get: vi.fn(async () => ({ payload: { total: 1, totalHits: 1, hits: [hit] }, fresh: false })),
      set: vi.fn(),
    };
    const fetcher = vi.fn(async () => new Response('unavailable', { status: 503 }));
    const service = new PixabayService('key', fetcher as typeof fetch, cache, async () => {});
    expect((await service.search(params)).meta.cache).toBe('stale');
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('honors a fresh cache without calling upstream', async () => {
    const cache: PixabayCacheStore = {
      get: vi.fn(async () => ({ payload: { total: 1, totalHits: 1, hits: [hit] }, fresh: true })),
      set: vi.fn(),
    };
    const fetcher = vi.fn();
    expect((await new PixabayService('key', fetcher as typeof fetch, cache).search(params)).meta.cache).toBe('hit');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('stores fresh D1 cache entries and expires them after the stale window', async () => {
    let now = Date.parse('2026-08-10T00:00:00Z');
    let row: { payload_json: string; expires_at: string } | null = null;
    let deleted = false;
    const db = {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            return {
              async first() { return sql.startsWith('SELECT') ? row : null; },
              async run() {
                if (sql.includes('INSERT INTO')) row = { payload_json: String(values[1]), expires_at: String(values[3]) };
                if (sql.startsWith('DELETE')) { row = null; deleted = true; }
                return {};
              },
            };
          },
        };
      },
    } as unknown as D1Database;
    const cache = new PixabayApiCache(db, () => now);
    await cache.set('search:key', { ok: true });
    expect(await cache.get('search:key')).toEqual({ payload: { ok: true }, fresh: true });
    now += 25 * 60 * 60 * 1000;
    expect((await cache.get('search:key'))?.fresh).toBe(false);
    now += 8 * 24 * 60 * 60 * 1000;
    expect(await cache.get('search:key')).toBeNull();
    expect(deleted).toBe(true);
  });
});

describe('download and rate-limit hardening', () => {
  it('parses single ranges and rejects multiple or unsatisfiable ranges', () => {
    expect(SecurityService.parseSingleRange('bytes=10-19', 100)).toEqual({ offset: 10, end: 19, length: 10 });
    expect(SecurityService.parseSingleRange('bytes=-10', 100)).toEqual({ offset: 90, end: 99, length: 10 });
    expect(() => SecurityService.parseSingleRange('bytes=0-1,4-5', 100)).toThrow();
    expect(() => SecurityService.parseSingleRange('bytes=100-', 100)).toThrow();
  });

  it('emits an ASCII fallback plus RFC 5987 Unicode filename', () => {
    const value = R2StorageService.generateDownloadHeaders('Gunung 日本', 'jpg', 'image/jpeg')['Content-Disposition'];
    expect(value).toContain('filename="Gunung-.jpg"');
    expect(value).toContain("filename*=UTF-8''Gunung-%E6%97%A5%E6%9C%AC.jpg");
  });

  it('persists a hashed rate-limit identity', async () => {
    let count = 0;
    let bound: unknown[] = [];
    const db = {
      prepare() {
        return { bind(...values: unknown[]) {
          bound = values;
          return { async first() { count += 1; return { request_count: count, window_started_at: Math.floor(Date.now() / 1000) }; } };
        } };
      },
    } as unknown as D1Database;
    const secret = 'rate-limit-secret-that-is-at-least-32-bytes';
    expect((await RateLimitService.consume(db, 'login', '203.0.113.4', secret, { limit: 1, windowSeconds: 60 })).allowed).toBe(true);
    expect((await RateLimitService.consume(db, 'login', '203.0.113.4', secret, { limit: 1, windowSeconds: 60 })).allowed).toBe(false);
    expect(String(bound[1])).not.toContain('203.0.113.4');
  });
});
