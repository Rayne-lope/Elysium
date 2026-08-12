import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { apiFailure, handleApiError, HttpError, requestId } from '@/lib/http';
import { requireId } from '@/lib/validation';
import { AuthService } from '@worker/services/auth.service';
import { DBService } from '@worker/services/db.service';
import { R2StorageService } from '@worker/services/r2.service';
import { clientIdentity, RateLimitService } from '@worker/services/rate-limit.service';
import { SecurityService } from '@worker/services/security.service';

export const GET: APIRoute = async ({ params, locals, request }) => {
  const id = requestId(request);
  try {
    const authSecret = AuthService.validateAuthSecret(env.AUTH_SECRET);
    const wallpaperId = requireId(params.id, 'wallpaperId');
    if (!wallpaperId.startsWith('wp_')) throw new HttpError('Invalid wallpaper ID', 400, 'VALIDATION_ERROR');
    const url = new URL(request.url);
    if ([...url.searchParams.keys()].some((key) => key !== 'token')) {
      return apiFailure('Unexpected query parameter', 'VALIDATION_ERROR', 400, id);
    }
    const token = url.searchParams.get('token') || '';
    if (!await SecurityService.verifyDownloadToken(wallpaperId, token, authSecret)) {
      return apiFailure('Download link is invalid or expired', 'INVALID_DOWNLOAD_TOKEN', 403, id);
    }
    if (!SecurityService.validateExactOriginOrReferer(request)) {
      return apiFailure('Download must be started from this website', 'ORIGIN_REJECTED', 403, id);
    }
    const rate = await RateLimitService.consume(
      env.DB, 'public-download', clientIdentity(request), authSecret, { limit: 30, windowSeconds: 60 }
    );
    if (!rate.allowed) {
      return apiFailure('Download rate limit reached', 'RATE_LIMITED', 429, id, {
        'Retry-After': String(rate.retryAfter),
      });
    }
    const wallpaper = await DBService.getWallpaperById(env.DB, wallpaperId);
    if (!wallpaper || wallpaper.status !== 'published') {
      return apiFailure('Wallpaper not found', 'NOT_FOUND', 404, id);
    }
    const head = await env.ORIGINAL_BUCKET.head(wallpaper.originalR2Key);
    if (!head) return apiFailure('Original file is unavailable', 'ASSET_UNAVAILABLE', 404, id);
    let range;
    try {
      range = SecurityService.parseSingleRange(request.headers.get('range'), head.size);
    } catch {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${head.size}` } });
    }
    const object = await env.ORIGINAL_BUCKET.get(
      wallpaper.originalR2Key,
      range ? { range: { offset: range.offset, length: range.length } } : undefined
    );
    if (!object) return apiFailure('Original file is unavailable', 'ASSET_UNAVAILABLE', 404, id);
    const headers = new Headers(R2StorageService.generateDownloadHeaders(wallpaper.title, wallpaper.format, wallpaper.mimeType));
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Cache-Control', 'private, no-store');
    headers.set('Content-Length', String(range?.length ?? head.size));
    if (range) headers.set('Content-Range', `bytes ${range.offset}-${range.end}/${head.size}`);

    const event = DBService.recordDownloadAtomic(env.DB, {
      id: `dl_${crypto.randomUUID()}`,
      wallpaperId,
      countryCode: request.headers.get('cf-ipcountry') || undefined,
      userAgentClass: SecurityService.classifyUserAgent(request.headers.get('user-agent')),
    }).catch(() => undefined);
    locals.cfContext.waitUntil(event);
    return new Response(object.body, { status: range ? 206 : 200, headers });
  } catch (error) {
    return handleApiError(error, id, '/api/wallpapers/:id/download', 'Download failed');
  }
};
