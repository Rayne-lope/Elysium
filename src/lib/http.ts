import { parseCdnOrigin } from '@/lib/preview-assets';

export interface ApiFailure {
  success: false;
  error: string;
  code: string;
  requestId: string;
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly headers?: HeadersInit
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

const generatedRequestIds = new WeakMap<Request, string>();

export function requestId(request: Request): string {
  const existing = generatedRequestIds.get(request);
  if (existing) return existing;
  const ray = request.headers.get('cf-ray')?.split('-')[0];
  const id = ray && /^[a-zA-Z0-9]{8,32}$/.test(ray) ? ray : crypto.randomUUID();
  generatedRequestIds.set(request, id);
  return id;
}

export function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(value), { ...init, headers });
}

export function apiFailure(
  message: string,
  code: string,
  status: number,
  id: string,
  headers?: HeadersInit
): Response {
  return jsonResponse(
    { success: false, error: message, code, requestId: id } satisfies ApiFailure,
    { status, headers }
  );
}

export function handleApiError(
  error: unknown,
  id: string,
  route: string,
  fallbackMessage = 'Request failed',
  fallbackStatus = 500
): Response {
  if (error instanceof HttpError) {
    return apiFailure(error.message, error.code, error.status, id, error.headers);
  }

  const safeMessage = error instanceof Error
    ? error.message
      .replace(/([?&](?:key|token|secret|password|cookie)=)[^&\s]+/gi, '$1[REDACTED]')
      .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[REDACTED_IP]')
      .slice(0, 300)
    : 'Unknown failure';
  console.error(JSON.stringify({
    level: 'error',
    requestId: id,
    route,
    error: error instanceof Error ? error.name : 'UnknownError',
    message: safeMessage,
  }));
  return apiFailure(
    fallbackMessage,
    fallbackStatus === 503 ? 'SERVICE_UNAVAILABLE' : 'INTERNAL_ERROR',
    fallbackStatus,
    id
  );
}

export async function readJsonBody(request: Request, maxBytes = 32 * 1024): Promise<unknown> {
  const contentType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    throw new HttpError('Content-Type must be application/json', 415, 'UNSUPPORTED_MEDIA_TYPE');
  }

  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new HttpError('Request body is too large', 413, 'BODY_TOO_LARGE');
  }

  const reader = request.body?.getReader();
  if (!reader) throw new HttpError('Request body is required', 400, 'BODY_REQUIRED');
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new HttpError('Request body is too large', 413, 'BODY_TOO_LARGE');
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new HttpError('Request body is not valid JSON', 400, 'INVALID_JSON');
  }
}

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function withSecurityHeaders(response: Response, request: Request, cdnBaseUrl?: string): Response {
  const headers = new Headers(response.headers);
  const url = new URL(request.url);
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  const cdnOrigin = parseCdnOrigin(cdnBaseUrl);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('X-Frame-Options', 'DENY');
  headers.set(
    'Content-Security-Policy',
    `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob: https://pixabay.com https://*.pixabay.com${cdnOrigin ? ` ${cdnOrigin}` : ''}; connect-src 'self'${local ? ' ws:' : ''}; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`
  );
  const productionHost = url.hostname !== 'localhost'
    && url.hostname !== '127.0.0.1'
    && !url.hostname.endsWith('.workers.dev')
    && !url.hostname.endsWith('.pages.dev')
    && !url.hostname.endsWith('.test');
  if (url.protocol === 'https:' && productionHost) {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
