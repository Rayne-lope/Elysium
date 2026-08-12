export function convertToOriginalPinterestUrl(url: string): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    if (!parsed.hostname.endsWith('pinimg.com')) return trimmed;
    // Replace width/height thumbnail paths like /236x/, /474x/, /736x/ with /originals/
    parsed.pathname = parsed.pathname.replace(/\/(?:236x|474x|736x|\d+x\d*)\//i, '/originals/');
    return parsed.toString();
  } catch {
    return trimmed.replace(/\/(?:236x|474x|736x|\d+x\d*)\//i, '/originals/');
  }
}

export function isValidPinterestCdnUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'https:' && (parsed.hostname === 'i.pinimg.com' || parsed.hostname.endsWith('.pinimg.com'));
  } catch {
    return false;
  }
}

export function parsePinterestTagsFromUrl(url: string): string[] {
  try {
    const parsed = new URL(url.trim());
    const segments = parsed.pathname.split('/').filter(Boolean);
    const filename = segments[segments.length - 1] || '';
    const nameWithoutExt = filename.replace(/\.[a-z0-9]+$/i, '');
    const tokens = nameWithoutExt
      .split(/[-_]+/)
      .map((t) => t.toLowerCase().trim())
      .filter((t) => t.length > 2 && !/^[0-9a-f]{16,}$/i.test(t));
    return [...new Set(['pinterest', 'curated', ...tokens])];
  } catch {
    return ['pinterest', 'curated'];
  }
}
