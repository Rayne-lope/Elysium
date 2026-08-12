import { describe, expect, it } from 'vitest';
import {
  buildCollectionPageUrl,
  collectionResultRange,
  globalCollectionRank,
} from '../../src/lib/collection-pages';

describe('Tag and Popular collection helpers', () => {
  it('preserves supported Tag filters while changing pages', () => {
    const current = new URLSearchParams('orientation=portrait&category=abstract&sort=featured&limit=12&page=4');
    expect(buildCollectionPageUrl('/tag/impasto', current, 5)).toBe(
      '/tag/impasto?limit=12&category=abstract&orientation=portrait&sort=featured&page=5',
    );
  });

  it('keeps Popular locked by omitting unsupported sequence and search parameters', () => {
    const current = new URLSearchParams('q=ignored&tag=night&sort=newest&orientation=landscape&category=nature&page=2');
    expect(buildCollectionPageUrl(
      '/popular',
      current,
      3,
      ['limit', 'category', 'orientation'],
    )).toBe('/popular?category=nature&orientation=landscape&page=3');
  });

  it('normalizes invalid page targets to the first page', () => {
    expect(buildCollectionPageUrl('/popular', new URLSearchParams(), 0, []))
      .toBe('/popular?page=1');
  });

  it('calculates visible record ranges for full and empty pages', () => {
    expect(collectionResultRange(3, 20, 7)).toEqual({ start: 41, end: 47 });
    expect(collectionResultRange(2, 20, 0)).toEqual({ start: 0, end: 0 });
  });

  it('continues global ranking across page boundaries', () => {
    expect(globalCollectionRank(1, 20, 0)).toBe(1);
    expect(globalCollectionRank(2, 20, 0)).toBe(21);
    expect(globalCollectionRank(3, 12, 11)).toBe(36);
  });
});
