const DEFAULT_PAGE_SIZE = 20;

export function buildCollectionPageUrl(
  pathname: string,
  current: URLSearchParams,
  page: number,
  allowedKeys: readonly string[] = ['limit', 'category', 'orientation', 'sort'],
): string {
  const params = new URLSearchParams();

  for (const key of allowedKeys) {
    const value = current.get(key)?.trim();
    if (value) params.set(key, value);
  }

  params.set('page', String(Math.max(1, page)));
  return `${pathname}?${params.toString()}`;
}

export function collectionResultRange(
  currentPage: number,
  pageSize: number,
  visibleCount: number,
): { start: number; end: number } {
  if (visibleCount <= 0) return { start: 0, end: 0 };
  const normalizedPage = Math.max(1, currentPage);
  const normalizedSize = Math.max(1, pageSize || DEFAULT_PAGE_SIZE);
  const start = (normalizedPage - 1) * normalizedSize + 1;
  return { start, end: start + visibleCount - 1 };
}

export function globalCollectionRank(
  currentPage: number,
  pageSize: number,
  localIndex: number,
): number {
  const normalizedPage = Math.max(1, currentPage);
  const normalizedSize = Math.max(1, pageSize || DEFAULT_PAGE_SIZE);
  return ((normalizedPage - 1) * normalizedSize) + Math.max(0, localIndex) + 1;
}
