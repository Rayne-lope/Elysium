/**
 * Authentication Service for Elysium Wallpaper Platform
 * 
 * Features:
 * - Web Crypto HMAC-SHA256 session token generation & verification.
 * - Timing-safe credential comparison to prevent timing side-channel attacks.
 * - HttpOnly, SameSite=Strict cookie isolation.
 */

export const ADMIN_COOKIE_NAME = 'elysium_admin_session';

export interface TokenPayload {
  version: 1;
  admin: boolean;
  exp: number; // Unix timestamp in milliseconds
  iat: number;
}

export class AuthService {
  static readonly MAX_SESSION_HOURS = 8;

  static validateAuthSecret(secret: string | undefined): string {
    if (!secret || new TextEncoder().encode(secret).byteLength < 32) {
      throw new Error('AUTH_SECRET must contain at least 32 bytes');
    }
    return secret;
  }

  /**
   * Helper to convert Base64Url string to Uint8Array and vice versa.
   */
  private static base64UrlEncode(bytes: Uint8Array): string {
    const binary = Array.from(bytes).map(b => String.fromCharCode(b)).join('');
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  private static base64UrlDecode(str: string): Uint8Array {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Constant-time comparison of two strings to prevent timing attacks.
   */
  static async verifyAdminCredentials(inputSecret: string, envSecret: string): Promise<boolean> {
    if (!inputSecret || !envSecret) return false;
    
    // Hash both secrets to fixed length 32-byte SHA-256 digests
    const encoder = new TextEncoder();
    const hashA = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(inputSecret)));
    const hashB = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(envSecret)));

    // Constant-time byte-by-byte comparison
    let mismatch = hashA.length ^ hashB.length;
    for (let i = 0; i < hashA.length; i++) {
      mismatch |= hashA[i] ^ hashB[i];
    }

    return mismatch === 0;
  }

  /**
   * Generates Web Crypto HMAC key from secret string.
   */
  private static async getHMACKey(secret: string): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    return await crypto.subtle.importKey(
      'raw',
      encoder.encode(`elysium:admin-session:v1:${secret}`),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify']
    );
  }

  /**
   * Generates a tamper-proof HMAC-SHA256 signed session token.
   */
  static async generateSessionToken(secret: string, expiresInHours = this.MAX_SESSION_HOURS): Promise<string> {
    this.validateAuthSecret(secret);
    if (!Number.isFinite(expiresInHours) || expiresInHours <= 0 || expiresInHours > this.MAX_SESSION_HOURS) {
      throw new Error(`Session lifetime cannot exceed ${this.MAX_SESSION_HOURS} hours`);
    }
    
    const now = Date.now();
    const payload: TokenPayload = {
      version: 1,
      admin: true,
      iat: now,
      exp: now + expiresInHours * 60 * 60 * 1000,
    };

    const encoder = new TextEncoder();
    const payloadJson = JSON.stringify(payload);
    const payloadBase64 = this.base64UrlEncode(encoder.encode(payloadJson));

    const key = await this.getHMACKey(secret);
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadBase64));
    const signatureBase64 = this.base64UrlEncode(new Uint8Array(signatureBuffer));

    return `${payloadBase64}.${signatureBase64}`;
  }

  /**
   * Verifies the authenticity, integrity, and expiration of a session token.
   */
  static async verifySessionToken(
    token: string,
    secret: string
  ): Promise<{ valid: boolean; reason?: string; payload?: TokenPayload }> {
    if (!token || token.length > 1024 || !secret) {
      return { valid: false, reason: 'Missing token or secret' };
    }

    const parts = token.split('.');
    if (parts.length !== 2) {
      return { valid: false, reason: 'Invalid token structure' };
    }

    const [payloadBase64, signatureBase64] = parts;

    try {
      this.validateAuthSecret(secret);
      const key = await this.getHMACKey(secret);
      const encoder = new TextEncoder();
      const signatureBytes = this.base64UrlDecode(signatureBase64);
      if (signatureBytes.byteLength !== 32) {
        return { valid: false, reason: 'Invalid token signature' };
      }

      const isValidSignature = await crypto.subtle.verify(
        'HMAC',
        key,
        signatureBytes.buffer as ArrayBuffer,
        encoder.encode(payloadBase64)
      );

      if (!isValidSignature) {
        return { valid: false, reason: 'Invalid token signature (tampered)' };
      }

      const payloadBytes = this.base64UrlDecode(payloadBase64);
      const payloadJson = new TextDecoder().decode(payloadBytes);
      const payload: TokenPayload = JSON.parse(payloadJson);

      if (
        payload.version !== 1 ||
        payload.admin !== true ||
        !Number.isSafeInteger(payload.iat) ||
        !Number.isSafeInteger(payload.exp) ||
        payload.exp <= payload.iat ||
        payload.iat > Date.now() + 60_000 ||
        payload.exp - payload.iat > this.MAX_SESSION_HOURS * 60 * 60 * 1000
      ) {
        return { valid: false, reason: 'Invalid payload structure' };
      }

      if (Date.now() >= payload.exp) {
        return { valid: false, reason: 'Token has expired' };
      }

      return { valid: true, payload };
    } catch (err) {
      return { valid: false, reason: 'Failed to verify token' };
    }
  }

  /**
   * Parses the admin session cookie from a Raw Cookie header.
   */
  static parseAuthCookie(cookieHeader: string | null): string | null {
    if (!cookieHeader) return null;
    const cookies = cookieHeader.split(';');
    for (const cookie of cookies) {
      const [key, ...valParts] = cookie.trim().split('=');
      if (key === ADMIN_COOKIE_NAME) {
        return valParts.join('=');
      }
    }
    return null;
  }

  /**
   * Constructs HttpOnly `Set-Cookie` header value for admin session.
   */
  static createAuthCookieHeader(token: string, maxAgeSeconds = 28_800, isSecure = false): string {
    const secureFlag = isSecure ? '; Secure' : '';
    return `${ADMIN_COOKIE_NAME}=${token}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Strict${secureFlag}`;
  }

  /**
   * Constructs `Set-Cookie` header value to clear the admin session on logout.
   */
  static clearAuthCookieHeader(isSecure = false): string {
    const secureFlag = isSecure ? '; Secure' : '';
    return `${ADMIN_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${secureFlag}`;
  }
}
