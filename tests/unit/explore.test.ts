import { describe, expect, it } from 'vitest';
import { buildCatalogueSubmissionUrl, buildExploreUrl, explorePaginationItems } from '../../src/lib/explore';

describe('Explore catalogue helpers', () => {
  it('preserves existing filters and resets pagination when one filter changes', () => {
    const current = new URLSearchParams('q=racing&tag=motion&page=4&limit=12&sort=popular');

    expect(buildExploreUrl(current, { orientation: 'landscape' })).toBe(
      '/explore?q=racing&tag=motion&page=1&limit=12&sort=popular&orientation=landscape',
    );
  });

  it('removes empty values while preserving an explicitly requested page', () => {
    const current = new URLSearchParams('category=automotive&orientation=portrait&page=3');

    expect(buildExploreUrl(current, { category: '', orientation: null, page: 2 }, { resetPage: false }))
      .toBe('/explore?page=2');
  });

  it('supports a clean Explore URL when no parameters remain', () => {
    expect(buildExploreUrl(new URLSearchParams(), {}, { resetPage: false })).toBe('/explore');
  });

  it('inserts semantic gaps without duplicating boundary pages', () => {
    expect(explorePaginationItems(6, 12)).toEqual([1, 'gap', 4, 5, 6, 7, 8, 'gap', 12]);
    expect(explorePaginationItems(1, 3)).toEqual([1, 2, 3]);
    expect(explorePaginationItems(1, 0)).toEqual([]);
  });

  it('builds an explicit Apply URL for the requested catalogue route', () => {
    expect(buildCatalogueSubmissionUrl('/category/architecture', [
      ['orientation', 'landscape'],
      ['sort', 'popular'],
      ['category', ''],
      ['page', '7'],
    ])).toBe('/category/architecture?orientation=landscape&sort=popular&page=1');
  });
});
