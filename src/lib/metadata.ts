import type { OrientationType } from '@/types';

/**
 * Metadata Processing & Sanitization Utilities for Elysium Wallpaper Platform
 */

/**
 * Validates that dimension values are finite positive integers.
 */
function validateDimension(val: number, name: string): void {
  if (typeof val !== 'number' || !Number.isFinite(val) || val <= 0) {
    throw new Error(`${name} must be a positive finite number`);
  }
}

/**
 * Calculates aspect ratio rounded to 2 decimal places.
 */
export function calculateAspectRatio(width: number, height: number): number {
  validateDimension(width, 'Width');
  validateDimension(height, 'Height');
  return Math.round((width / height) * 100) / 100;
}

/**
 * Determines image orientation enum: landscape, portrait, or square.
 */
export function determineOrientation(width: number, height: number): OrientationType {
  validateDimension(width, 'Width');
  validateDimension(height, 'Height');
  if (width > height) return 'landscape';
  if (height > width) return 'portrait';
  return 'square';
}

/**
 * Calculates presentation resolution label based on dimensions,
 * supporting standard and ultrawide aspect ratios.
 */
export function calculateResolutionLabel(width: number, height: number): string {
  validateDimension(width, 'Width');
  validateDimension(height, 'Height');

  const maxDim = Math.max(width, height);
  const minDim = Math.min(width, height);
  
  if (maxDim >= 7680) return '8K';
  if (maxDim >= 5760) return '6K';
  if (maxDim >= 5120) return '5K';
  if (maxDim >= 3840) return '4K';

  // Ultrawide check e.g. 3440x1440 or 2560x1080
  if (maxDim >= 3440 && minDim >= 1440) return 'QHD+ Ultrawide';
  
  if (maxDim >= 2560) return 'QHD';
  if (maxDim >= 1920) return 'FHD';
  if (maxDim >= 1280) return 'HD';
  return 'Custom';
}

/**
 * Normalizes title into a web-friendly URL slug (max 100 chars).
 */
export function generateSlug(title: string): string {
  if (!title || typeof title !== 'string' || !title.trim()) {
    throw new Error('Title cannot be empty');
  }

  const slug = title
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[^a-z0-9\s-]/g, '')    // remove invalid chars & emojis
    .replace(/\s+/g, '-')            // collapse whitespace to hyphens
    .replace(/-+/g, '-')             // collapse duplicate hyphens
    .replace(/^-+|-+$/g, '')         // trim hyphens
    .substring(0, 100)               // max length 100 chars
    .replace(/-+$/, '');             // ensure no trailing hyphen after slice

  if (!slug) {
    return `wallpaper-${Date.now()}`;
  }

  return slug;
}

/**
 * Sanitizes title into a safe HTTP download attachment filename.
 * Prevents header injection and invalid filesystem characters.
 */
export function sanitizeFilename(title: string, format: string): string {
  const cleanTitle = (title || 'wallpaper')
    .trim()
    .replace(/[\r\n\t]/g, '')        // remove CRLF
    .replace(/[/\\?%*:|"<>]/g, '-')  // replace filesystem illegal chars
    .replace(/\s+/g, '-')            // collapse whitespace
    .replace(/-+/g, '-')             // collapse hyphens
    .replace(/^-+|-+$/g, '')         // trim leading/trailing hyphens
    .substring(0, 80);

  const cleanExt = (format || 'jpg')
    .replace(/^\./, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  return `${cleanTitle || 'wallpaper'}.${cleanExt || 'jpg'}`;
}

/**
 * Calculates SHA-256 hex string from binary buffer.
 */
export async function calculateSHA256(buffer: ArrayBuffer | Uint8Array): Promise<string> {
  if (!buffer) {
    throw new Error('Buffer cannot be null or undefined');
  }
  const data = buffer instanceof Uint8Array
    ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
    : buffer;
  
  // Use Web Crypto API compatible with Cloudflare Workers & Node.js
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Resolves MIME type from file extension.
 */
export function getMimeType(filenameOrExt: string): string {
  if (!filenameOrExt) return 'application/octet-stream';
  
  // Clean query params or path separators when present.
  const clean = filenameOrExt.split('?')[0].split('#')[0];
  const ext = clean.toLowerCase().split('.').pop() || '';
  
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'avif':
      return 'image/avif';
    case 'tiff':
    case 'tif':
      return 'image/tiff';
    default:
      return 'application/octet-stream';
  }
}
