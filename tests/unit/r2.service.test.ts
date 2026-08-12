import { describe, it, expect } from 'vitest';
import { R2StorageService } from '../../worker/services/r2.service';

describe('R2StorageService Hardening Tests', () => {
  it('generates correct original asset R2 key path with sanitization', () => {
    const key = R2StorageService.getOriginalKey('wp_123', 'jpg');
    expect(key).toBe('original/wp_123/original.jpg');

    const key2 = R2StorageService.getOriginalKey('../wp_456/test', '.PNG');
    expect(key2).toBe('original/wp_456test/original.png');
  });

  it('generates correct preview asset variant keys', () => {
    const keys = R2StorageService.getPreviewKeys('wp_789');
    expect(keys.p480).toBe('preview/wp_789/480.avif');
    expect(keys.p960).toBe('preview/wp_789/960.avif');
    expect(keys.p1600).toBe('preview/wp_789/1600.avif');
    expect(keys.fallback).toBe('preview/wp_789/fallback.webp');
  });

  it('generates valid download HTTP headers for original file downloads', () => {
    const headers = R2StorageService.generateDownloadHeaders('Misty Alpine 4K', 'jpg', 'image/jpeg');
    expect(headers['Content-Type']).toBe('image/jpeg');
    expect(headers['Content-Disposition']).toBe('attachment; filename="Misty-Alpine-4K.jpg"; filename*=UTF-8\'\'Misty-Alpine-4K.jpg');
    expect(headers['Cache-Control']).toBe('public, max-age=31536000, immutable');
  });

  it('handles deleteWallpaperAssets safely with empty inputs', async () => {
    const mockOriginalBucket = { delete: async () => {} } as any;
    const mockPreviewBucket = { delete: async () => {} } as any;

    await expect(
      R2StorageService.deleteWallpaperAssets(mockOriginalBucket, mockPreviewBucket, '', [])
    ).resolves.not.toThrow();
  });
});
