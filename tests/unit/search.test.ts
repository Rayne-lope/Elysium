import { describe, expect, it } from 'vitest';
import { buildCatalogueSubmissionUrl } from '../../src/lib/explore';
import {
  buildSearchPageUrl,
  buildSearchQueryUrl,
  buildSearchResetUrl,
  searchQueryScale,
  searchResultRange,
} from '../../src/lib/search';

describe('Search ledger helpers', () => {
  it('starts a new query without carrying old filters and resets pagination', () => {
    expect(buildSearchQueryUrl('  brutalist house  ')).toBe('/search?q=brutalist+house&page=1');
    expect(buildSearchQueryUrl('')).toBe('/search?page=1');
  });

  it('applies secondary filters while preserving hidden search context', () => {
    expect(buildCatalogueSubmissionUrl('/search', [
      ['q', 'impasto'],
      ['tag', 'painting'],
      ['limit', '12'],
      ['orientation', 'portrait'],
      ['category', 'abstract'],
      ['sort', 'popular'],
      ['page', '7'],
    ])).toBe('/search?q=impasto&tag=painting&limit=12&orientation=portrait&category=abstract&sort=popular&page=1');
  });

  it('clears secondary filters while preserving the query, tag, and page size', () => {
    const current = new URLSearchParams('q=impasto&tag=painting&limit=12&orientation=portrait&category=abstract&sort=popular&page=7');
    expect(buildSearchResetUrl(current)).toBe('/search?q=impasto&tag=painting&limit=12&page=1');
  });

  it('preserves all parameters when paging search results', () => {
    const current = new URLSearchParams('q=impasto&orientation=portrait&category=abstract&sort=popular&limit=12&page=1');
    expect(buildSearchPageUrl(current, 3)).toBe('/search?q=impasto&orientation=portrait&category=abstract&sort=popular&limit=12&page=3');
  });

  it('classifies empty, short, medium, and maximum-length display queries', () => {
    expect(searchQueryScale('')).toBe('empty');
    expect(searchQueryScale('impasto')).toBe('short');
    expect(searchQueryScale('architectural studies in ochre')).toBe('medium');
    expect(searchQueryScale('x'.repeat(100))).toBe('long');
  });

  it('calculates global result numbering and handles an empty page', () => {
    expect(searchResultRange(3, 20, 7)).toEqual({ start: 41, end: 47 });
    expect(searchResultRange(2, 20, 0)).toEqual({ start: 0, end: 0 });
  });
});
