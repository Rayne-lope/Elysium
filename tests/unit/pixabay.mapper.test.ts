import { describe, expect, it } from 'vitest';
import {
  generateTemporaryTitle,
  mapPixabayCategory,
  mapPixabayImage,
  normalizePixabayTags,
} from '../../src/services/pixabay/pixabay.mapper';
import type { PixabayApiImage } from '../../src/services/pixabay/pixabay.types';

const hit: PixabayApiImage = {
  id: 123456,
  pageURL: 'https://pixabay.com/photos/example-123456/',
  type: 'photo',
  tags: ' Mountain, snow, mountain, Winter Landscape ',
  previewURL: 'https://cdn.pixabay.com/preview.jpg',
  previewWidth: 150,
  previewHeight: 100,
  webformatURL: 'https://pixabay.com/get/example_640.jpg',
  webformatWidth: 640,
  webformatHeight: 427,
  largeImageURL: 'https://pixabay.com/get/example_1280.jpg',
  imageURL: 'https://pixabay.com/get/example.jpg',
  imageWidth: 6000,
  imageHeight: 4000,
  imageSize: 4_000_000,
  views: 100,
  downloads: 50,
  likes: 12,
  user_id: 42,
  user: 'Artist Name',
};

describe('Pixabay mapper', () => {
  it('normalizes, slugifies, and deduplicates tags', () => {
    expect(normalizePixabayTags(hit.tags)).toEqual(['mountain', 'snow', 'winter-landscape']);
  });

  it('generates a deterministic draft title from meaningful tags', () => {
    expect(generateTemporaryTitle(['wallpaper', 'mountain', 'snow', 'landscape'], 123)).toBe('Mountain Snow Landscape');
    expect(generateTemporaryTitle(['background'], 123)).toBe('Wallpaper 123');
  });

  it('maps only safe categories', () => {
    expect(mapPixabayCategory('nature')).toBe('nature');
    expect(mapPixabayCategory('places')).toBe('architecture');
    expect(mapPixabayCategory('fashion')).toBeUndefined();
  });

  it('maps response metadata and derives orientation from dimensions', () => {
    const image = mapPixabayImage(hit);
    expect(image.pixabayId).toBe(123456);
    expect(image.orientation).toBe('landscape');
    expect(image.title).toBe('Mountain Snow Winter Landscape');
    expect(image.sourceAssetUrl).toBe(hit.imageURL);
    expect(image.creatorUrl).toContain('Artist%20Name-42');
  });

  it('falls back to largeImageURL when imageURL is omitted for standard API keys', () => {
    const withoutFullAccess = mapPixabayImage({ ...hit, imageURL: undefined });
    expect(withoutFullAccess.sourceAssetUrl).toBe(hit.largeImageURL);
  });
});
