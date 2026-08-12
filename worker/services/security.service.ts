export interface DownloadTokenPayload {
  version: 1;
  wallpaperId: string;
  expiresAt: number;
}

export interface ByteRange { offset: number; length: number; end: number }

function validSecret(secret: string): boolean {
  return new TextEncoder().encode(secret).byteLength >= 32;
}

export class SecurityService {
  /**
   * Generates a short-lived Web Crypto HMAC-SHA256 download token valid for 5 minutes.
   */
  static async generateDownloadToken(
    wallpaperId: string,
    secretKey: string,
    ttlSeconds = 300
  ): Promise<string> {
    if (!validSecret(secretKey)) throw new Error('AUTH_SECRET must be at least 32 bytes');
    if (!Number.isFinite(ttlSeconds) || ttlSeconds > 300) throw new Error('Download token TTL cannot exceed five minutes');
    const expiresAt = Date.now() + ttlSeconds * 1000;
    const payloadStr = `elysium:download:v1:${wallpaperId}:${expiresAt}`;

    const encoder = new TextEncoder();
    const keyData = encoder.encode(secretKey);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData.buffer as ArrayBuffer,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign(
      'HMAC',
      cryptoKey,
      encoder.encode(payloadStr).buffer as ArrayBuffer
    );

    const signatureHex = Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const tokenPayload = btoa(JSON.stringify({ version: 1, wallpaperId, expiresAt } satisfies DownloadTokenPayload))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    return `${tokenPayload}.${signatureHex}`;
  }

  /**
   * Verifies HMAC signature and expiration timestamp of a download token.
   */
  static async verifyDownloadToken(
    wallpaperId: string,
    token: string,
    secretKey: string
  ): Promise<boolean> {
    if (!token || !token.includes('.')) return false;

    try {
      const [payloadB64, signatureHex] = token.split('.');
      if (!validSecret(secretKey) || token.length > 1024 || !/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(token)) return false;
      const padded = payloadB64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payloadB64.length / 4) * 4, '=');
      const payload = JSON.parse(atob(padded)) as Partial<DownloadTokenPayload>;

      if (payload.version !== 1 || payload.wallpaperId !== wallpaperId
        || !Number.isSafeInteger(payload.expiresAt) || Number(payload.expiresAt) <= Date.now()
        || Number(payload.expiresAt) > Date.now() + 5 * 60 * 1000) return false;

      const payloadStr = `elysium:download:v1:${payload.wallpaperId}:${payload.expiresAt}`;
      const encoder = new TextEncoder();
      const keyData = encoder.encode(secretKey);

      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData.buffer as ArrayBuffer,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      );

      const signatureBytes = new Uint8Array(
        signatureHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
      );

      return await crypto.subtle.verify(
        'HMAC',
        cryptoKey,
        signatureBytes.buffer as ArrayBuffer,
        encoder.encode(payloadStr).buffer as ArrayBuffer
      );
    } catch {
      return false;
    }
  }

  /**
   * Classifies user agent into Mobile, Desktop, Tablet, or Bot.
   */
  static classifyUserAgent(ua?: string | null): 'mobile' | 'desktop' | 'tablet' | 'bot' {
    if (!ua) return 'desktop';
    const lower = ua.toLowerCase();

    if (/bot|googlebot|bingbot|crawler|spider|slurp|facebookexternalhit/i.test(lower)) {
      return 'bot';
    }
    if (/ipad|tablet|kindle|playbook|silk/i.test(lower)) {
      return 'tablet';
    }
    if (/mobile|iphone|android|touch|mini|windows phone/i.test(lower)) {
      return 'mobile';
    }
    return 'desktop';
  }

  /**
   * Validates request referer against direct external hotlinking.
   */
  static validateReferer(request: Request, allowedHostnames: string[] = []): boolean {
    const referer = request.headers.get('referer') || request.headers.get('origin');
    if (!referer) return true; // Allow direct downloads triggered by browser navigation

    try {
      const url = new URL(referer);
      const host = url.hostname.toLowerCase();

      if (allowedHostnames.length === 0) return true;
      return allowedHostnames.some(allowed => host === allowed.toLowerCase() || host.endsWith('.' + allowed.toLowerCase()));
    } catch {
      return false;
    }
  }

  static validateExactOriginOrReferer(request: Request): boolean {
    const expected = new URL(request.url).origin;
    for (const header of ['origin', 'referer']) {
      const value = request.headers.get(header);
      if (!value) continue;
      try {
        return new URL(value).origin === expected;
      } catch {
        return false;
      }
    }
    return false;
  }

  static parseSingleRange(value: string | null, size: number): ByteRange | null {
    if (!value) return null;
    if (!Number.isSafeInteger(size) || size <= 0 || value.includes(',')) throw new Error('Invalid range');
    const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
    if (!match || (!match[1] && !match[2])) throw new Error('Invalid range');
    let start: number;
    let end: number;
    if (!match[1]) {
      const suffix = Number(match[2]);
      if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new Error('Invalid range');
      start = Math.max(0, size - suffix);
      end = size - 1;
    } else {
      start = Number(match[1]);
      end = match[2] ? Number(match[2]) : size - 1;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) {
        throw new Error('Invalid range');
      }
      end = Math.min(end, size - 1);
    }
    return { offset: start, end, length: end - start + 1 };
  }
}
