import type { APIRoute } from 'astro';
import { jsonResponse } from '@/lib/http';
import { AuthService } from '@worker/services/auth.service';

export const POST: APIRoute = async ({ request }) => {
  const secure = new URL(request.url).protocol === 'https:';
  return jsonResponse(
    { success: true, redirect: '/admin/login' },
    {
      status: 200,
      headers: {
        'Set-Cookie': AuthService.clearAuthCookieHeader(secure),
        'Cache-Control': 'no-store',
      },
    }
  );
};
