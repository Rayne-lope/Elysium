import { paginationWindow } from './pagination';

export type ExploreParamValue = string | number | null | undefined;
export type ExplorePaginationItem = number | 'gap';

export function buildCatalogueSubmissionUrl(
  actionPath: string,
  entries: Iterable<readonly [string, unknown]>,
): string {
  const params = new URLSearchParams();

  for (const [key, rawValue] of entries) {
    const value = String(rawValue).trim();
    if (value) params.set(key, value);
  }

  params.set('page', '1');
  const pathname = actionPath.split('?')[0] || '/explore';
  return `${pathname}?${params.toString()}`;
}

export function buildExploreUrl(
  current: URLSearchParams,
  changes: Record<string, ExploreParamValue>,
  options: { resetPage?: boolean } = {},
): string {
  const params = new URLSearchParams(current);

  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined || value === null || value === '') {
      params.delete(key);
    } else {
      params.set(key, String(value));
    }
  }

  for (const [key, value] of [...params.entries()]) {
    if (value === '') params.delete(key);
  }

  if (options.resetPage !== false) params.set('page', '1');

  const query = params.toString();
  return query ? `/explore?${query}` : '/explore';
}

export function explorePaginationItems(
  current: number,
  total: number,
  radius = 2,
): ExplorePaginationItem[] {
  const pages = paginationWindow(current, total, radius);
  const items: ExplorePaginationItem[] = [];

  pages.forEach((page, index) => {
    const previous = pages[index - 1];
    if (previous !== undefined && page - previous > 1) items.push('gap');
    items.push(page);
  });

  return items;
}
