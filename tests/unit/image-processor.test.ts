import { describe, it, expect } from 'vitest';
import { validateUploadFile, processImageFile, MAX_UPLOAD_SIZE_BYTES } from '../../src/lib/image-processor';

describe('Image Processor & File Validation Unit Tests', () => {
  it('throws error when file is missing or null', async () => {
    await expect(processImageFile(null as any)).rejects.toThrow('No file provided');
  });

  describe('validateUploadFile', () => {
    it('returns valid for valid file smaller than 50MB and valid MIME type', () => {
      const mockFile = { name: 'test.jpg', type: 'image/jpeg', size: 1024 * 1024 } as File;
      const res = validateUploadFile(mockFile);
      expect(res.valid).toBe(true);
    });

    it('rejects file larger than 50MB limit', () => {
      const mockFile = { name: 'huge.png', type: 'image/png', size: MAX_UPLOAD_SIZE_BYTES + 100 } as File;
      const res = validateUploadFile(mockFile);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('exceeds maximum limit');
    });

    it('rejects unsupported MIME types (e.g. PDF, SVG, EXE)', () => {
      const mockFile = { name: 'script.exe', type: 'application/x-msdownload', size: 1000 } as File;
      const res = validateUploadFile(mockFile);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Unsupported file format');
    });

    it('rejects zero-byte files', () => {
      const mockFile = { name: 'empty.jpg', type: 'image/jpeg', size: 0 } as File;
      const res = validateUploadFile(mockFile);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('File is empty');
    });
  });
});
