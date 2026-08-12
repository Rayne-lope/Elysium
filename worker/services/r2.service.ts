import { sanitizeFilename } from '../../src/lib/metadata';

/**
 * Cloudflare R2 Storage Service for Elysium Wallpaper Platform
 * 
 * Enforces key separation convention:
 * - Original Bucket: original/{wallpaperId}/original.{ext}
 * - Preview Bucket: preview/{wallpaperId}/[480|960|1600].avif & fallback.webp
 */

export interface PreviewKeys {
  p480: string;
  p960: string;
  p1600: string;
  fallback: string;
}

export class R2StorageService {
  /**
   * Sanitizes object key parameters against path traversal.
   */
  private static sanitizeKeySegment(segment: string): string {
    return segment.replace(/[^a-zA-Z0-9_-]/g, '');
  }

  /**
   * Generates R2 object key for original master asset.
   */
  static getOriginalKey(wallpaperId: string, extension: string): string {
    const cleanId = this.sanitizeKeySegment(wallpaperId);
    const cleanExt = extension.replace(/^\./, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return `original/${cleanId}/original.${cleanExt || 'jpg'}`;
  }

  /**
   * Generates object keys for preview asset variants.
   */
  static getPreviewKeys(wallpaperId: string): PreviewKeys {
    const cleanId = this.sanitizeKeySegment(wallpaperId);
    return {
      p480: `preview/${cleanId}/480.avif`,
      p960: `preview/${cleanId}/960.avif`,
      p1600: `preview/${cleanId}/1600.avif`,
      fallback: `preview/${cleanId}/fallback.webp`,
    };
  }

  /**
   * Checks if an object exists in R2 without reading body payload.
   */
  static async objectExists(bucket: R2Bucket, key: string): Promise<boolean> {
    if (!key) return false;
    const object = await bucket.head(key);
    return object !== null;
  }

  /**
   * Uploads untouched original file to original R2 bucket.
   */
  static async uploadOriginal(
    bucket: R2Bucket,
    wallpaperId: string,
    extension: string,
    body: ArrayBuffer | ReadableStream,
    contentType: string
  ): Promise<string> {
    const key = this.getOriginalKey(wallpaperId, extension);
    
    await bucket.put(key, body, {
      httpMetadata: {
        contentType,
        cacheControl: 'public, max-age=31536000, immutable',
      },
      customMetadata: {
        wallpaperId,
        uploadedAt: new Date().toISOString(),
      },
    });

    return key;
  }

  /**
   * Uploads an optimized preview asset variant to preview R2 bucket.
   */
  static async uploadPreview(
    bucket: R2Bucket,
    key: string,
    body: ArrayBuffer | ReadableStream,
    contentType: string
  ): Promise<string> {
    await bucket.put(key, body, {
      httpMetadata: {
        contentType,
        cacheControl: 'public, max-age=31536000, immutable',
      },
    });

    return key;
  }

  /**
   * Fetches object from R2 bucket.
   */
  static async getObject(bucket: R2Bucket, key: string): Promise<R2ObjectBody | null> {
    if (!key) return null;
    return await bucket.get(key);
  }

  /**
   * Safely deletes all associated R2 assets (original + previews) for a wallpaper.
   */
  static async deleteWallpaperAssets(
    originalBucket: R2Bucket,
    previewBucket: R2Bucket,
    originalKey?: string,
    previewKeys?: string[]
  ): Promise<void> {
    const promises: Promise<void>[] = [];

    if (originalKey && originalKey.trim()) {
      promises.push(originalBucket.delete(originalKey.trim()));
    }

    if (previewKeys && Array.isArray(previewKeys)) {
      const validPreviewKeys = previewKeys
        .map(k => (k ? k.trim() : ''))
        .filter(k => k.length > 0);
      
      if (validPreviewKeys.length > 0) {
        promises.push(previewBucket.delete(validPreviewKeys));
      }
    }

    await Promise.all(promises);
  }

  /**
   * Generates standard HTTP headers for downloading original wallpaper files.
   */
  static generateDownloadHeaders(
    title: string,
    format: string,
    mimeType: string
  ): Record<string, string> {
    const filename = sanitizeFilename(title, format);
    const fallback = filename.normalize('NFKD').replace(/[^\x20-\x7E]/g, '').replace(/["\\]/g, '-') || `wallpaper.${format}`;
    const encoded = encodeURIComponent(filename).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
    return {
      'Content-Type': mimeType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`,
      'Cache-Control': 'public, max-age=31536000, immutable',
    };
  }
}
