import type { PixabayCacheStore, PixabayCacheValue } from '@/services/pixabay/pixabay.service';

const FRESH_SECONDS = 24 * 60 * 60;
const STALE_SECONDS = 7 * 24 * 60 * 60;

interface CacheRow {
  payload_json: string;
  expires_at: string;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export class PixabayApiCache implements PixabayCacheStore {
  constructor(private readonly db: D1Database, private readonly now: () => number = Date.now) {}

  async get(key: string): Promise<PixabayCacheValue | null> {
    const cacheKey = await sha256(key);
    const row = await this.db.prepare(
      'SELECT payload_json, expires_at FROM pixabay_api_cache WHERE cache_key = ?'
    ).bind(cacheKey).first<CacheRow>();
    if (!row) return null;
    const expiresAt = Date.parse(row.expires_at);
    if (!Number.isFinite(expiresAt) || this.now() > expiresAt + STALE_SECONDS * 1000) {
      await this.db.prepare('DELETE FROM pixabay_api_cache WHERE cache_key = ?').bind(cacheKey).run();
      return null;
    }
    try {
      return { payload: JSON.parse(row.payload_json) as unknown, fresh: this.now() <= expiresAt };
    } catch {
      await this.db.prepare('DELETE FROM pixabay_api_cache WHERE cache_key = ?').bind(cacheKey).run();
      return null;
    }
  }

  async set(key: string, payload: unknown): Promise<void> {
    const cachedAt = new Date(this.now());
    const expiresAt = new Date(this.now() + FRESH_SECONDS * 1000);
    await this.db.prepare(`
      INSERT INTO pixabay_api_cache (cache_key, payload_json, cached_at, expires_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET
        payload_json = excluded.payload_json,
        cached_at = excluded.cached_at,
        expires_at = excluded.expires_at
    `).bind(await sha256(key), JSON.stringify(payload), cachedAt.toISOString(), expiresAt.toISOString()).run();
  }

  async setMany(entries: Array<{ key: string; payload: unknown }>): Promise<void> {
    if (entries.length === 0) return;
    const cachedAt = new Date(this.now()).toISOString();
    const expiresAt = new Date(this.now() + FRESH_SECONDS * 1000).toISOString();
    const statements = await Promise.all(entries.map(async ({ key, payload }) => this.db.prepare(`
      INSERT INTO pixabay_api_cache (cache_key, payload_json, cached_at, expires_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET
        payload_json = excluded.payload_json,
        cached_at = excluded.cached_at,
        expires_at = excluded.expires_at
    `).bind(await sha256(key), JSON.stringify(payload), cachedAt, expiresAt)));
    await this.db.batch(statements);
  }
}
