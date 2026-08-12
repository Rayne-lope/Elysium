export type SearchQueryScale = 'empty' | 'short' | 'medium' | 'long';

export function buildSearchQueryUrl(query: string): string {
  const params = new URLSearchParams();
  const normalized = query.trim();
  if (normalized) params.set('q', normalized);
  params.set('page', '1');
  return `/search?${params.toString()}`;
}

export function buildSearchResetUrl(current: URLSearchParams): string {
  const params = new URLSearchParams();
  for (const key of ['q', 'tag', 'limit']) {
    const value = current.get(key)?.trim();
    if (value) params.set(key, value);
  }
  params.set('page', '1');
  return `/search?${params.toString()}`;
}

export function buildSearchPageUrl(current: URLSearchParams, page: number): string {
  const params = new URLSearchParams(current);
  params.set('page', String(Math.max(1, page)));
  return `/search?${params.toString()}`;
}

export function searchQueryScale(query: string): SearchQueryScale {
  const length = [...query.trim()].length;
  if (length === 0) return 'empty';
  if (length <= 18) return 'short';
  if (length <= 40) return 'medium';
  return 'long';
}

export function searchResultRange(
  currentPage: number,
  pageSize: number,
  visibleCount: number,
): { start: number; end: number } {
  if (visibleCount <= 0) return { start: 0, end: 0 };
  const start = (Math.max(1, currentPage) - 1) * Math.max(1, pageSize) + 1;
  return { start, end: start + visibleCount - 1 };
}
