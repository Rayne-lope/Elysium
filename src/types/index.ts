/**
 * Core Domain Interfaces for Elysium Wallpaper Platform
 */

export type OrientationType = 'landscape' | 'portrait' | 'square';
export type WallpaperStatus = 'draft' | 'published' | 'archived';
export type PublicSurface =
  | 'default'
  | 'home-luxury'
  | 'detail-luxury'
  | 'explore-luxury'
  | 'categories-luxury'
  | 'search-luxury'
  | 'tag-luxury'
  | 'popular-luxury'
  | 'error-luxury';

export interface Category {
  id: string;
  slug: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Tag {
  id: string;
  slug: string;
  name: string;
  createdAt: string;
}

export interface Wallpaper {
  id: string;
  slug: string;
  title: string;
  description?: string;
  categoryId?: string;
  category?: Category;
  tags?: Tag[];

  width: number;
  height: number;
  aspectRatio: number;
  orientation: OrientationType;

  format: string;
  mimeType: string;
  fileSize: number;
  resolutionLabel?: string;

  originalR2Key: string;
  preview480Key?: string;
  preview960Key?: string;
  preview1600Key?: string;
  previewFallbackKey?: string;

  fileHash?: string;

  creator?: string;
  sourceProvenance?: string;
  sourceProvider?: string;
  sourceExternalId?: string;
  sourceUrl?: string;
  creatorUrl?: string;
  licenseNote?: string;

  status: WallpaperStatus;
  isFeatured: boolean;
  downloadCount: number;

  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}
