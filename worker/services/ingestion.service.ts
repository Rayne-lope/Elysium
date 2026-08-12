import { calculateAspectRatio, calculateResolutionLabel, calculateSHA256, generateSlug } from '@/lib/metadata';
import type { Wallpaper, WallpaperStatus } from '@/types';
import { normalizePixabayTags } from '@/services/pixabay/pixabay.mapper';
import { inspectImageHeader } from '@/lib/image-inspector';
import { DBService } from './db.service';
import { ImagePreviewService, type ProvidedPreviewSet, type RasterImageInfo } from './image-preview.service';
import { R2StorageService } from './r2.service';
import { WallpaperLifecycleService } from './wallpaper-lifecycle.service';

const ALLOWED_SOURCE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

export interface IngestionBindings {
  db: D1Database;
  originalBucket: R2Bucket;
  previewBucket: R2Bucket;
  images: ImagesBinding;
}

export interface IngestionAsset {
  bytes: ArrayBuffer;
  mimeType: string;
  title: string;
  description?: string;
  creator?: string;
  tags?: string[];
  tagIds?: string[];
  categoryId?: string;
  categorySlug?: string;
  sourceProvider?: string;
  sourceExternalId?: string;
  sourceUrl?: string;
  creatorUrl?: string;
  sourceProvenance?: string;
  licenseNote?: string;
  status?: WallpaperStatus;
  isFeatured?: boolean;
  declaredWidth?: number;
  declaredHeight?: number;
  providedPreviews?: ProvidedPreviewSet;
}

export type IngestionResult =
  | { status: 'imported'; wallpaper: Wallpaper }
  | { status: 'duplicate'; reason: string; wallpaperId?: string };

function extensionForMime(mimeType: string): string {
  const extensions: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/avif': 'avif',
  };
  return extensions[mimeType] || 'jpg';
}

function createId(): string {
  return `wp_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

export class WallpaperIngestionService {
  static async ingest(bindings: IngestionBindings, asset: IngestionAsset): Promise<IngestionResult> {
    const provider = asset.sourceProvider?.trim().toLowerCase();
    const externalId = asset.sourceExternalId?.trim();
    if (provider && externalId) {
      const existing = await DBService.checkExternalSource(bindings.db, provider, externalId);
      if (existing) {
        return { status: 'duplicate', reason: 'Already imported from this provider', wallpaperId: existing.id };
      }
    }

    if (!asset.bytes.byteLength) throw new Error('Source asset is empty');
    if (!ALLOWED_SOURCE_MIME_TYPES.has(asset.mimeType)) throw new Error('Unsupported source image type');

    const header = inspectImageHeader(asset.bytes);
    if (header.mimeType !== asset.mimeType) throw new Error('Source Content-Type does not match image signature');
    let info: RasterImageInfo;
    if (asset.bytes.byteLength <= 20 * 1024 * 1024) {
      info = await ImagePreviewService.inspect(bindings.images, asset.bytes);
      if (info.width !== header.width || info.height !== header.height) {
        throw new Error('Source image metadata is inconsistent');
      }
    } else {
      if (!asset.providedPreviews || !asset.declaredWidth || !asset.declaredHeight) {
        throw new Error('Images over 20 MB require validated dimensions and provided previews');
      }
      if (asset.declaredWidth !== header.width || asset.declaredHeight !== header.height) {
        throw new Error('Declared dimensions do not match the image header');
      }
      info = {
        format: header.mimeType,
        fileSize: asset.bytes.byteLength,
        width: asset.declaredWidth,
        height: asset.declaredHeight,
      };
    }
    if (info.format !== asset.mimeType && !(info.format === 'image/jpg' && asset.mimeType === 'image/jpeg')) {
      throw new Error('Source Content-Type does not match image data');
    }

    const fileHash = await calculateSHA256(asset.bytes);
    const hashDuplicate = await DBService.checkDuplicateHash(bindings.db, fileHash);
    if (hashDuplicate) {
      return { status: 'duplicate', reason: 'Identical source file already exists', wallpaperId: hashDuplicate.id };
    }

    const id = createId();
    const title = asset.title.trim().slice(0, 150) || `Wallpaper ${externalId || id}`;
    const slugSuffix = externalId || id.slice(-8);
    const slug = generateSlug(`${title}-${slugSuffix}`);
    const extension = extensionForMime(asset.mimeType);
    const categoryId = await this.resolveCategory(bindings.db, asset.categoryId, asset.categorySlug);
    const tagIds = await this.resolveTags(bindings.db, asset.tags || [], asset.tagIds || []);
    let originalKey: string | undefined;
    let previewKeys: string[] = [];

    try {
      originalKey = await R2StorageService.uploadOriginal(
        bindings.originalBucket,
        id,
        extension,
        asset.bytes,
        asset.mimeType
      );
      const previews = asset.providedPreviews
        ? await ImagePreviewService.storeProvided(bindings.previewBucket, id, asset.providedPreviews, info)
        : await ImagePreviewService.generateAndStore(bindings.images, bindings.previewBucket, id, asset.bytes);
      previewKeys = previews.all;
      const now = new Date().toISOString();
      const wallpaper: Wallpaper = {
        id,
        slug,
        title,
        description: asset.description?.trim().slice(0, 2000),
        categoryId,
        width: info.width,
        height: info.height,
        aspectRatio: calculateAspectRatio(info.width, info.height),
        orientation: info.width > info.height ? 'landscape' : info.height > info.width ? 'portrait' : 'square',
        format: extension,
        mimeType: asset.mimeType,
        fileSize: asset.bytes.byteLength,
        resolutionLabel: calculateResolutionLabel(info.width, info.height),
        originalR2Key: originalKey,
        preview480Key: previews.preview480Key,
        preview960Key: previews.preview960Key,
        preview1600Key: previews.preview1600Key,
        previewFallbackKey: previews.previewFallbackKey,
        fileHash,
        creator: asset.creator,
        sourceProvenance: asset.sourceProvenance,
        sourceProvider: provider,
        sourceExternalId: externalId,
        sourceUrl: asset.sourceUrl,
        creatorUrl: asset.creatorUrl,
        licenseNote: asset.licenseNote,
        status: asset.status || 'draft',
        isFeatured: asset.isFeatured || false,
        downloadCount: 0,
        createdAt: now,
        updatedAt: now,
        publishedAt: asset.status === 'published' ? now : undefined,
      };
      if (wallpaper.status === 'published') {
        await WallpaperLifecycleService.assertPublishable(bindings, wallpaper);
      }
      return { status: 'imported', wallpaper: await DBService.createWallpaper(bindings.db, wallpaper, tagIds) };
    } catch (error) {
      await R2StorageService.deleteWallpaperAssets(
        bindings.originalBucket,
        bindings.previewBucket,
        originalKey,
        previewKeys
      ).catch(() => undefined);
      const sourceDuplicate = provider && externalId
        ? await DBService.checkExternalSource(bindings.db, provider, externalId).catch(() => null)
        : null;
      const duplicate = sourceDuplicate || await DBService.checkDuplicateHash(bindings.db, fileHash).catch(() => null);
      if (duplicate) {
        return { status: 'duplicate', reason: 'Wallpaper was imported concurrently', wallpaperId: duplicate.id };
      }
      throw error;
    }
  }

  private static async resolveCategory(
    db: D1Database,
    categoryId?: string,
    categorySlug?: string
  ): Promise<string | undefined> {
    if (categoryId) {
      const category = await DBService.getCategoryById(db, categoryId);
      if (!category) throw new Error('Unknown category selected');
      return category.id;
    }
    if (categorySlug) {
      const category = await DBService.getCategoryBySlug(db, categorySlug);
      if (!category) throw new Error('Mapped category does not exist');
      return category.id;
    }
    return undefined;
  }

  private static async resolveTags(db: D1Database, tags: string[], requestedTagIds: string[]): Promise<string[]> {
    const normalized = normalizePixabayTags(tags);
    const existing = await DBService.getTags(db);
    const validIds = new Set(existing.map((tag) => tag.id));
    if (requestedTagIds.some((id) => !validIds.has(id))) throw new Error('Unknown tag selected');
    if (normalized.length === 0) return [...new Set(requestedTagIds)];
    const bySlug = new Map(existing.map((tag) => [tag.slug, tag.id]));
    const ids: string[] = [];
    for (const slug of normalized) {
      const existingId = bySlug.get(slug);
      if (existingId) {
        ids.push(existingId);
        continue;
      }
      const created = await DBService.createTag(db, {
        id: `tag_${slug.slice(0, 30)}_${crypto.randomUUID().slice(0, 6)}`,
        slug,
        name: slug.replace(/-/g, ' '),
      });
      bySlug.set(slug, created.id);
      ids.push(created.id);
    }
    return [...new Set([...requestedTagIds, ...ids])];
  }
}
