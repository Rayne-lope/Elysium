import type { APIRoute } from 'astro';

export const GET: APIRoute = () => new Response(
  JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }),
  {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  }
);
