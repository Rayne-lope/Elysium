import { describe, expect, it } from 'vitest';
import { curateHomepageCollections } from '../../src/lib/homepage';
import type { Wallpaper } from '../../src/types';

function wallpaper(id: string, overrides: Partial<Wallpaper> = {}): Wallpaper {
  return {
    id,
    slug: id,
    title: `Artwork ${id}`,
    width: 3840,
    height: 2160,
    aspectRatio: 1.78,
    orientation: 'landscape',
    format: 'jpg',
    mimeType: 'image/jpeg',
    fileSize: 1,
    originalR2Key: `original/${id}.jpg`,
    status: 'published',
    isFeatured: false,
    downloadCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('homepage collection curation', () => {
  it('uses the explicit featured wallpaper and removes duplicates from later sections', () => {
    const featured = wallpaper('featured', { isFeatured: true });
    const latestA = wallpaper('latest-a');
    const latestB = wallpaper('latest-b');
    const popularA = wallpaper('popular-a');

    const collections = curateHomepageCollections(
      [featured],
      [featured, latestA, latestA, latestB],
      [featured, latestA, popularA, popularA],
    );

    expect(collections.featured?.id).toBe('featured');
    expect(collections.latest.map(({ id }) => id)).toEqual(['latest-a', 'latest-b']);
    expect(collections.popular.map(({ id }) => id)).toEqual(['popular-a']);
  });

  it('falls back to the newest wallpaper when no item is explicitly featured', () => {
    const newest = wallpaper('newest');
    const older = wallpaper('older');

    const collections = curateHomepageCollections([], [newest, older], [older]);

    expect(collections.featured?.id).toBe('newest');
    expect(collections.latest.map(({ id }) => id)).toEqual(['older']);
    expect(collections.popular).toEqual([]);
  });

  it('preserves source order and respects section limits', () => {
    const candidates = ['a', 'b', 'c', 'd'].map((id) => wallpaper(id));
    const popular = ['e', 'f', 'g'].map((id) => wallpaper(id));

    const collections = curateHomepageCollections([], candidates, popular, {
      latestLimit: 2,
      popularLimit: 2,
    });

    expect(collections.featured?.id).toBe('a');
    expect(collections.latest.map(({ id }) => id)).toEqual(['b', 'c']);
    expect(collections.popular.map(({ id }) => id)).toEqual(['e', 'f']);
  });

  it('returns empty collections when the catalog is empty', () => {
    expect(curateHomepageCollections([], [], [])).toEqual({
      featured: null,
      latest: [],
      popular: [],
    });
  });
});
