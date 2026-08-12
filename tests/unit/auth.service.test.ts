import { afterEach, describe, it, expect, vi } from 'vitest';
import { AuthService, ADMIN_COOKIE_NAME } from '../../worker/services/auth.service';

describe('AuthService Security Unit Tests', () => {
  const TEST_SECRET = 'super-secret-admin-key-1234567890abcdef';
  afterEach(() => vi.useRealTimers());

  describe('verifyAdminCredentials (Timing-Safe)', () => {
    it('returns true when input matches environment secret', async () => {
      const isValid = await AuthService.verifyAdminCredentials(TEST_SECRET, TEST_SECRET);
      expect(isValid).toBe(true);
    });

    it('returns false when input is incorrect', async () => {
      const isValid = await AuthService.verifyAdminCredentials('wrong-password', TEST_SECRET);
      expect(isValid).toBe(false);
    });

    it('returns false for empty or null inputs', async () => {
      expect(await AuthService.verifyAdminCredentials('', TEST_SECRET)).toBe(false);
      expect(await AuthService.verifyAdminCredentials(TEST_SECRET, '')).toBe(false);
    });
  });

  describe('generateSessionToken & verifySessionToken', () => {
    it('generates a valid session token that verifies successfully', async () => {
      const token = await AuthService.generateSessionToken(TEST_SECRET, 8);
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(2);

      const result = await AuthService.verifySessionToken(token, TEST_SECRET);
      expect(result.valid).toBe(true);
      expect(result.payload?.admin).toBe(true);
    });

    it('rejects verification if token is verified with wrong secret', async () => {
      const token = await AuthService.generateSessionToken(TEST_SECRET, 8);
      const result = await AuthService.verifySessionToken(token, 'different-secret-that-is-at-least-32-bytes');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('signature');
    });

    it('rejects verification if token payload has been tampered with', async () => {
      const token = await AuthService.generateSessionToken(TEST_SECRET, 8);
      const parts = token.split('.');
      const tamperedToken = `eyJhbGciOiJIUzI1NiJ9.${parts[1]}`; // fake payload

      const result = await AuthService.verifySessionToken(tamperedToken, TEST_SECRET);
      expect(result.valid).toBe(false);
    });

    it('rejects verification if token has expired', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-10T00:00:00Z'));
      const expiredToken = await AuthService.generateSessionToken(TEST_SECRET, 1);
      vi.setSystemTime(new Date('2026-08-10T02:00:00Z'));
      const result = await AuthService.verifySessionToken(expiredToken, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('expired');
    });
  });

  describe('Cookie Helpers', () => {
    it('parses session token from raw Cookie header', () => {
      const header = 'other_cookie=xyz; elysium_admin_session=token12345; theme=dark';
      const token = AuthService.parseAuthCookie(header);
      expect(token).toBe('token12345');
    });

    it('returns null if session cookie is absent', () => {
      expect(AuthService.parseAuthCookie('other_cookie=xyz')).toBeNull();
      expect(AuthService.parseAuthCookie(null)).toBeNull();
    });

    it('creates correct HttpOnly Set-Cookie header string', () => {
      const cookieHeader = AuthService.createAuthCookieHeader('my-token', 86400, true);
      expect(cookieHeader).toContain(`${ADMIN_COOKIE_NAME}=my-token`);
      expect(cookieHeader).toContain('HttpOnly');
      expect(cookieHeader).toContain('Path=/');
      expect(cookieHeader).toContain('SameSite=Strict');
      expect(cookieHeader).toContain('Secure');
    });

    it('creates clear cookie header for logout', () => {
      const clearHeader = AuthService.clearAuthCookieHeader();
      expect(clearHeader).toContain(`${ADMIN_COOKIE_NAME}=;`);
      expect(clearHeader).toContain('Max-Age=0');
    });
  });
});
