export interface RateLimitRule {
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
}

interface RateLimitRow {
  request_count: number;
  window_started_at: number;
}

async function identityHash(scope: string, identity: string, secret: string): Promise<string> {
  if (new TextEncoder().encode(secret).byteLength < 32) throw new Error('Rate-limit secret is not configured');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`elysium:rate-limit:${scope}:${identity}`)
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function clientIdentity(request: Request): string {
  return request.headers.get('cf-connecting-ip') || 'local-client';
}

export class RateLimitService {
  static async consume(
    db: D1Database,
    scope: string,
    identity: string,
    secret: string,
    rule: RateLimitRule
  ): Promise<RateLimitResult> {
    const now = Math.floor(Date.now() / 1000);
    const resetBefore = now - rule.windowSeconds;
    const keyHash = await identityHash(scope, identity, secret);
    
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const row = await db.prepare(`
          INSERT INTO api_rate_limits (scope, key_hash, window_started_at, request_count)
          VALUES (?, ?, ?, 1)
          ON CONFLICT(scope, key_hash) DO UPDATE SET
            window_started_at = CASE WHEN window_started_at <= ? THEN excluded.window_started_at ELSE window_started_at END,
            request_count = CASE WHEN window_started_at <= ? THEN 1 ELSE request_count + 1 END
          RETURNING request_count, window_started_at
        `).bind(scope, keyHash, now, resetBefore, resetBefore).first<RateLimitRow>();

        if (!row) throw new Error('Rate limiter did not return a counter');
        const retryAfter = Math.max(1, row.window_started_at + rule.windowSeconds - now);
        return {
          allowed: row.request_count <= rule.limit,
          remaining: Math.max(0, rule.limit - row.request_count),
          retryAfter,
        };
      } catch (err) {
        lastError = err;
        await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
      }
    }

    console.warn(`Rate limiter fallback allowed for scope ${scope}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
    return { allowed: true, remaining: 1, retryAfter: 1 };
  }
}
