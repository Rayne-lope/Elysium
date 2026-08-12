export function paginationWindow(current: number, total: number, radius = 2): number[] {
  if (!Number.isSafeInteger(total) || total <= 0) return [];
  const safeCurrent = Math.min(total, Math.max(1, current));
  const pages = new Set([1, total]);
  for (let page = Math.max(1, safeCurrent - radius); page <= Math.min(total, safeCurrent + radius); page += 1) {
    pages.add(page);
  }
  return [...pages].sort((a, b) => a - b);
}
