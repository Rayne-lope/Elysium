import { describe, it, expect } from 'vitest';
import {
  calculateAspectRatio,
  determineOrientation,
  calculateResolutionLabel,
  generateSlug,
  sanitizeFilename,
  calculateSHA256,
  getMimeType,
} from '../../src/lib/metadata';

describe('Metadata Utilities (Hardened)', () => {
  describe('calculateAspectRatio', () => {
    it('calculates aspect ratio correctly for 16:9', () => {
      expect(calculateAspectRatio(1920, 1080)).toBe(1.78);
      expect(calculateAspectRatio(3840, 2160)).toBe(1.78);
    });

    it('calculates aspect ratio correctly for 9:16 portrait', () => {
      expect(calculateAspectRatio(1080, 1920)).toBe(0.56);
    });

    it('calculates 1.0 for square dimensions', () => {
      expect(calculateAspectRatio(1080, 1080)).toBe(1);
    });

    it('throws error for invalid/non-positive/NaN/Infinity dimensions', () => {
      expect(() => calculateAspectRatio(0, 1080)).toThrow();
      expect(() => calculateAspectRatio(1920, -10)).toThrow();
      expect(() => calculateAspectRatio(NaN, 1080)).toThrow();
      expect(() => calculateAspectRatio(1920, Infinity)).toThrow();
    });
  });

  describe('determineOrientation', () => {
    it('identifies landscape orientation when width > height', () => {
      expect(determineOrientation(3840, 2160)).toBe('landscape');
    });

    it('identifies portrait orientation when height > width', () => {
      expect(determineOrientation(1170, 2532)).toBe('portrait');
    });

    it('identifies square orientation when width === height', () => {
      expect(determineOrientation(2000, 2000)).toBe('square');
    });
  });

  describe('calculateResolutionLabel', () => {
    it('returns 8K for dimensions >= 7680', () => {
      expect(calculateResolutionLabel(7680, 4320)).toBe('8K');
    });

    it('returns 4K for 3840x2160', () => {
      expect(calculateResolutionLabel(3840, 2160)).toBe('4K');
    });

    it('identifies QHD+ Ultrawide for 3440x1440', () => {
      expect(calculateResolutionLabel(3440, 1440)).toBe('QHD+ Ultrawide');
    });

    it('returns QHD for 2560x1440', () => {
      expect(calculateResolutionLabel(2560, 1440)).toBe('QHD');
    });

    it('returns FHD for 1920x1080', () => {
      expect(calculateResolutionLabel(1920, 1080)).toBe('FHD');
    });

    it('returns HD for 1280x720', () => {
      expect(calculateResolutionLabel(1280, 720)).toBe('HD');
    });

    it('returns Custom for smaller resolutions', () => {
      expect(calculateResolutionLabel(800, 600)).toBe('Custom');
    });
  });

  describe('generateSlug', () => {
    it('converts title to clean URL slug', () => {
      expect(generateSlug('Misty Alpine Impasto!')).toBe('misty-alpine-impasto');
    });

    it('handles diacritics and multiple spaces', () => {
      expect(generateSlug('  Café   Renoir  ')).toBe('cafe-renoir');
    });

    it('truncates slug at max 100 characters', () => {
      const longTitle = 'a'.repeat(150);
      const slug = generateSlug(longTitle);
      expect(slug.length).toBeLessThanOrEqual(100);
    });

    it('throws error for empty title', () => {
      expect(() => generateSlug('')).toThrow();
      expect(() => generateSlug('   ')).toThrow();
    });
  });

  describe('sanitizeFilename', () => {
    it('sanitizes titles with illegal filesystem characters', () => {
      const safe = sanitizeFilename('Misty: Alpine/Impasto? (4K)', 'png');
      expect(safe).toBe('Misty-Alpine-Impasto-(4K).png');
    });

    it('handles missing or invalid inputs gracefully', () => {
      expect(sanitizeFilename('', '')).toBe('wallpaper.jpg');
      expect(sanitizeFilename('Test Title', '.WEBP')).toBe('Test-Title.webp');
    });
  });

  describe('calculateSHA256', () => {
    it('generates consistent SHA-256 hash string', async () => {
      const buffer = new TextEncoder().encode('Elysium Wallpaper System');
      const hash = await calculateSHA256(buffer);
      expect(hash).toHaveLength(64);
      expect(typeof hash).toBe('string');

      const hash2 = await calculateSHA256(buffer);
      expect(hash).toBe(hash2);
    });

    it('throws error for null or undefined buffer', async () => {
      await expect(calculateSHA256(null as any)).rejects.toThrow();
    });
  });

  describe('getMimeType', () => {
    it('resolves correct MIME types from filenames or extensions', () => {
      expect(getMimeType('wallpaper.jpg')).toBe('image/jpeg');
      expect(getMimeType('wallpaper.jpeg')).toBe('image/jpeg');
      expect(getMimeType('wallpaper.png')).toBe('image/png');
      expect(getMimeType('wallpaper.webp')).toBe('image/webp');
      expect(getMimeType('wallpaper.avif')).toBe('image/avif');
      expect(getMimeType('wallpaper.jpg?v=123')).toBe('image/jpeg');
      expect(getMimeType('unknown.xyz')).toBe('application/octet-stream');
    });
  });
});
