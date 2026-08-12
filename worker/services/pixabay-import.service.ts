import { mapPixabayCategory, normalizePixabayTags } from '@/services/pixabay/pixabay.mapper';
import { PIXABAY_MAX_SOURCE_BYTES } from '@/services/pixabay/pixabay.constants';
import { PixabayService } from '@/services/pixabay/pixabay.service';
import type { PixabayImportItemResult, PixabayImportRequest } from '@/services/pixabay/pixabay.types';
import { DBService } from './db.service';
import { WallpaperIngestionService, type IngestionBindings } from './ingestion.service';
import { inspectImageHeader } from '@/lib/image-inspector';

const ALLOWED_SOURCE_HOSTS = new Set(['pixabay.com', 'www.pixabay.com', 'cdn.pixabay.com']);
const ALLOWED_SOURCE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const MAX_REDIRECTS = 5;
const MAX_RATE_LIMIT_WAIT_MS = 65_000;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function validateSourceUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port
    || !ALLOWED_SOURCE_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error('Pixabay returned an untrusted source URL');
  }
  return url;
}

async function readBoundedBody(response: Response): Promise<ArrayBuffer> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Source asset has no response body');
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > PIXABAY_MAX_SOURCE_BYTES) {
        await reader.cancel('source asset exceeds limit');
        throw new Error('Source asset exceeds the 20 MB transform limit');
      }
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  if (total === 0) throw new Error('Source asset is empty');
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

function retryMilliseconds(response: Response | undefined, attempt: number): number {
  if (response?.status === 429) {
    const resetSeconds = Number(response.headers.get('x-ratelimit-reset'));
    if (Number.isFinite(resetSeconds) && resetSeconds >= 0) {
      return Math.min(MAX_RATE_LIMIT_WAIT_MS, Math.max(1_000, resetSeconds * 1000 + 1_000));
    }
  }
  const value = response?.headers.get('retry-after');
  const seconds = value ? Number(value) : NaN;
  if (Number.isFinite(seconds)) {
    return Math.min(MAX_RATE_LIMIT_WAIT_MS, Math.max(1_000, seconds * 1000 + 1_000));
  }
  if (value) {
    const dateDelay = Date.parse(value) - Date.now();
    if (Number.isFinite(dateDelay)) {
      return Math.min(MAX_RATE_LIMIT_WAIT_MS, Math.max(1_000, dateDelay + 1_000));
    }
  }
  if (response?.status === 429) return Math.min(20_000, 5_000 * 2 ** attempt);
  return Math.min(2_000, 300 * 2 ** attempt) + Math.floor(Math.random() * 100);
}

export class PixabayImportService {
  private readonly fetcher: typeof fetch;

  constructor(
    private readonly pixabay: PixabayService,
    private readonly bindings: IngestionBindings,
    fetcher: typeof fetch = fetch,
    private readonly sleeper: (milliseconds: number) => Promise<void> = delay
  ) {
    this.fetcher = (input, init) => fetcher(input, init);
  }

  async importOne(
    pixabayId: number,
    settings: PixabayImportRequest['settings'] = {}
  ): Promise<PixabayImportItemResult> {
    const externalId = String(pixabayId);
    const existing = await DBService.checkExternalSource(this.bindings.db, 'pixabay', externalId);
    if (existing) {
      return {
        pixabayId,
        status: 'duplicate',
        wallpaperId: existing.id,
        title: existing.title,
        reason: 'Already imported',
      };
    }

    try {
      const image = await this.pixabay.getImageById(pixabayId);
      if (!image.sourceAssetUrl) {
        throw new Error('Original asset unavailable. Pixabay full API access is required for importing.');
      }
      const source = await this.downloadSource(image.sourceAssetUrl);
      const tags = normalizePixabayTags([...(image.tags || []), ...(settings?.additionalTags || [])]);
      const result = await WallpaperIngestionService.ingest(this.bindings, {
        bytes: source.bytes,
        mimeType: source.mimeType,
        title: image.title,
        description: `Draft imported from Pixabay. Review content rights and editorial metadata before publishing.`,
        creator: image.creator,
        tags,
        categoryId: settings?.defaultCategoryId,
        categorySlug: mapPixabayCategory(settings?.sourceCategory),
        sourceProvider: 'pixabay',
        sourceExternalId: externalId,
        sourceUrl: image.sourceUrl,
        creatorUrl: image.creatorUrl,
        sourceProvenance: `Pixabay image #${pixabayId}`,
        licenseNote: 'Pixabay Content License. Verify standalone distribution rights before publishing.',
      });

      if (result.status === 'duplicate') {
        return {
          pixabayId,
          status: 'duplicate',
          wallpaperId: result.wallpaperId,
          title: image.title,
          reason: result.reason,
        };
      }
      return {
        pixabayId,
        status: 'imported',
        wallpaperId: result.wallpaper.id,
        title: result.wallpaper.title,
      };
    } catch (error) {
      return {
        pixabayId,
        status: 'failed',
        reason: error instanceof Error ? error.message : 'Import failed',
      };
    }
  }

  private async downloadSource(urlValue: string): Promise<{ bytes: ArrayBuffer; mimeType: string }> {
    const initialUrl = validateSourceUrl(urlValue);

    let lastError = 'Source asset unavailable';
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let response: Response | undefined;
      try {
        let currentUrl = initialUrl;
        for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
          response = await this.fetcher(currentUrl, {
            redirect: 'manual',
            signal: AbortSignal.timeout(30_000),
            headers: { Accept: 'image/avif,image/webp,image/jpeg,image/png' },
          });
          if (![301, 302, 303, 307, 308].includes(response.status)) break;
          if (hop === MAX_REDIRECTS) throw new Error('Pixabay source redirected too many times');
          const location = response.headers.get('location');
          if (!location) throw new Error('Pixabay source redirect is missing a location');
          currentUrl = validateSourceUrl(new URL(location, currentUrl).href);
        }
        if (!response) throw new Error('Source asset unavailable');
        if (!response.ok) {
          lastError = `Source asset returned ${response.status}`;
          if (response.status < 500 && response.status !== 429) break;
        } else {
          const declaredSize = Number(response.headers.get('content-length') || 0);
          if (!Number.isFinite(declaredSize) || declaredSize < 0 || declaredSize > PIXABAY_MAX_SOURCE_BYTES) {
            await response.body?.cancel();
            throw new Error('Source asset exceeds the 20 MB transform limit');
          }
          const mimeType = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
          if (!ALLOWED_SOURCE_TYPES.has(mimeType)) {
            await response.body?.cancel();
            throw new Error('Source response is not a supported image');
          }
          const bytes = await readBoundedBody(response);
          if (inspectImageHeader(bytes).mimeType !== mimeType) {
            throw new Error('Source Content-Type does not match image signature');
          }
          return { bytes, mimeType };
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : lastError;
        if (/untrusted|redirect|exceeds|supported image|signature|empty|no response body/i.test(lastError)) break;
      }
      if (attempt < 2) await this.sleeper(retryMilliseconds(response, attempt));
    }
    throw new Error(lastError);
  }
}
