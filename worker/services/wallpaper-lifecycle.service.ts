import type { Wallpaper } from '@/types';
import { DBService } from './db.service';
import { R2StorageService } from './r2.service';

export interface LifecycleBindings {
  db: D1Database;
  originalBucket: R2Bucket;
  previewBucket: R2Bucket;
}

function requiredKeys(wallpaper: Wallpaper): string[] {
  return [
    wallpaper.preview480Key,
    wallpaper.preview960Key,
    wallpaper.preview1600Key,
    wallpaper.previewFallbackKey,
  ].filter((key): key is string => Boolean(key));
}

export class WallpaperLifecycleService {
  static async assertPublishable(bindings: LifecycleBindings, wallpaper: Wallpaper): Promise<void> {
    if (!wallpaper.title.trim() || wallpaper.width <= 0 || wallpaper.height <= 0 || !wallpaper.fileHash
      || !wallpaper.originalR2Key || requiredKeys(wallpaper).length !== 4) {
      throw new Error('Wallpaper metadata and all preview keys are required before publishing');
    }
    if (wallpaper.sourceProvider
      && (!wallpaper.sourceExternalId || !wallpaper.sourceUrl || !wallpaper.creator || !wallpaper.sourceProvenance
        || !wallpaper.licenseNote)) {
      throw new Error('External source provenance is incomplete');
    }
    const [originalExists, ...previewExists] = await Promise.all([
      R2StorageService.objectExists(bindings.originalBucket, wallpaper.originalR2Key),
      ...requiredKeys(wallpaper).map((key) => R2StorageService.objectExists(bindings.previewBucket, key)),
    ]);
    if (!originalExists || previewExists.some((exists) => !exists)) {
      throw new Error('Original and preview assets must exist before publishing');
    }
  }

  static async safeDelete(bindings: LifecycleBindings, wallpaper: Wallpaper): Promise<void> {
    const now = new Date().toISOString();
    await bindings.db.prepare(
      "UPDATE wallpapers SET status = 'archived', published_at = NULL, updated_at = ? WHERE id = ?"
    ).bind(now, wallpaper.id).run();
    await R2StorageService.deleteWallpaperAssets(
      bindings.originalBucket,
      bindings.previewBucket,
      wallpaper.originalR2Key,
      requiredKeys(wallpaper)
    );
    await DBService.deleteWallpaper(bindings.db, wallpaper.id);
  }
}
