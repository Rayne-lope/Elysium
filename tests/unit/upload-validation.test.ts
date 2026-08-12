import { describe, expect, it } from 'vitest';
import { parseWallpaperUpload } from '../../src/lib/upload-validation';

function uploadForm(): FormData {
  const form = new FormData();
  form.set('originalFile', new File([new Uint8Array([1, 2, 3])], 'sample.jpg', { type: 'image/jpeg' }));
  form.set('title', 'Openly licensed sample');
  form.set('width', '1920');
  form.set('height', '1080');
  return form;
}

describe('wallpaper upload provenance', () => {
  it('accepts complete HTTPS source metadata', async () => {
    const form = uploadForm();
    form.set('sourceProvider', 'WIKIMEDIA_COMMONS');
    form.set('sourceExternalId', '12345');
    form.set('sourceUrl', 'https://commons.wikimedia.org/wiki/File:Sample.jpg');
    form.set('creatorUrl', 'https://commons.wikimedia.org/wiki/User:Creator');

    const parsed = await parseWallpaperUpload(form);

    expect(parsed.sourceProvider).toBe('wikimedia_commons');
    expect(parsed.sourceExternalId).toBe('12345');
    expect(parsed.sourceUrl).toBe('https://commons.wikimedia.org/wiki/File:Sample.jpg');
    expect(parsed.creatorUrl).toBe('https://commons.wikimedia.org/wiki/User:Creator');
  });

  it('rejects non-HTTPS source metadata', async () => {
    const form = uploadForm();
    form.set('sourceUrl', 'http://example.com/source.jpg');

    await expect(parseWallpaperUpload(form)).rejects.toThrow('sourceUrl must be a valid HTTPS URL');
  });
});
