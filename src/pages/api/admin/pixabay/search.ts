import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { apiFailure, handleApiError, jsonResponse, requestId } from '@/lib/http';
import { parsePixabaySearchParams, PixabayService, PixabayServiceError } from '@/services/pixabay/pixabay.service';
import { AuthService } from '@worker/services/auth.service';
import { PixabayApiCache } from '@worker/services/pixabay-cache.service';
import { clientIdentity, RateLimitService } from '@worker/services/rate-limit.service';

export const GET: APIRoute = async ({ request }) => {
  const id = requestId(request);
  try {
    const authSecret = AuthService.validateAuthSecret(env.AUTH_SECRET);
    const identity = AuthService.parseAuthCookie(request.headers.get('cookie')) || clientIdentity(request);
    const rate = await RateLimitService.consume(
      env.DB,
      'pixabay-search',
      identity,
      authSecret,
      { limit: 30, windowSeconds: 60 }
    );
    if (!rate.allowed) {
      return apiFailure('Search rate limit reached. Try again shortly.', 'RATE_LIMITED', 429, id, {
        'Retry-After': String(rate.retryAfter),
      });
    }

    const params = parsePixabaySearchParams(new URL(request.url).searchParams);
    const result = await new PixabayService(
      env.PIXABAY_API_KEY || '',
      fetch,
      new PixabayApiCache(env.DB)
    ).search(params);
    const { meta, ...data } = result;
    return jsonResponse(
      { success: true, data, meta },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    if (error instanceof PixabayServiceError) {
      return apiFailure(error.message, 'PIXABAY_REQUEST_FAILED', error.status, id);
    }
    return handleApiError(error, id, '/api/admin/pixabay/search', 'Pixabay search failed');
  }
};
