import { describe, expect, it } from 'vitest';
import type { Wallpaper } from '../../src/types';
import {
  capSourceSet,
  isPreviewAssetKey,
  parseCdnOrigin,
  previewAssetUrl,
  responsivePreviewSources,
} from '../../src/lib/preview-assets';
import { withSecurityHeaders } from '../../src/lib/http';

function wallpaper(overrides: Partial<Wallpaper> = {}): Wallpaper {
  return {
    id: 'wp_test', slug: 'test', title: 'Test', width: 3840, height: 2160,
    aspectRatio: 16 / 9, orientation: 'landscape', format: 'jpg', mimeType: 'image/jpeg',
    fileSize: 1, originalR2Key: 'original/wp_test/original.jpg', status: 'published',
    isFeatured: false, downloadCount: 0, createdAt: '', updatedAt: '',
    preview480Key: 'preview/wp_test/480.avif',
    preview960Key: 'preview/wp_test/960.avif',
    preview1600Key: 'preview/wp_test/1600.avif',
    previewFallbackKey: 'preview/wp_test/fallback.webp',
    ...overrides,
  };
}

describe('preview CDN URLs', () => {
  it('accepts only a clean HTTPS CDN origin', () => {
    expect(parseCdnOrigin('https://cdn.example.com/')).toBe('https://cdn.example.com');
    expect(parseCdnOrigin('http://cdn.example.com')).toBeNull();
    expect(parseCdnOrigin('https://user@cdn.example.com')).toBeNull();
    expect(parseCdnOrigin('https://cdn.example.com/assets')).toBeNull();
    expect(parseCdnOrigin('https://cdn.example.com?debug=1')).toBeNull();
    expect(parseCdnOrigin('not-a-url')).toBeNull();
  });

  it('uses the CDN when valid and the proxy otherwise', () => {
    const key = 'preview/wp_test/480.avif';
    expect(previewAssetUrl(key, 'https://cdn.example.com')).toBe(`https://cdn.example.com/${key}`);
    expect(previewAssetUrl(key, 'invalid')).toBe(`/cdn-proxy/${key}`);
    expect(previewAssetUrl(key)).toBe(`/cdn-proxy/${key}`);
  });

  it('rejects original, traversal, and unsupported preview keys', () => {
    expect(isPreviewAssetKey('preview/wp_test/480.webp')).toBe(true);
    expect(isPreviewAssetKey('preview/wp_test/fallback.webp')).toBe(true);
    expect(previewAssetUrl('original/wp_test/original.jpg')).toBeNull();
    expect(previewAssetUrl('preview/wp_test/../../original.jpg')).toBeNull();
    expect(previewAssetUrl('preview/wp_test/480.jpg')).toBeNull();
  });

  it('adds only a validated CDN origin to the image CSP', () => {
    const request = new Request('https://wallpapers.example.com/');
    const valid = withSecurityHeaders(new Response('ok'), request, 'https://cdn.example.com');
    const invalid = withSecurityHeaders(new Response('ok'), request, 'https://cdn.example.com/path');
    expect(valid.headers.get('content-security-policy')).toContain('https://cdn.example.com');
    expect(invalid.headers.get('content-security-policy')).not.toContain('https://cdn.example.com');
    expect(valid.headers.get('content-security-policy')).not.toContain('fonts.googleapis.com');
  });
});

describe('responsive preview source sets', () => {
  it('caps a mobile source set without changing width descriptors', () => {
    expect(capSourceSet('a.avif 480w, b.avif 960w, c.avif 1600w', 480)).toBe('a.avif 480w');
  });

  it('builds an AVIF source set and WebP fallback for existing assets', () => {
    expect(responsivePreviewSources(wallpaper())).toEqual({
      avifSrcSet: [
        '/cdn-proxy/preview/wp_test/480.avif 480w',
        '/cdn-proxy/preview/wp_test/960.avif 960w',
        '/cdn-proxy/preview/wp_test/1600.avif 1600w',
      ].join(', '),
      fallbackUrl: '/cdn-proxy/preview/wp_test/fallback.webp',
      webpSrcSet: undefined,
    });
  });

  it('uses actual portrait widths for max-dimension WebP previews', () => {
    const result = responsivePreviewSources(wallpaper({
      width: 900, height: 1600, orientation: 'portrait', aspectRatio: 900 / 1600,
      preview480Key: 'preview/wp_test/480.webp',
      preview960Key: 'preview/wp_test/960.webp',
      preview1600Key: 'preview/wp_test/1600.webp',
    }));
    expect(result?.webpSrcSet).toBe([
      '/cdn-proxy/preview/wp_test/480.webp 270w',
      '/cdn-proxy/preview/wp_test/960.webp 540w',
      '/cdn-proxy/preview/wp_test/1600.webp 900w',
    ].join(', '));
  });

  it('deduplicates variants wider than a small original', () => {
    const result = responsivePreviewSources(wallpaper({ width: 320, height: 180 }));
    expect(result?.avifSrcSet).toBe('/cdn-proxy/preview/wp_test/480.avif 320w');
  });

  it('returns null when no valid preview exists', () => {
    expect(responsivePreviewSources(wallpaper({
      preview480Key: undefined,
      preview960Key: 'original/wp_test/original.jpg',
      preview1600Key: undefined,
      previewFallbackKey: undefined,
    }))).toBeNull();
  });
});
