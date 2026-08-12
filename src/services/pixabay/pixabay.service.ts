import {
  PIXABAY_API_URL,
  PIXABAY_CATEGORIES,
  PIXABAY_MAX_PER_PAGE,
  PIXABAY_MAX_QUERY_LENGTH,
} from './pixabay.constants';
import { mapPixabayImage, toPixabaySearchImage } from './pixabay.mapper';
import type {
  PixabayApiImage,
  PixabayApiSearchResponse,
  PixabayImportImage,
  PixabayOrder,
  PixabayOrientation,
  PixabaySearchParams,
  PixabaySearchResponse,
} from './pixabay.types';

export interface PixabayCacheValue {
  payload: unknown;
  fresh: boolean;
}

export interface PixabayCacheStore {
  get(key: string): Promise<PixabayCacheValue | null>;
  set(key: string, payload: unknown): Promise<void>;
  setMany?(entries: Array<{ key: string; payload: unknown }>): Promise<void>;
}

export class PixabayServiceError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
    this.name = 'PixabayServiceError';
  }
}

function boundedInteger(value: string | null, fallback: number, min: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new PixabayServiceError(`Value must be an integer between ${min} and ${max}`, 400);
  }
  return parsed;
}

export function parsePixabaySearchParams(params: URLSearchParams): PixabaySearchParams {
  const allowed = new Set(['q', 'page', 'per_page', 'orientation', 'category', 'min_width', 'min_height', 'order']);
  const unexpected = [...params.keys()].find((key) => !allowed.has(key));
  if (unexpected) throw new PixabayServiceError(`Unexpected query parameter: ${unexpected}`, 400);
  const q = (params.get('q') || '').trim();
  if (q.length > PIXABAY_MAX_QUERY_LENGTH) {
    throw new PixabayServiceError(`Search query cannot exceed ${PIXABAY_MAX_QUERY_LENGTH} characters`, 400);
  }

  const orientation = (params.get('orientation') || 'all') as PixabayOrientation;
  if (!['all', 'horizontal', 'vertical'].includes(orientation)) {
    throw new PixabayServiceError('Invalid orientation', 400);
  }

  const order = (params.get('order') || 'popular') as PixabayOrder;
  if (!['popular', 'latest'].includes(order)) {
    throw new PixabayServiceError('Invalid sort order', 400);
  }

  const category = params.get('category') || undefined;
  if (category && !PIXABAY_CATEGORIES.includes(category as (typeof PIXABAY_CATEGORIES)[number])) {
    throw new PixabayServiceError('Invalid Pixabay category', 400);
  }

  return {
    q,
    page: boundedInteger(params.get('page'), 1, 1, 500),
    perPage: boundedInteger(params.get('per_page'), 24, 3, PIXABAY_MAX_PER_PAGE),
    orientation,
    category,
    minWidth: boundedInteger(params.get('min_width'), 0, 0, 20_000),
    minHeight: boundedInteger(params.get('min_height'), 0, 0, 20_000),
    order,
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isFiniteNumber(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

function isPixabayUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && (url.hostname === 'pixabay.com' || url.hostname.endsWith('.pixabay.com'));
  } catch {
    return false;
  }
}

function parseImage(value: unknown): PixabayApiImage {
  if (!value || typeof value !== 'object') throw new PixabayServiceError('Pixabay returned an invalid image');
  const hit = value as Record<string, unknown>;
  const integerFields = [
    'id', 'previewWidth', 'previewHeight', 'webformatWidth', 'webformatHeight',
    'imageWidth', 'imageHeight', 'imageSize', 'views', 'downloads', 'likes', 'user_id',
  ];
  if (integerFields.some((name) => !Number.isSafeInteger(hit[name]) || Number(hit[name]) < 0)) {
    throw new PixabayServiceError('Pixabay returned invalid image metadata');
  }
  for (const name of ['pageURL', 'previewURL', 'webformatURL', 'largeImageURL']) {
    if (!isPixabayUrl(hit[name])) throw new PixabayServiceError('Pixabay returned an invalid URL');
  }
  for (const name of ['fullHDURL', 'imageURL']) {
    if (hit[name] !== undefined && hit[name] !== '' && !isPixabayUrl(hit[name])) {
      throw new PixabayServiceError('Pixabay returned an invalid source URL');
    }
  }
  if (typeof hit.tags !== 'string' || hit.tags.length > 2000 || typeof hit.user !== 'string' || hit.user.length > 200) {
    throw new PixabayServiceError('Pixabay returned invalid text metadata');
  }
  return hit as unknown as PixabayApiImage;
}

function parsePayload(value: unknown): PixabayApiSearchResponse {
  if (!value || typeof value !== 'object') throw new PixabayServiceError('Pixabay returned an invalid response');
  const payload = value as Record<string, unknown>;
  if (!isFiniteNumber(payload.total) || !isFiniteNumber(payload.totalHits) || !Array.isArray(payload.hits)) {
    throw new PixabayServiceError('Pixabay returned an invalid response');
  }
  if (payload.hits.length > PIXABAY_MAX_PER_PAGE) throw new PixabayServiceError('Pixabay returned too many results');
  return { total: payload.total, totalHits: payload.totalHits, hits: payload.hits.map(parseImage) };
}

function canonicalKey(url: URL): string {
  const entries = [...url.searchParams.entries()]
    .filter(([name]) => name !== 'key')
    .sort(([a, av], [b, bv]) => a.localeCompare(b) || av.localeCompare(bv));
  return `${url.pathname}?${new URLSearchParams(entries).toString()}`;
}

const MAX_RATE_LIMIT_WAIT_MS = 65_000;

function resetWindowDelay(response: Response | undefined): number | null {
  const rawReset = response?.headers.get('x-ratelimit-reset');
  if (!rawReset) return null;
  const seconds = Number(rawReset);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  // Pixabay reports whole seconds. Add a small boundary buffer so the next
  // request cannot land in the window that is just closing.
  return Math.min(MAX_RATE_LIMIT_WAIT_MS, Math.max(1_000, seconds * 1000 + 1_000));
}

function retryDelay(response: Response | undefined, attempt: number): number {
  if (response?.status === 429) {
    const resetDelay = resetWindowDelay(response);
    if (resetDelay !== null) return resetDelay;
  }

  const retryAfter = response?.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) {
      return Math.min(MAX_RATE_LIMIT_WAIT_MS, Math.max(1_000, seconds * 1000 + 1_000));
    }
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) {
      return Math.min(MAX_RATE_LIMIT_WAIT_MS, Math.max(1_000, dateDelay + 1_000));
    }
  }

  if (response?.status === 429) return Math.min(20_000, 5_000 * 2 ** attempt);
  return Math.min(2_000, 250 * 2 ** attempt) + Math.floor(Math.random() * 100);
}

export class PixabayService {
  private readonly fetcher: typeof fetch;
  private pendingWindowDelay = 0;

  constructor(
    private readonly apiKey: string,
    fetcher: typeof fetch = fetch,
    private readonly cache?: PixabayCacheStore,
    private readonly sleeper: (milliseconds: number) => Promise<void> = delay
  ) {
    if (!apiKey.trim()) throw new PixabayServiceError('PIXABAY_API_KEY is not configured', 503);
    this.fetcher = (input, init) => fetcher(input, init);
  }

  async search(params: PixabaySearchParams): Promise<PixabaySearchResponse> {
    const url = this.buildUrl(params);
    const result = await this.fetchPayload(url);
    const payload = result.payload;
    if (result.cache === 'miss' && this.cache?.setMany && payload.hits.length > 0) {
      const entries = payload.hits.map((hit) => ({
        key: canonicalKey(this.buildImageUrl(hit.id)),
        payload: { total: 1, totalHits: 1, hits: [hit] },
      }));
      await this.cache.setMany(entries).catch(() => undefined);
    }

    return {
      total: Number(payload.total) || 0,
      totalHits: Number(payload.totalHits) || 0,
      page: params.page,
      perPage: params.perPage,
      images: payload.hits.map(mapPixabayImage).map(toPixabaySearchImage),
      meta: { cache: result.cache },
    };
  }

  async getImageById(pixabayId: number): Promise<PixabayImportImage> {
    const url = this.buildImageUrl(pixabayId);
    const { payload } = await this.fetchPayload(url);
    const hit = payload.hits?.find((candidate) => candidate.id === pixabayId);
    if (!hit) throw new PixabayServiceError(`Pixabay image #${pixabayId} is unavailable`, 404);
    return mapPixabayImage(hit);
  }

  private buildImageUrl(pixabayId: number): URL {
    const params: PixabaySearchParams = {
      q: '',
      page: 1,
      perPage: 3,
      orientation: 'all',
      minWidth: 0,
      minHeight: 0,
      order: 'popular',
    };
    const url = this.buildUrl(params);
    url.searchParams.set('id', String(pixabayId));
    return url;
  }

  private buildUrl(params: PixabaySearchParams): URL {
    const url = new URL(PIXABAY_API_URL);
    url.searchParams.set('key', this.apiKey);
    url.searchParams.set('image_type', 'photo');
    url.searchParams.set('safesearch', 'true');
    url.searchParams.set('page', String(params.page));
    url.searchParams.set('per_page', String(params.perPage));
    url.searchParams.set('orientation', params.orientation);
    url.searchParams.set('min_width', String(params.minWidth));
    url.searchParams.set('min_height', String(params.minHeight));
    url.searchParams.set('order', params.order);
    if (params.q) url.searchParams.set('q', params.q);
    if (params.category) url.searchParams.set('category', params.category);
    return url;
  }

  private async fetchPayload(url: URL): Promise<{ payload: PixabayApiSearchResponse; cache: 'hit' | 'miss' | 'stale' }> {
    const key = canonicalKey(url);
    let cached: PixabayCacheValue | null = null;
    try { cached = await this.cache?.get(key) || null; } catch { cached = null; }
    if (cached?.fresh) {
      try { return { payload: parsePayload(cached.payload), cache: 'hit' }; }
      catch { cached = null; }
    }

    let lastError = 'Pixabay request failed';
    let lastStatus = 502;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let response: Response | undefined;
      try {
        if (this.pendingWindowDelay > 0) {
          const wait = this.pendingWindowDelay;
          this.pendingWindowDelay = 0;
          await this.sleeper(wait);
        }
        response = await this.fetcher(url, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(10_000),
        });
        if (response.ok) {
          const payload = parsePayload(await response.json());
          if (Number(response.headers.get('x-ratelimit-remaining')) === 0) {
            this.pendingWindowDelay = resetWindowDelay(response) || 0;
          }
          if (this.cache) await this.cache.set(key, payload).catch(() => undefined);
          return { payload, cache: 'miss' };
        }
        lastStatus = response.status;
        lastError = (await response.text()).slice(0, 200) || `Pixabay returned ${response.status}`;
        if (response.status < 500 && response.status !== 429) {
          throw new PixabayServiceError(lastError, response.status);
        }
      } catch (error) {
        if (error instanceof PixabayServiceError) throw error;
        lastError = error instanceof Error ? error.message : lastError;
      }
      if (attempt < 2) await this.sleeper(retryDelay(response, attempt));
    }
    if (cached) return { payload: parsePayload(cached.payload), cache: 'stale' };
    throw new PixabayServiceError(lastError, lastStatus === 429 ? 429 : 502);
  }
}
