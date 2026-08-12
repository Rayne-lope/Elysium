import { describe, expect, it, vi } from 'vitest';
import { PixabayImportService } from '../../worker/services/pixabay-import.service';
import type { PixabayImportImage } from '../../src/services/pixabay/pixabay.types';

const image: PixabayImportImage = {
  pixabayId: 99,
  previewUrl: 'https://pixabay.com/get/x_640.jpg',
  sourceAssetUrl: 'https://pixabay.com/get/x.jpg',
  sourceUrl: 'https://pixabay.com/photos/x-99/',
  creator: 'maker',
  creatorUrl: 'https://pixabay.com/users/maker-1/',
  tags: [],
  width: 3000,
  height: 2000,
  fileSize: 4,
  orientation: 'landscape',
  title: 'Night City',
  likes: 1,
  views: 2,
  downloads: 1,
};

function fakeDb(externalDuplicate = false, hashDuplicate = false): D1Database {
  return {
    prepare(sql: string) {
      return {
        bind() {
          return {
            async first() {
              if (sql.includes('source_provider') && externalDuplicate) return {
                id: 'wp_existing', slug: 'existing', title: 'Existing', width: 10, height: 10,
                aspect_ratio: 1, orientation: 'square', format: 'jpg', mime_type: 'image/jpeg', file_size: 4,
                original_r2_key: 'original/x.jpg', status: 'draft', created_at: '', updated_at: '',
              };
              if (sql.includes('file_hash') && hashDuplicate) return {
                id: 'wp_hash', slug: 'hash', title: 'Hash Duplicate', width: 10, height: 10,
                aspect_ratio: 1, orientation: 'square', format: 'jpg', mime_type: 'image/jpeg', file_size: 4,
                original_r2_key: 'original/x.jpg', status: 'draft', created_at: '', updated_at: '',
              };
              return null;
            },
            async all() { return { results: [] }; },
            async run() { return {}; },
          };
        },
        async all() { return { results: [] }; },
      };
    },
    async batch() { return []; },
  } as unknown as D1Database;
}

function fakeBucket(): R2Bucket {
  return { put: vi.fn(), delete: vi.fn() } as unknown as R2Bucket;
}

describe('Pixabay import duplicate protection', () => {
  it('skips an external ID before API lookup and source download', async () => {
    const pixabay = { getImageById: vi.fn() };
    const fetcher = vi.fn();
    const importer = new PixabayImportService(pixabay as never, {
      db: fakeDb(true), originalBucket: fakeBucket(), previewBucket: fakeBucket(), images: {} as ImagesBinding,
    }, fetcher as typeof fetch);
    const result = await importer.importOne(99);
    expect(result.status).toBe('duplicate');
    expect(pixabay.getImageById).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('skips a SHA-256 duplicate before writing to R2', async () => {
    const originalBucket = fakeBucket();
    const previewBucket = fakeBucket();
    const pixabay = { getImageById: vi.fn(async () => image) };
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x02, 0x00, 0x02,
      0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9,
    ]);
    const fetcher = vi.fn(async () => new Response(jpeg, {
      status: 200, headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(jpeg.byteLength) },
    }));
    const images = { info: vi.fn(async () => ({ format: 'image/jpeg', fileSize: 4, width: 2, height: 2 })) } as unknown as ImagesBinding;
    const importer = new PixabayImportService(pixabay as never, {
      db: fakeDb(false, true), originalBucket, previewBucket, images,
    }, fetcher as typeof fetch);
    const result = await importer.importOne(99);
    expect(result.status).toBe('duplicate');
    expect(originalBucket.put).not.toHaveBeenCalled();
    expect(previewBucket.put).not.toHaveBeenCalled();
  });

  it('waits for the source reset window before retrying a CDN rate limit', async () => {
    const pixabay = { getImageById: vi.fn(async () => image) };
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x02, 0x00, 0x02,
      0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9,
    ]);
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('Rate limited', {
        status: 429, headers: { 'X-RateLimit-Reset': '12' },
      }))
      .mockResolvedValueOnce(new Response(jpeg, {
        status: 200, headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(jpeg.byteLength) },
      }));
    const sleeper = vi.fn(async () => {});
    const images = { info: vi.fn(async () => ({ format: 'image/jpeg', fileSize: 4, width: 2, height: 2 })) } as unknown as ImagesBinding;
    const importer = new PixabayImportService(pixabay as never, {
      db: fakeDb(false, true), originalBucket: fakeBucket(), previewBucket: fakeBucket(), images,
    }, fetcher as typeof fetch, sleeper);

    const result = await importer.importOne(99);
    expect(result.status, result.reason).toBe('duplicate');
    expect(sleeper).toHaveBeenCalledTimes(1);
    expect(sleeper).toHaveBeenCalledWith(13_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
