# Elysium Wallpaper Platform

Astro SSR application deployed as a Cloudflare Worker with D1, R2, Cloudflare Images, and source-aware wallpaper curation workflows.

## Runtime requirements

- Node.js 22.12 or newer (`.nvmrc` is included)
- Cloudflare account with D1, two R2 buckets, and Images enabled
- Wrangler authentication for local preview or deployment

The only Worker entrypoint is `@astrojs/cloudflare/entrypoints/server`. Do not add a generated or placeholder Worker file.

## Local setup

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run db:seed:local
npm run dev
```

Populate `.dev.vars` with:

```dotenv
ADMIN_PASSWORD="a-strong-operator-password"
AUTH_SECRET="at-least-32-random-bytes-generated-by-a-csprng"
PIXABAY_API_KEY="your-server-side-pixabay-key"
CDN_BASE_URL=""
```

`.dev.vars` is ignored by Git. `AUTH_SECRET` signs admin sessions, rate-limit identities, and five-minute download links; rotate it as an operator-controlled rollout because rotation invalidates existing sessions and links.

## Commands

```bash
npm run types            # Generate Cloudflare binding/runtime types
npm run check            # Wrangler types + Astro type check
npm test                 # Unit/security suite
npm run build            # Check + production SSR build
npm run preview          # Workerd-backed Astro preview
npm run smoke:preview    # Bounded workerd health smoke on the current build
npm run audit:performance # Build + workerd public delivery audit
npm run deploy:dry-run   # Build, smoke preview, and package without deploying
npm run content:import:wikimedia # Resume the curated Commons import against local dev
```

Wrangler and the adapter read `CLOUDFLARE_ENV` when selecting an environment:

```bash
CLOUDFLARE_ENV=staging npm run build
CLOUDFLARE_ENV=staging npm run deploy:dry-run
```

Live deployment is deliberately operator-controlled:

```bash
CLOUDFLARE_ENV=production npm run deploy
```

Both deployment commands require the build and workerd health smoke to pass before Wrangler can package or publish the Worker.

## Preview CDN rollout

`CDN_BASE_URL` is an optional, non-secret runtime variable. It must be an HTTPS origin such as `https://cdn.example.com`, without a path, credentials, query, or fragment. When it is empty or invalid, every preview uses the hardened same-origin `/cdn-proxy/` fallback.

Production activation is an operator step:

1. Connect a custom domain only to the `elysium-preview-assets` R2 bucket. Never make `elysium-original-assets` public.
2. Wait for domain ownership and TLS status to become active, enforce HTTPS, and keep the `r2.dev` development URL disabled.
3. Enable cache eligibility for the preview hostname and Smart Tiered Cache. Preview keys are write-once and carry `public, max-age=31536000, immutable`.
4. Add the final origin as `CDN_BASE_URL` in the selected Wrangler deployment environment, then run the dry-run and staging smoke before production deployment.
5. Verify the second request returns `CF-Cache-Status: HIT`. Purge exact preview URLs when an emergency takedown must bypass the immutable TTL.

Cloudflare references: [public R2 buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/) and [R2 cache configuration](https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/).

## Database rollout

Migrations are additive. Never reset or rebuild a live Elysium database.

Fresh/local database:

```bash
npm run db:migrations:list:local
npm run db:migrate:local
```

An older database whose schema already contains the 0001 and 0002 changes can be baselined only after the script proves every required column and unique index exists:

```bash
npm run db:baseline:local
```

For remote state, create and verify a D1 backup first. The baseline script refuses remote mutation without an explicit confirmation:

```bash
D1_BACKUP_CONFIRMED=yes npm run db:baseline:remote
npm run db:migrations:list:remote
npm run db:migrate:remote
```

Review the migration list before every apply. These commands do not run as part of deploy.

## Storage integrity

- `ORIGINAL_BUCKET` receives the uploaded bytes directly. Originals are never transformed or used as public page images.
- `PREVIEW_BUCKET` contains validated AVIF/WebP variants only.
- Public pages emit responsive AVIF/WebP `<picture>` markup and never reference `original_r2_key`.
- Images at or below 20 MB are inspected/transformed by the Images binding.
- Originals over 20 MB retain their bytes, use a bounded server-side header parser, and require server-verified browser WebP previews.
- Publishing is blocked until required metadata and every original/preview object exists.

See [Pixabay importer](docs/pixabay.md), [Wikimedia importer](docs/wikimedia.md), [project rules](rules.md), and [execution tracking](track.md).
# Elysium
