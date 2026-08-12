/// <reference path="./.astro/types.d.ts" />

declare namespace Cloudflare {
  interface Env {
    ADMIN_PASSWORD?: string;
    AUTH_SECRET?: string;
    PIXABAY_API_KEY?: string;
    CDN_BASE_URL?: string;
  }
}

declare namespace App {
  interface Locals {
    cfContext: ExecutionContext;
  }
}
