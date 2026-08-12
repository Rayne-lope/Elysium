import { R2StorageService, type PreviewKeys } from './r2.service';
import { inspectImageHeader } from '@/lib/image-inspector';

export interface GeneratedPreviewKeys {
  preview480Key: string;
  preview960Key: string;
  preview1600Key: string;
  previewFallbackKey: string;
  all: string[];
}

export interface ProvidedPreviewSet {
  p480: ArrayBuffer;
  p960: ArrayBuffer;
  p1600: ArrayBuffer;
  fallback: ArrayBuffer;
  mimeType: 'image/webp';
}

interface PreviewVariant {
  key: keyof PreviewKeys;
  width: number;
  format: 'image/avif' | 'image/webp';
  quality: number;
}

export interface RasterImageInfo {
  format: string;
  fileSize: number;
  width: number;
  height: number;
}

const PREVIEW_VARIANTS: PreviewVariant[] = [
  { key: 'p480', width: 480, format: 'image/avif', quality: 80 },
  { key: 'p960', width: 960, format: 'image/avif', quality: 82 },
  { key: 'p1600', width: 1600, format: 'image/avif', quality: 84 },
  { key: 'fallback', width: 1600, format: 'image/webp', quality: 84 },
];

function streamFromBuffer(buffer: ArrayBuffer): ReadableStream<Uint8Array> {
  const body = new Response(buffer).body;
  if (!body) throw new Error('Unable to create image stream');
  return body;
}

export class ImagePreviewService {
  static async inspect(images: ImagesBinding, buffer: ArrayBuffer): Promise<RasterImageInfo> {
    const info = await images.info(streamFromBuffer(buffer));
    if (info.format === 'image/svg+xml' || !('width' in info) || info.width <= 0 || info.height <= 0) {
      throw new Error('Source asset is not a supported raster image');
    }
    return info as RasterImageInfo;
  }

  static async generateAndStore(
    images: ImagesBinding,
    previewBucket: R2Bucket,
    wallpaperId: string,
    original: ArrayBuffer
  ): Promise<GeneratedPreviewKeys> {
    const keys = R2StorageService.getPreviewKeys(wallpaperId);
    const uploaded: string[] = [];

    try {
      for (const variant of PREVIEW_VARIANTS) {
        const transformation = await images
          .input(streamFromBuffer(original))
          .transform({ width: variant.width, fit: 'scale-down' })
          .output({ format: variant.format, quality: variant.quality, anim: false });
        const response = transformation.response();
        if (!response.ok) throw new Error(`Preview ${variant.width}px generation failed`);
        const bytes = await response.arrayBuffer();
        const output = inspectImageHeader(bytes);
        if (output.mimeType !== variant.format || output.width > variant.width || output.height <= 0) {
          throw new Error(`Preview ${variant.width}px output failed validation`);
        }
        const key = keys[variant.key];
        await R2StorageService.uploadPreview(
          previewBucket,
          key,
          bytes,
          variant.format
        );
        uploaded.push(key);
      }
    } catch (error) {
      if (uploaded.length > 0) await previewBucket.delete(uploaded).catch(() => undefined);
      throw error;
    }

    return {
      preview480Key: keys.p480,
      preview960Key: keys.p960,
      preview1600Key: keys.p1600,
      previewFallbackKey: keys.fallback,
      all: uploaded,
    };
  }

  static async storeProvided(
    previewBucket: R2Bucket,
    wallpaperId: string,
    previews: ProvidedPreviewSet,
    source: { width: number; height: number }
  ): Promise<GeneratedPreviewKeys> {
    const entries = [
      { key: `preview/${wallpaperId}/480.webp`, bytes: previews.p480 },
      { key: `preview/${wallpaperId}/960.webp`, bytes: previews.p960 },
      { key: `preview/${wallpaperId}/1600.webp`, bytes: previews.p1600 },
      { key: `preview/${wallpaperId}/fallback.webp`, bytes: previews.fallback },
    ];
    if (entries.some((entry) => !entry.bytes.byteLength || entry.bytes.byteLength > 10 * 1024 * 1024)) {
      throw new Error('Provided preview asset is empty or too large');
    }
    const targets = [480, 960, 1600, 1600];
    entries.forEach((entry, index) => {
      const info = inspectImageHeader(entry.bytes);
      const scale = Math.min(1, targets[index] / Math.max(source.width, source.height));
      const expectedWidth = Math.max(1, Math.round(source.width * scale));
      const expectedHeight = Math.max(1, Math.round(source.height * scale));
      if (info.mimeType !== previews.mimeType || info.width !== expectedWidth || info.height !== expectedHeight) {
        throw new Error(`Provided preview ${targets[index]}px failed format or dimension validation`);
      }
    });
    const uploaded: string[] = [];
    try {
      for (const entry of entries) {
        await R2StorageService.uploadPreview(previewBucket, entry.key, entry.bytes, previews.mimeType);
        uploaded.push(entry.key);
      }
    } catch (error) {
      if (uploaded.length > 0) await previewBucket.delete(uploaded).catch(() => undefined);
      throw error;
    }
    return {
      preview480Key: entries[0].key,
      preview960Key: entries[1].key,
      preview1600Key: entries[2].key,
      previewFallbackKey: entries[3].key,
      all: uploaded,
    };
  }
}
