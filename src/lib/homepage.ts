import type { Wallpaper } from '@/types';

export interface HomepageCollections {
  featured: Wallpaper | null;
  latest: Wallpaper[];
  popular: Wallpaper[];
}

interface HomepageCollectionOptions {
  latestLimit?: number;
  popularLimit?: number;
}

function uniqueWallpapers(
  wallpapers: Wallpaper[],
  excludedIds: Set<string>,
  limit: number,
): Wallpaper[] {
  const selected: Wallpaper[] = [];
  const seenIds = new Set(excludedIds);

  for (const wallpaper of wallpapers) {
    if (seenIds.has(wallpaper.id)) continue;

    selected.push(wallpaper);
    seenIds.add(wallpaper.id);

    if (selected.length === limit) break;
  }

  return selected;
}

export function curateHomepageCollections(
  featuredCandidates: Wallpaper[],
  latestCandidates: Wallpaper[],
  popularCandidates: Wallpaper[],
  options: HomepageCollectionOptions = {},
): HomepageCollections {
  const latestLimit = options.latestLimit ?? 8;
  const popularLimit = options.popularLimit ?? 8;
  const featured = featuredCandidates[0] ?? latestCandidates[0] ?? null;
  const featuredIds = new Set(featured ? [featured.id] : []);
  const latest = uniqueWallpapers(latestCandidates, featuredIds, latestLimit);
  const usedIds = new Set([
    ...featuredIds,
    ...latest.map((wallpaper) => wallpaper.id),
  ]);
  const popular = uniqueWallpapers(popularCandidates, usedIds, popularLimit);

  return { featured, latest, popular };
}
