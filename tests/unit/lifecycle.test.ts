import { describe, expect, it, vi } from 'vitest';
import type { Wallpaper } from '../../src/types';
import { PixabayImportService } from '../../worker/services/pixabay-import.service';
import { WallpaperLifecycleService } from '../../worker/services/wallpaper-lifecycle.service';
import type { PixabayImportImage } from '../../src/services/pixabay/pixabay.types';
import { ImagePreviewService } from '../../worker/services/image-preview.service';

const wallpaper: Wallpaper = {
  id: 'wp_test', slug: 'test', title: 'Test', width: 1920, height: 1080, aspectRatio: 1.78,
  orientation: 'landscape', format: 'jpg', mimeType: 'image/jpeg', fileSize: 100,
  originalR2Key: 'original/wp_test/original.jpg', preview480Key: 'preview/wp_test/480.avif',
  preview960Key: 'preview/wp_test/960.avif', preview1600Key: 'preview/wp_test/1600.avif',
  previewFallbackKey: 'preview/wp_test/fallback.webp', fileHash: 'a'.repeat(64), status: 'published',
  isFeatured: false, downloadCount: 0, createdAt: '', updatedAt: '',
};

function bucket(exists = true): R2Bucket {
  return {
    head: vi.fn(async () => exists ? ({}) : null),
    delete: vi.fn(async () => undefined),
  } as unknown as R2Bucket;
}

describe('wallpaper lifecycle hardening', () => {
  it('rejects browser previews that only claim to be WebP', async () => {
    const fake = new Uint8Array([1, 2, 3, 4]).buffer;
    await expect(ImagePreviewService.storeProvided(bucket(), 'wp_test', {
      p480: fake, p960: fake, p1600: fake, fallback: fake, mimeType: 'image/webp',
    }, { width: 1920, height: 1080 })).rejects.toThrow(/signature/);
  });

  it('blocks publishing when any R2 asset is missing', async () => {
    await expect(WallpaperLifecycleService.assertPublishable({
      db: {} as D1Database, originalBucket: bucket(false), previewBucket: bucket(true),
    }, wallpaper)).rejects.toThrow(/must exist/);
  });

  it('requires complete Pixabay provenance', async () => {
    await expect(WallpaperLifecycleService.assertPublishable({
      db: {} as D1Database, originalBucket: bucket(), previewBucket: bucket(),
    }, { ...wallpaper, sourceProvider: 'pixabay', sourceExternalId: '10' })).rejects.toThrow(/provenance/);
  });

  it('archives before R2 deletion and leaves the row archived on storage failure', async () => {
    const events: string[] = [];
    const db = {
      prepare(sql: string) {
        return { bind() { return { async run() { events.push(sql.includes('UPDATE wallpapers') ? 'archive' : 'db'); return {}; } }; } };
      },
      async batch() { events.push('delete-row'); return []; },
    } as unknown as D1Database;
    const original = { delete: vi.fn(async () => { events.push('r2'); throw new Error('R2 failed'); }) } as unknown as R2Bucket;
    await expect(WallpaperLifecycleService.safeDelete({ db, originalBucket: original, previewBucket: bucket() }, wallpaper))
      .rejects.toThrow('R2 failed');
    expect(events[0]).toBe('archive');
    expect(events).not.toContain('delete-row');
  });
});

describe('Pixabay source redirect hardening', () => {
  it('rejects redirects leaving the Pixabay host allowlist', async () => {
    const image: PixabayImportImage = {
      pixabayId: 7, previewUrl: 'https://cdn.pixabay.com/x.jpg', sourceAssetUrl: 'https://pixabay.com/get/x.jpg',
      sourceUrl: 'https://pixabay.com/photos/x-7/', creator: 'maker', creatorUrl: 'https://pixabay.com/users/maker-1/',
      tags: [], width: 10, height: 10, fileSize: 10, orientation: 'square', title: 'Test', likes: 0, views: 0, downloads: 0,
    };
    const db = {
      prepare() { return { bind() { return { async first() { return null; } }; } }; },
    } as unknown as D1Database;
    const fetcher = vi.fn(async () => new Response(null, { status: 302, headers: { Location: 'https://evil.test/private' } }));
    const importer = new PixabayImportService({ getImageById: vi.fn(async () => image) } as never, {
      db, originalBucket: bucket(), previewBucket: bucket(), images: {} as ImagesBinding,
    }, fetcher as typeof fetch);
    const result = await importer.importOne(7);
    expect(result).toMatchObject({ status: 'failed', reason: 'Pixabay returned an untrusted source URL' });
  });
});
