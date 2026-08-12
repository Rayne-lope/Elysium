import { describe, it, expect } from 'vitest';
import { SecurityService } from '../../worker/services/security.service';

describe('Download System & Security Service Unit Tests', () => {
  const secretKey = 'test-secret-key-123456789-abcdefghi';
  const wallpaperId = 'wp_test_12345';

  describe('HMAC Download Token', () => {
    it('generates and verifies a valid HMAC download token', async () => {
      const token = await SecurityService.generateDownloadToken(wallpaperId, secretKey, 300);
      expect(token).toBeTypeOf('string');
      expect(token).toContain('.');

      const isValid = await SecurityService.verifyDownloadToken(wallpaperId, token, secretKey);
      expect(isValid).toBe(true);
    });

    it('rejects download token for a different wallpaper ID', async () => {
      const token = await SecurityService.generateDownloadToken(wallpaperId, secretKey, 300);
      const isValid = await SecurityService.verifyDownloadToken('wp_other_999', token, secretKey);
      expect(isValid).toBe(false);
    });

    it('rejects expired download token', async () => {
      // Generate token with negative TTL (already expired)
      const token = await SecurityService.generateDownloadToken(wallpaperId, secretKey, -10);
      const isValid = await SecurityService.verifyDownloadToken(wallpaperId, token, secretKey);
      expect(isValid).toBe(false);
    });

    it('rejects malformed or tampered token', async () => {
      const isValid = await SecurityService.verifyDownloadToken(wallpaperId, 'invalid.token.str', secretKey);
      expect(isValid).toBe(false);
    });
  });

  describe('User Agent Classification', () => {
    it('classifies iPhone user agent as mobile', () => {
      const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15';
      expect(SecurityService.classifyUserAgent(ua)).toBe('mobile');
    });

    it('classifies iPad user agent as tablet', () => {
      const ua = 'Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) AppleWebKit/605.1.15';
      expect(SecurityService.classifyUserAgent(ua)).toBe('tablet');
    });

    it('classifies Googlebot as bot', () => {
      const ua = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
      expect(SecurityService.classifyUserAgent(ua)).toBe('bot');
    });

    it('classifies Chrome macOS as desktop', () => {
      const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0';
      expect(SecurityService.classifyUserAgent(ua)).toBe('desktop');
    });
  });

  describe('Hotlink Referer Validation', () => {
    it('allows request with referer from allowed hostname', () => {
      const req = new Request('http://localhost:4321/api/download', {
        headers: { referer: 'http://localhost:4321/wallpaper/alpine-lake' },
      });
      const isValid = SecurityService.validateReferer(req, ['localhost']);
      expect(isValid).toBe(true);
    });

    it('blocks request with referer from unauthorized external domain', () => {
      const req = new Request('http://localhost:4321/api/download', {
        headers: { referer: 'https://malicious-scraper-site.com/gallery' },
      });
      const isValid = SecurityService.validateReferer(req, ['elysium.com']);
      expect(isValid).toBe(false);
    });
  });
});
