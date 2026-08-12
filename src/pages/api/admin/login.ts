import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { apiFailure, handleApiError, jsonResponse, readJsonBody, requestId } from '@/lib/http';
import { asObject, assertAllowedKeys, boundedString } from '@/lib/validation';
import { AuthService } from '@worker/services/auth.service';
import { clientIdentity, RateLimitService } from '@worker/services/rate-limit.service';

export const POST: APIRoute = async ({ request }) => {
  const id = requestId(request);
  try {
    if (!env.ADMIN_PASSWORD || !env.AUTH_SECRET
      || new TextEncoder().encode(env.AUTH_SECRET).byteLength < 32 || !env.DB) {
      return apiFailure('Admin authentication is not configured', 'SERVER_MISCONFIGURED', 503, id);
    }
    const authSecret = AuthService.validateAuthSecret(env.AUTH_SECRET);

    const rate = await RateLimitService.consume(
      env.DB,
      'admin-login',
      clientIdentity(request),
      authSecret,
      { limit: 5, windowSeconds: 15 * 60 }
    );
    if (!rate.allowed) {
      return apiFailure('Too many login attempts. Try again later.', 'RATE_LIMITED', 429, id, {
        'Retry-After': String(rate.retryAfter),
      });
    }

    const body = asObject(await readJsonBody(request));
    assertAllowedKeys(body, ['password']);
    const password = boundedString(body.password, 'password', { min: 1, max: 256 });
    const valid = await AuthService.verifyAdminCredentials(password || '', env.ADMIN_PASSWORD);
    if (!valid) return apiFailure('Invalid admin credentials', 'INVALID_CREDENTIALS', 401, id);

    const token = await AuthService.generateSessionToken(authSecret);
    const secure = new URL(request.url).protocol === 'https:';
    return jsonResponse(
      { success: true, redirect: '/admin/dashboard' },
      {
        status: 200,
        headers: {
          'Set-Cookie': AuthService.createAuthCookieHeader(token, 8 * 60 * 60, secure),
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    return handleApiError(error, id, '/api/admin/login', 'Login failed');
  }
};
