export interface ImageHeaderInfo {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';
  width: number;
  height: number;
}

const MAX_HEADER_BYTES = 1024 * 1024;
const MAX_DIMENSION = 100_000;

function bytesOf(input: ArrayBuffer | ArrayBufferView): Uint8Array {
  return input instanceof ArrayBuffer
    ? new Uint8Array(input)
    : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
}

function dimensions(mimeType: ImageHeaderInfo['mimeType'], width: number, height: number): ImageHeaderInfo {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0
    || width > MAX_DIMENSION || height > MAX_DIMENSION) {
    throw new Error('Image dimensions are invalid');
  }
  return { mimeType, width, height };
}

function inspectPng(data: Uint8Array): ImageHeaderInfo | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (data.length < 24 || !signature.every((value, index) => data[index] === value)) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (String.fromCharCode(...data.subarray(12, 16)) !== 'IHDR') throw new Error('PNG header is invalid');
  return dimensions('image/png', view.getUint32(16), view.getUint32(20));
}

function inspectJpeg(data: Uint8Array): ImageHeaderInfo | null {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return null;
  const limit = Math.min(data.length, MAX_HEADER_BYTES);
  let offset = 2;
  while (offset + 4 <= limit) {
    while (offset < limit && data[offset] === 0xff) offset += 1;
    const marker = data[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > limit) break;
    const length = data[offset] * 256 + data[offset + 1];
    if (length < 2 || offset + length > limit) break;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 7) throw new Error('JPEG frame is invalid');
      return dimensions(
        'image/jpeg',
        data[offset + 5] * 256 + data[offset + 6],
        data[offset + 3] * 256 + data[offset + 4]
      );
    }
    offset += length;
  }
  throw new Error('JPEG dimensions were not found in the bounded header');
}

function uint24le(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16);
}

function inspectWebp(data: Uint8Array): ImageHeaderInfo | null {
  if (data.length < 30 || String.fromCharCode(...data.subarray(0, 4)) !== 'RIFF'
    || String.fromCharCode(...data.subarray(8, 12)) !== 'WEBP') return null;
  const chunk = String.fromCharCode(...data.subarray(12, 16));
  if (chunk === 'VP8X') return dimensions('image/webp', uint24le(data, 24) + 1, uint24le(data, 27) + 1);
  if (chunk === 'VP8L') {
    if (data[20] !== 0x2f) throw new Error('WebP lossless header is invalid');
    const bits = data[21] | (data[22] << 8) | (data[23] << 16) | (data[24] << 24);
    return dimensions('image/webp', (bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  if (chunk === 'VP8 ') {
    if (data[23] !== 0x9d || data[24] !== 0x01 || data[25] !== 0x2a) throw new Error('WebP frame is invalid');
    return dimensions('image/webp', (data[26] | data[27] << 8) & 0x3fff, (data[28] | data[29] << 8) & 0x3fff);
  }
  throw new Error('Unsupported WebP encoding');
}

function inspectAvif(data: Uint8Array): ImageHeaderInfo | null {
  if (data.length < 24 || String.fromCharCode(...data.subarray(4, 8)) !== 'ftyp') return null;
  const brands = String.fromCharCode(...data.subarray(8, Math.min(data.length, 64)));
  if (!brands.includes('avif') && !brands.includes('avis')) return null;
  const limit = Math.min(data.length, MAX_HEADER_BYTES);
  for (let offset = 0; offset + 20 <= limit; offset += 1) {
    if (String.fromCharCode(...data.subarray(offset + 4, offset + 8)) !== 'ispe') continue;
    const boxSize = new DataView(data.buffer, data.byteOffset + offset, 4).getUint32(0);
    if (boxSize < 20 || offset + boxSize > limit) continue;
    const view = new DataView(data.buffer, data.byteOffset + offset + 12, 8);
    return dimensions('image/avif', view.getUint32(0), view.getUint32(4));
  }
  throw new Error('AVIF dimensions were not found in the bounded header');
}

export function inspectImageHeader(input: ArrayBuffer | ArrayBufferView): ImageHeaderInfo {
  const data = bytesOf(input);
  if (data.byteLength === 0) throw new Error('Image is empty');
  return inspectPng(data) || inspectJpeg(data) || inspectWebp(data) || inspectAvif(data)
    || (() => { throw new Error('Unsupported or invalid image signature'); })();
}
