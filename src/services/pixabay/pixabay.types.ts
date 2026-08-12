import type { OrientationType } from '@/types';

export type PixabayOrientation = 'all' | 'horizontal' | 'vertical';
export type PixabayOrder = 'popular' | 'latest';

export interface PixabaySearchParams {
  q: string;
  page: number;
  perPage: number;
  orientation: PixabayOrientation;
  category?: string;
  minWidth: number;
  minHeight: number;
  order: PixabayOrder;
}

export interface PixabayApiImage {
  id: number;
  pageURL: string;
  type: string;
  tags: string;
  previewURL: string;
  previewWidth: number;
  previewHeight: number;
  webformatURL: string;
  webformatWidth: number;
  webformatHeight: number;
  largeImageURL: string;
  fullHDURL?: string;
  imageURL?: string;
  imageWidth: number;
  imageHeight: number;
  imageSize: number;
  views: number;
  downloads: number;
  likes: number;
  user_id: number;
  user: string;
}

export interface PixabayApiSearchResponse {
  total: number;
  totalHits: number;
  hits: PixabayApiImage[];
}

export interface PixabaySearchImage {
  pixabayId: number;
  previewUrl: string;
  sourceUrl: string;
  creator: string;
  creatorUrl: string;
  tags: string[];
  width: number;
  height: number;
  fileSize: number;
  orientation: OrientationType;
  title: string;
  likes: number;
  views: number;
  downloads: number;
}

/** Server-only import metadata. Never serialize this type from an API route. */
export interface PixabayImportImage extends PixabaySearchImage {
  sourceAssetUrl: string;
}

export interface PixabaySearchResponse {
  total: number;
  totalHits: number;
  page: number;
  perPage: number;
  images: PixabaySearchImage[];
  meta: { cache: 'hit' | 'miss' | 'stale' };
}

export interface PixabayImportRequest {
  images: Array<{ pixabayId: number }>;
  settings?: {
    defaultCategoryId?: string;
    sourceCategory?: string;
    additionalTags?: string[];
  };
}

export type PixabayImportItemStatus = 'imported' | 'duplicate' | 'failed';

export interface PixabayImportItemResult {
  pixabayId: number;
  status: PixabayImportItemStatus;
  wallpaperId?: string;
  title?: string;
  reason?: string;
}

export interface PixabayImportResult {
  imported: number;
  duplicate: number;
  failed: number;
  total: number;
  items: PixabayImportItemResult[];
}
