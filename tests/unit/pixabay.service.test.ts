import { describe, expect, it, vi } from 'vitest';
import { parsePixabaySearchParams, PixabayService } from '../../src/services/pixabay/pixabay.service';

describe('Pixabay service', () => {
  it('validates and bounds admin search parameters', () => {
    const params = parsePixabaySearchParams(new URLSearchParams('q=dark+mountain&page=2&per_page=24&orientation=horizontal&min_width=3840&order=popular'));
    expect(params).toMatchObject({ q: 'dark mountain', page: 2, perPage: 24, orientation: 'horizontal', minWidth: 3840 });
    expect(() => parsePixabaySearchParams(new URLSearchParams(`q=${'x'.repeat(101)}`))).toThrow('cannot exceed');
    expect(() => parsePixabaySearchParams(new URLSearchParams('per_page=200'))).toThrow('between 3 and 50');
  });

  it('keeps the API key inside the server request and maps the response', async () => {
    let requestedUrl = '';
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({
        total: 1,
        totalHits: 1,
        hits: [{
          id: 7, pageURL: 'https://pixabay.com/photos/x-7/', type: 'photo', tags: 'night, city',
          previewURL: 'https://cdn.pixabay.com/x.jpg', previewWidth: 150, previewHeight: 100,
          webformatURL: 'https://pixabay.com/get/x_640.jpg', webformatWidth: 640, webformatHeight: 427,
          largeImageURL: 'https://pixabay.com/get/x_1280.jpg', imageWidth: 3000, imageHeight: 2000,
          imageSize: 1000, views: 2, downloads: 1, likes: 1, user_id: 9, user: 'maker',
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const service = new PixabayService('server-secret', fetcher as typeof fetch);
    const data = await service.search(parsePixabaySearchParams(new URLSearchParams('q=night')));
    expect(requestedUrl).toContain('key=server-secret');
    expect(JSON.stringify(data)).not.toContain('server-secret');
    expect(data.images[0].title).toBe('Night City');
  });

  it('waits for the Pixabay reset window before retrying a rate-limited request', async () => {
    const hit = {
      id: 7, pageURL: 'https://pixabay.com/photos/x-7/', type: 'photo', tags: 'night, city',
      previewURL: 'https://cdn.pixabay.com/x.jpg', previewWidth: 150, previewHeight: 100,
      webformatURL: 'https://pixabay.com/get/x_640.jpg', webformatWidth: 640, webformatHeight: 427,
      largeImageURL: 'https://pixabay.com/get/x_1280.jpg', imageWidth: 3000, imageHeight: 2000,
      imageSize: 1000, views: 2, downloads: 1, likes: 1, user_id: 9, user: 'maker',
    };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('Rate limit exceeded', {
        status: 429,
        headers: { 'X-RateLimit-Reset': '12' },
      }))
      .mockResolvedValueOnce(Response.json({ total: 1, totalHits: 1, hits: [hit] }));
    const sleeper = vi.fn(async () => {});
    const service = new PixabayService('server-secret', fetcher as typeof fetch, undefined, sleeper);

    await expect(service.getImageById(7)).resolves.toMatchObject({ pixabayId: 7 });
    expect(sleeper).toHaveBeenCalledTimes(1);
    expect(sleeper).toHaveBeenCalledWith(13_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('pauses the next uncached request when the current response exhausts the quota', async () => {
    const makeHit = (id: number) => ({
      id, pageURL: `https://pixabay.com/photos/x-${id}/`, type: 'photo', tags: 'night, city',
      previewURL: 'https://cdn.pixabay.com/x.jpg', previewWidth: 150, previewHeight: 100,
      webformatURL: 'https://pixabay.com/get/x_640.jpg', webformatWidth: 640, webformatHeight: 427,
      largeImageURL: 'https://pixabay.com/get/x_1280.jpg', imageWidth: 3000, imageHeight: 2000,
      imageSize: 1000, views: 2, downloads: 1, likes: 1, user_id: 9, user: 'maker',
    });
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json(
        { total: 1, totalHits: 1, hits: [makeHit(7)] },
        { headers: { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '4' } }
      ))
      .mockResolvedValueOnce(Response.json({ total: 1, totalHits: 1, hits: [makeHit(8)] }));
    const sleeper = vi.fn(async () => {});
    const service = new PixabayService('server-secret', fetcher as typeof fetch, undefined, sleeper);

    await service.getImageById(7);
    await service.getImageById(8);

    expect(sleeper).toHaveBeenCalledTimes(1);
    expect(sleeper).toHaveBeenCalledWith(5_000);
  });

  it('seeds per-image cache entries from search results for later imports', async () => {
    const hit = {
      id: 7, pageURL: 'https://pixabay.com/photos/x-7/', type: 'photo', tags: 'night, city',
      previewURL: 'https://cdn.pixabay.com/x.jpg', previewWidth: 150, previewHeight: 100,
      webformatURL: 'https://pixabay.com/get/x_640.jpg', webformatWidth: 640, webformatHeight: 427,
      largeImageURL: 'https://pixabay.com/get/x_1280.jpg', imageWidth: 3000, imageHeight: 2000,
      imageSize: 1000, views: 2, downloads: 1, likes: 1, user_id: 9, user: 'maker',
    };
    const values = new Map<string, unknown>();
    const cache = {
      async get(key: string) {
        const payload = values.get(key);
        return payload ? { payload, fresh: true } : null;
      },
      async set(key: string, payload: unknown) { values.set(key, payload); },
      async setMany(entries: Array<{ key: string; payload: unknown }>) {
        for (const entry of entries) values.set(entry.key, entry.payload);
      },
    };
    const fetcher = vi.fn(async () => Response.json({ total: 1, totalHits: 1, hits: [hit] }));
    const searchService = new PixabayService('server-secret', fetcher as typeof fetch, cache);
    await searchService.search(parsePixabaySearchParams(new URLSearchParams('q=night')));

    const importFetcher = vi.fn();
    const importService = new PixabayService('server-secret', importFetcher as typeof fetch, cache);
    await expect(importService.getImageById(7)).resolves.toMatchObject({ pixabayId: 7 });
    expect(importFetcher).not.toHaveBeenCalled();
  });
});
