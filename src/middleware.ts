import { env } from 'cloudflare:workers';
import { defineMiddleware } from 'astro:middleware';
import { apiFailure, isSameOriginRequest, requestId, withSecurityHeaders } from '@/lib/http';
import { AuthService } from '@worker/services/auth.service';
import { RateLimitService } from '@worker/services/rate-limit.service';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isRouteWithin(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);
  const id = requestId(context.request);
  const isAdminPage = isRouteWithin(url.pathname, '/admin');
  const isAdminApi = isRouteWithin(url.pathname, '/api/admin');
  const isLoginPage = url.pathname === '/admin/login';
  const isLoginApi = url.pathname === '/api/admin/login';

  let response: Response;
  try {
    if (isAdminApi && MUTATION_METHODS.has(context.request.method) && !isSameOriginRequest(context.request)) {
      response = apiFailure('Cross-origin admin request rejected', 'CSRF_REJECTED', 403, id);
    } else if (isAdminPage || isAdminApi) {
      const token = AuthService.parseAuthCookie(context.request.headers.get('cookie'));
      let authenticated = false;
      if (token && env.AUTH_SECRET) {
        authenticated = (await AuthService.verifySessionToken(token, env.AUTH_SECRET)).valid;
      }

      if (isLoginPage && authenticated) {
        response = context.redirect('/admin/dashboard');
      } else if (!isLoginPage && !isLoginApi && !authenticated) {
        response = isAdminApi
          ? apiFailure('Admin authentication required', 'AUTH_REQUIRED', 401, id)
          : context.redirect('/admin/login');
      } else if (!isLoginPage && !isLoginApi && authenticated && MUTATION_METHODS.has(context.request.method)) {
        if (!env.AUTH_SECRET || !env.DB) {
          response = apiFailure('Admin security bindings are unavailable', 'SERVER_MISCONFIGURED', 503, id);
        } else {
          const rate = await RateLimitService.consume(
            env.DB,
            'admin-mutation',
            token || 'missing-session',
            env.AUTH_SECRET,
            { limit: 120, windowSeconds: 60 }
          );
          response = rate.allowed
            ? await next()
            : apiFailure('Too many admin requests', 'RATE_LIMITED', 429, id, {
                'Retry-After': String(rate.retryAfter),
              });
        }
      } else {
        response = await next();
      }
    } else {
      response = await next();
    }
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      requestId: id,
      route: url.pathname,
      error: error instanceof Error ? error.name : 'UnknownError',
    }));
    response = isAdminApi
      ? apiFailure('Request could not be completed', 'INTERNAL_ERROR', 500, id)
      : new Response('Service unavailable', { status: 503 });
  }

  const headers = new Headers(response.headers);
  headers.set('X-Request-ID', id);
  if (isAdminPage || isAdminApi) headers.set('Cache-Control', 'no-store');
  return withSecurityHeaders(
    new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    }),
    context.request,
    env.CDN_BASE_URL
  );
});
