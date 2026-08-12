import { HttpError } from './http';
import { validateUploadFile } from './image-processor';
import { getMimeType } from './metadata';
import type { WallpaperStatus } from '@/types';
import type { ProvidedPreviewSet } from '@worker/services/image-preview.service';

const TRANSFORM_LIMIT = 20 * 1024 * 1024;
const PREVIEW_LIMIT = 10 * 1024 * 1024;

export interface ParsedWallpaperUpload {
  file: File;
  mimeType: string;
  title: string;
  description?: string;
  creator?: string;
  categoryId?: string;
  tagIds: string[];
  sourceProvenance?: string;
  licenseNote?: string;
  status: WallpaperStatus;
  isFeatured: boolean;
  declaredWidth: number;
  declaredHeight: number;
  providedPreviews?: ProvidedPreviewSet;
}

function text(form: FormData, name: string, max: number, required = false): string | undefined {
  const raw = form.get(name);
  if (raw === null || raw === '') {
    if (required) throw new HttpError(`${name} is required`, 400, 'VALIDATION_ERROR');
    return undefined;
  }
  if (typeof raw !== 'string') throw new HttpError(`${name} must be text`, 400, 'VALIDATION_ERROR');
  const value = raw.trim();
  if ((required && !value) || value.length > max) {
    throw new HttpError(`${name} is invalid`, 400, 'VALIDATION_ERROR');
  }
  return value || undefined;
}

function dimension(form: FormData, name: string): number {
  const value = Number(text(form, name, 10, true));
  if (!Number.isSafeInteger(value) || value <= 0 || value > 100_000) {
    throw new HttpError(`${name} is invalid`, 400, 'VALIDATION_ERROR');
  }
  return value;
}

async function providedPreviews(form: FormData, required: boolean): Promise<ProvidedPreviewSet | undefined> {
  const values = ['p480File', 'p960File', 'p1600File', 'fallbackFile'].map((name) => form.get(name));
  const present = values.filter((value) => value instanceof File).length;
  if (!required) return undefined;
  if (present !== 4) throw new HttpError('All WebP previews are required for originals over 20 MB', 400, 'PREVIEWS_REQUIRED');
  const files = values as File[];
  if (files.some((file) => file.type !== 'image/webp' || file.size <= 0 || file.size > PREVIEW_LIMIT)) {
    throw new HttpError('Provided previews must be valid WebP files under 10 MB', 400, 'INVALID_PREVIEW');
  }
  return {
    p480: await files[0].arrayBuffer(),
    p960: await files[1].arrayBuffer(),
    p1600: await files[2].arrayBuffer(),
    fallback: await files[3].arrayBuffer(),
    mimeType: 'image/webp',
  };
}

export async function parseWallpaperUpload(form: FormData, fallbackTitle?: string): Promise<ParsedWallpaperUpload> {
  const allowedFields = new Set([
    'originalFile', 'title', 'description', 'creator', 'categoryId', 'tagIds', 'sourceProvenance',
    'licenseNote', 'status', 'isFeatured', 'width', 'height', 'fileHash',
    'p480File', 'p960File', 'p1600File', 'fallbackFile',
  ]);
  const unexpected = [...form.keys()].find((key) => !allowedFields.has(key));
  if (unexpected) throw new HttpError(`Unexpected field: ${unexpected}`, 400, 'VALIDATION_ERROR');
  const fileValue = form.get('originalFile');
  const file = fileValue instanceof File ? fileValue : null;
  const validation = validateUploadFile(file);
  if (!validation.valid || !file) throw new HttpError(validation.error || 'Invalid file', 400, 'INVALID_FILE');
  const title = text(form, 'title', 150) || fallbackTitle?.trim().slice(0, 150);
  if (!title) throw new HttpError('title is required', 400, 'VALIDATION_ERROR');
  const statusValue = text(form, 'status', 20) || 'draft';
  if (!['draft', 'published', 'archived'].includes(statusValue)) {
    throw new HttpError('status is invalid', 400, 'VALIDATION_ERROR');
  }
  const featuredValue = text(form, 'isFeatured', 5);
  if (featuredValue !== undefined && !['true', 'false'].includes(featuredValue)) {
    throw new HttpError('isFeatured is invalid', 400, 'VALIDATION_ERROR');
  }
  let tagIds: string[] = [];
  const rawTags = text(form, 'tagIds', 3000);
  if (rawTags) {
    let parsed: unknown;
    try { parsed = JSON.parse(rawTags) as unknown; } catch { throw new HttpError('tagIds is invalid', 400, 'VALIDATION_ERROR'); }
    if (!Array.isArray(parsed) || parsed.length > 20
      || parsed.some((value) => typeof value !== 'string' || !/^tag_[a-zA-Z0-9_-]{1,120}$/.test(value))) {
      throw new HttpError('tagIds is invalid', 400, 'VALIDATION_ERROR');
    }
    tagIds = [...new Set(parsed)];
  }
  return {
    file,
    mimeType: (file.type || getMimeType(file.name)).toLowerCase(),
    title,
    description: text(form, 'description', 2000),
    creator: text(form, 'creator', 200),
    categoryId: text(form, 'categoryId', 128),
    tagIds,
    sourceProvenance: text(form, 'sourceProvenance', 500),
    licenseNote: text(form, 'licenseNote', 500),
    status: statusValue as WallpaperStatus,
    isFeatured: featuredValue === 'true',
    declaredWidth: dimension(form, 'width'),
    declaredHeight: dimension(form, 'height'),
    providedPreviews: await providedPreviews(form, file.size > TRANSFORM_LIMIT),
  };
}
