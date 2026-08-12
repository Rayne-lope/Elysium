import { determineOrientation } from '@/lib/metadata';
import { PIXABAY_CATEGORY_MAP } from './pixabay.constants';
import type { PixabayApiImage, PixabayImportImage, PixabaySearchImage } from './pixabay.types';

export function normalizePixabayTags(tags: string | string[]): string[] {
  const values = Array.isArray(tags) ? tags : tags.split(',');
  const normalized = values
    .map((tag) => tag.trim().toLowerCase())
    .map((tag) => tag.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
    .map((tag) => tag.replace(/[^a-z0-9\s-]/g, ''))
    .map((tag) => tag.replace(/\s+/g, '-').replace(/-+/g, '-'))
    .map((tag) => tag.replace(/^-|-$/g, ''))
    .filter((tag) => tag.length > 0 && tag.length <= 50);

  return [...new Set(normalized)].slice(0, 20);
}

export function generateTemporaryTitle(tags: string[], pixabayId: number): string {
  const meaningful = normalizePixabayTags(tags)
    .filter((tag) => !['wallpaper', 'background', 'image', 'photo'].includes(tag))
    .slice(0, 3);

  if (meaningful.length === 0) return `Wallpaper ${pixabayId}`;
  return meaningful
    .map((tag) => tag.replace(/-/g, ' '))
    .join(' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function mapPixabayCategory(category?: string): string | undefined {
  if (!category) return undefined;
  return PIXABAY_CATEGORY_MAP[category.toLowerCase()];
}

export function mapPixabayImage(hit: PixabayApiImage): PixabayImportImage {
  const tags = normalizePixabayTags(hit.tags);
  const creatorSlug = encodeURIComponent(hit.user || 'contributor');
  const sourceAssetUrl = hit.imageURL || hit.fullHDURL || hit.largeImageURL || hit.webformatURL || '';

  return {
    pixabayId: hit.id,
    previewUrl: hit.webformatURL || hit.previewURL,
    sourceAssetUrl,
    sourceUrl: hit.pageURL,
    creator: hit.user || 'Pixabay contributor',
    creatorUrl: `https://pixabay.com/users/${creatorSlug}-${hit.user_id}/`,
    tags,
    width: hit.imageWidth,
    height: hit.imageHeight,
    fileSize: hit.imageSize,
    orientation: determineOrientation(hit.imageWidth, hit.imageHeight),
    title: generateTemporaryTitle(tags, hit.id),
    likes: hit.likes || 0,
    views: hit.views || 0,
    downloads: hit.downloads || 0,
  };
}

export function toPixabaySearchImage(image: PixabayImportImage): PixabaySearchImage {
  const { sourceAssetUrl: _serverOnly, ...publicImage } = image;
  return publicImage;
}
