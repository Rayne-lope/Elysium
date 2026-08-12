import type { OrientationType } from '@/types';
import type { ListWallpaperFilters } from '@worker/services/db.service';
import { HttpError } from './http';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ID_PATTERN = /^(?:wp|cat|tag)_[a-zA-Z0-9_-]{1,120}$/;

export function asObject(value: unknown, message = 'Request body must be an object'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(message, 400, 'INVALID_BODY');
  }
  return value as Record<string, unknown>;
}

export function assertAllowedKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(value).find((key) => !allowedSet.has(key));
  if (unexpected) throw new HttpError(`Unexpected field: ${unexpected}`, 400, 'VALIDATION_ERROR');
}

export function boundedString(
  value: unknown,
  field: string,
  options: { min?: number; max: number; optional?: boolean; trim?: boolean } = { max: 100 }
): string | undefined {
  if (value === undefined || value === null) {
    if (options.optional) return undefined;
    throw new HttpError(`${field} is required`, 400, 'VALIDATION_ERROR');
  }
  if (typeof value !== 'string') throw new HttpError(`${field} must be a string`, 400, 'VALIDATION_ERROR');
  const result = options.trim === false ? value : value.trim();
  if (result.length < (options.min ?? 0) || result.length > options.max) {
    throw new HttpError(`${field} must be between ${options.min ?? 0} and ${options.max} characters`, 400, 'VALIDATION_ERROR');
  }
  return result;
}

export function optionalId(value: unknown, field: string, prefix?: 'wp' | 'cat' | 'tag'): string | undefined {
  const result = boundedString(value, field, { max: 128, optional: true });
  if (!result) return undefined;
  if (!ID_PATTERN.test(result) || (prefix && !result.startsWith(`${prefix}_`))) {
    throw new HttpError(`${field} is invalid`, 400, 'VALIDATION_ERROR');
  }
  return result;
}

export function requireId(value: unknown, field: string): string {
  const result = optionalId(value, field);
  if (!result) throw new HttpError(`${field} is required`, 400, 'VALIDATION_ERROR');
  return result;
}

export function validateSlug(value: string, field = 'slug'): string {
  if (value.length > 100 || !SLUG_PATTERN.test(value)) {
    throw new HttpError(`${field} is invalid`, 400, 'VALIDATION_ERROR');
  }
  return value;
}

export function parseInteger(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
  field: string
): number {
  if (raw === null || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) throw new HttpError(`${field} must be an integer`, 400, 'VALIDATION_ERROR');
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new HttpError(`${field} must be between ${min} and ${max}`, 400, 'VALIDATION_ERROR');
  }
  return value;
}

export function parseWallpaperFilters(params: URLSearchParams, publicOnly = true): ListWallpaperFilters {
  const allowed = new Set(['page', 'limit', 'category', 'tag', 'orientation', 'q', 'sort']);
  if (!publicOnly) allowed.add('status');
  const unexpected = [...params.keys()].find((key) => !allowed.has(key));
  if (unexpected) throw new HttpError(`Unexpected query parameter: ${unexpected}`, 400, 'VALIDATION_ERROR');
  const orientationRaw = params.get('orientation') || '';
  if (orientationRaw && !['landscape', 'portrait', 'square'].includes(orientationRaw)) {
    throw new HttpError('Invalid orientation', 400, 'VALIDATION_ERROR');
  }
  const sortRaw = params.get('sort') || 'newest';
  if (!['newest', 'popular', 'featured'].includes(sortRaw)) {
    throw new HttpError('Invalid sort order', 400, 'VALIDATION_ERROR');
  }
  const category = params.get('category') || undefined;
  const tag = params.get('tag') || undefined;
  if (category) validateSlug(category, 'category');
  if (tag) validateSlug(tag, 'tag');
  const query = boundedString(params.get('q') ?? undefined, 'q', { max: 100, optional: true });

  return {
    page: parseInteger(params.get('page'), 1, 1, 500, 'page'),
    limit: parseInteger(params.get('limit'), 20, 1, 50, 'limit'),
    status: publicOnly ? 'published' : undefined,
    categorySlug: category,
    tagSlug: tag,
    orientation: orientationRaw ? orientationRaw as OrientationType : undefined,
    searchQuery: query || undefined,
    sortBy: sortRaw as NonNullable<ListWallpaperFilters['sortBy']>,
  };
}

export function uniqueStringArray(value: unknown, field: string, maxItems = 20, maxLength = 50): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new HttpError(`${field} must contain at most ${maxItems} items`, 400, 'VALIDATION_ERROR');
  }
  const values = value.map((item) => {
    if (typeof item !== 'string' || item.length === 0 || item.length > maxLength) {
      throw new HttpError(`${field} contains an invalid item`, 400, 'VALIDATION_ERROR');
    }
    return item;
  });
  return [...new Set(values)];
}
