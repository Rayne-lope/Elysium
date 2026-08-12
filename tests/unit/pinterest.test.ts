import { describe, expect, it } from 'vitest';
import {
  convertToOriginalPinterestUrl,
  isValidPinterestCdnUrl,
  parsePinterestTagsFromUrl,
} from '../../src/services/pinterest/pinterest.service';

describe('Pinterest service helpers', () => {
  it('converts thumbnail URLs to original master URLs', () => {
    expect(
      convertToOriginalPinterestUrl('https://i.pinimg.com/736x/ab/cd/ef/abcdef123456.jpg')
    ).toBe('https://i.pinimg.com/originals/ab/cd/ef/abcdef123456.jpg');

    expect(
      convertToOriginalPinterestUrl('https://i.pinimg.com/236x/11/22/33/445566.png')
    ).toBe('https://i.pinimg.com/originals/11/22/33/445566.png');
  });

  it('validates Pinterest CDN hostnames', () => {
    expect(isValidPinterestCdnUrl('https://i.pinimg.com/originals/12/34/56/image.jpg')).toBe(true);
    expect(isValidPinterestCdnUrl('https://evil.com/image.jpg')).toBe(false);
  });

  it('parses tags from Pinterest CDN URLs', () => {
    const tags = parsePinterestTagsFromUrl('https://i.pinimg.com/originals/ab/cd/ef/dark-aesthetic-wallpaper.jpg');
    expect(tags).toContain('pinterest');
    expect(tags).toContain('curated');
  });
});
