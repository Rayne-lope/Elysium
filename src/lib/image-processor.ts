import {
  calculateAspectRatio,
  determineOrientation,
  calculateResolutionLabel,
  calculateSHA256,
  generateSlug,
  getMimeType
} from './metadata';

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
];

export const MAX_UPLOAD_SIZE_BYTES = 52_428_800; // 50MB

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

export interface ImageExtractionResult {
  width: number;
  height: number;
  aspectRatio: number;
  orientation: 'landscape' | 'portrait' | 'square';
  resolutionLabel: string;
  fileSize: number;
  mimeType: string;
  fileHash: string;
  suggestedSlug: string;
}

/**
 * Validates uploaded file against size limits and supported image MIME types.
 */
export function validateUploadFile(
  file: File | null | undefined,
  maxSizeBytes = MAX_UPLOAD_SIZE_BYTES
): FileValidationResult {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  if (typeof file.size !== 'number' || file.size <= 0) {
    return { valid: false, error: 'File is empty or invalid' };
  }

  if (file.size > maxSizeBytes) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    const maxMb = (maxSizeBytes / (1024 * 1024)).toFixed(0);
    return { valid: false, error: `File size (${sizeMb}MB) exceeds maximum limit of ${maxMb}MB` };
  }

  const mimeType = (file.type || getMimeType(file.name)).toLowerCase();
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return {
      valid: false,
      error: `Unsupported file format (${mimeType}). Allowed formats: JPG, PNG, WebP, AVIF`,
    };
  }

  return { valid: true };
}

/**
 * Reads binary image file data and extracts all technical metadata.
 */
export async function processImageFile(file: File): Promise<ImageExtractionResult> {
  const validation = validateUploadFile(file);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid file');
  }

  const buffer = await file.arrayBuffer();
  const fileHash = await calculateSHA256(buffer);
  
  // Extract dimensions using browser Image API
  const { width, height } = await getImageDimensions(file);
  const aspectRatio = calculateAspectRatio(width, height);
  const orientation = determineOrientation(width, height);
  const resolutionLabel = calculateResolutionLabel(width, height);
  
  const rawTitle = file.name.replace(/\.[^/.]+$/, '');
  const suggestedSlug = generateSlug(rawTitle || 'wallpaper');
  const mimeType = file.type || getMimeType(file.name);

  return {
    width,
    height,
    aspectRatio,
    orientation,
    resolutionLabel,
    fileSize: file.size,
    mimeType,
    fileHash,
    suggestedSlug,
  };
}

/**
 * Reads HTML Image element dimensions from browser File object.
 */
export function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      URL.revokeObjectURL(url);

      if (width > 0 && height > 0) {
        resolve({ width, height });
      } else {
        reject(new Error('Invalid image dimensions'));
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image file for dimension extraction'));
    };

    img.src = url;
  });
}

/**
 * Resizes image using HTML Canvas for generating preview variants.
 */
export async function generateCanvasPreviewBlob(
  file: File,
  targetMaxDimension: number,
  mimeType: 'image/webp' | 'image/jpeg' = 'image/webp',
  quality = 0.85
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      const origW = img.naturalWidth || img.width;
      const origH = img.naturalHeight || img.height;

      let scale = 1;
      const maxDim = Math.max(origW, origH);
      if (maxDim > targetMaxDimension) {
        scale = targetMaxDimension / maxDim;
      }

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(origW * scale);
      canvas.height = Math.round(origH * scale);

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        return reject(new Error('Canvas context not available'));
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to generate canvas preview blob'));
          }
        },
        mimeType,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for canvas scaling'));
    };

    img.src = url;
  });
}
