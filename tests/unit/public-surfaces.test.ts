import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), 'utf8');
}

describe('completed public luxury surfaces', () => {
  it('routes primary Popular navigation to the dedicated ranking ledger', () => {
    const header = source('src/components/Header.astro');
    const footer = source('src/components/Footer.astro');
    expect(header).toContain("href: '/popular', label: 'Popular'");
    expect(footer).toContain('href="/popular">Most collected');
  });

  it('keeps Popular ranking fixed while exposing Apply-only secondary controls', () => {
    const popular = source('src/pages/popular.astro');
    expect(popular).toContain('activePage="popular"');
    expect(popular).toContain('surface="popular-luxury"');
    expect(popular).toContain('showSort={false}');
    expect(popular).toContain("sortBy: 'popular'");
    expect(popular).toContain("loading={index === 0 ? 'eager' : 'lazy'}");
  });

  it('uses the editorial catalogue and archive filter on Tag dossiers', () => {
    const tag = source('src/pages/tag/[slug].astro');
    expect(tag).toContain('surface="tag-luxury"');
    expect(tag).toContain('appearance="editorial"');
    expect(tag).toContain('appearance="archive"');
    expect(tag).toContain("return Astro.rewrite('/404')");
  });

  it('ships branded 404 and 500 pages without rendering internal errors', () => {
    const notFound = source('src/pages/404.astro');
    const serverError = source('src/pages/500.astro');
    expect(notFound).toContain('Astro.response.status = 404');
    expect(serverError).toContain('Astro.response.status = 500');
    expect(serverError).not.toContain('String(error)');
    expect(serverError).not.toContain('error.stack');
  });
});
