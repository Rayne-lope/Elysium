import type { Wallpaper } from '@/types';

export const PREVIEW_CACHE_CONTROL = 'public, max-age=31536000, immutable';
export const CARD_IMAGE_SIZES = '(max-width: 768px) calc((100vw - 4rem) / 2), (max-width: 1200px) calc((100vw - 6rem) / 3), 320px';
export const HERO_IMAGE_SIZES = '(max-width: 768px) calc(100vw - 3rem), min(1400px, calc(100vw - 3rem))';
export const DETAIL_IMAGE_SIZES = '(max-width: 900px) calc(100vw - 3rem), min(60vw, 820px)';

const PREVIEW_KEY_PATTERN = /^preview\/wp_[a-zA-Z0-9_-]{1,120}\/(?:480|960|1600)\.(?:avif|webp)$|^preview\/wp_[a-zA-Z0-9_-]{1,120}\/fallback\.webp$/;
const NUMERIC_VARIANT_PATTERN = /\/(480|960|1600)\.(avif|webp)$/;

export interface ResponsivePreviewSources {
  avifSrcSet?: string;
  webpSrcSet?: string;
  fallbackUrl: string;
}

export function capSourceSet(srcset: string | undefined, maxWidth: number): string | undefined {
  if (!srcset || !Number.isSafeInteger(maxWidth) || maxWidth <= 0) return undefined;
  const candidates = srcset.split(',').map((candidate) => candidate.trim());
  const capped = candidates.filter((candidate) => {
    const width = Number(/\s(\d+)w$/.exec(candidate)?.[1]);
    return Number.isSafeInteger(width) && width <= maxWidth;
  });
  return (capped.length > 0 ? capped : candidates.slice(0, 1)).join(', ');
}

interface Variant {
  key: string;
  target: 480 | 960 | 1600;
}

export function isPreviewAssetKey(key: string): boolean {
  return PREVIEW_KEY_PATTERN.test(key);
}

export function parseCdnOrigin(value?: string): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password
      || (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function previewAssetUrl(key: string | undefined, cdnBaseUrl?: string): string | null {
  if (!key || !isPreviewAssetKey(key)) return null;
  const origin = parseCdnOrigin(cdnBaseUrl);
  return origin ? `${origin}/${key}` : `/cdn-proxy/${key}`;
}

function variantWidth(
  wallpaper: Pick<Wallpaper, 'width' | 'height'>,
  key: string,
  target: number
): number {
  if (key.endsWith('.webp')) {
    const scale = Math.min(1, target / Math.max(wallpaper.width, wallpaper.height));
    return Math.max(1, Math.round(wallpaper.width * scale));
  }
  return Math.max(1, Math.min(wallpaper.width, target));
}

function sourceSet(
  wallpaper: Pick<Wallpaper, 'width' | 'height'>,
  variants: Variant[],
  format: 'avif' | 'webp',
  cdnBaseUrl?: string
): string | undefined {
  const candidates = new Map<number, string>();
  for (const variant of variants) {
    const match = NUMERIC_VARIANT_PATTERN.exec(variant.key);
    if (!match || match[2] !== format || !isPreviewAssetKey(variant.key)) continue;
    const url = previewAssetUrl(variant.key, cdnBaseUrl);
    if (!url) continue;
    const width = variantWidth(wallpaper, variant.key, variant.target);
    if (!candidates.has(width)) candidates.set(width, url);
  }
  const values = [...candidates.entries()]
    .sort(([left], [right]) => left - right)
    .map(([width, url]) => `${url} ${width}w`);
  return values.length > 0 ? values.join(', ') : undefined;
}

export function responsivePreviewSources(
  wallpaper: Pick<Wallpaper,
    'width' | 'height' | 'preview480Key' | 'preview960Key' | 'preview1600Key' | 'previewFallbackKey'>,
  cdnBaseUrl?: string
): ResponsivePreviewSources | null {
  if (!Number.isSafeInteger(wallpaper.width) || wallpaper.width <= 0
    || !Number.isSafeInteger(wallpaper.height) || wallpaper.height <= 0) return null;

  const variants: Variant[] = [
    { key: wallpaper.preview480Key || '', target: 480 },
    { key: wallpaper.preview960Key || '', target: 960 },
    { key: wallpaper.preview1600Key || '', target: 1600 },
  ];
  const fallbackKeys = [
    wallpaper.previewFallbackKey,
    wallpaper.preview960Key,
    wallpaper.preview1600Key,
    wallpaper.preview480Key,
  ];
  const fallbackUrl = fallbackKeys
    .map((key) => previewAssetUrl(key, cdnBaseUrl))
    .find((url): url is string => Boolean(url));
  if (!fallbackUrl) return null;

  return {
    avifSrcSet: sourceSet(wallpaper, variants, 'avif', cdnBaseUrl),
    webpSrcSet: sourceSet(wallpaper, variants, 'webp', cdnBaseUrl),
    fallbackUrl,
  };
}
