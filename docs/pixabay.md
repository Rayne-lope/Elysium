# Pixabay Content Importer

Status: implemented and hardened.

This feature lets an authenticated administrator discover Pixabay photos, select a bounded batch, import untouched source bytes to Elysium R2, generate local previews, review metadata as drafts, and publish in a separate guarded action.

## Data flow

```text
Admin browser
  -> Elysium authenticated search API
  -> Pixabay API (server only)
  -> public search DTO (no original URL)
  -> selected Pixabay IDs
  -> Elysium import API
  -> server lookup by ID
  -> bounded source stream
  -> original R2 + preview R2 + atomic D1 metadata
  -> draft review
  -> publication gate
```

Pixabay is discovery/source provenance, never Elysium's permanent delivery backend. Gallery and detail pages use only Elysium preview R2 objects. Downloads use untouched Elysium original R2 objects.

## Routes

### Search

`GET /api/admin/pixabay/search`

Authenticated query parameters:

- `q`: at most 100 characters
- `page`: 1–500
- `per_page`: 3–50
- `orientation`: `all`, `horizontal`, or `vertical`
- `category`: Pixabay allowlisted category
- `min_width`, `min_height`: 0–20,000
- `order`: `popular` or `latest`

Example success response:

```json
{
  "success": true,
  "data": {
    "total": 100,
    "totalHits": 100,
    "page": 1,
    "perPage": 24,
    "images": [
      {
        "pixabayId": 123,
        "previewUrl": "https://cdn.pixabay.com/...",
        "sourceUrl": "https://pixabay.com/photos/...",
        "creator": "contributor",
        "creatorUrl": "https://pixabay.com/users/...",
        "tags": ["mountain"],
        "width": 6000,
        "height": 4000,
        "fileSize": 12000000,
        "orientation": "landscape",
        "title": "Mountain"
      }
    ]
  },
  "meta": { "cache": "hit" }
}
```

The public/admin browser DTO never includes `sourceAssetUrl` or the API key.

### Import

`POST /api/admin/pixabay/import`

Content type is `application/json`; body is limited to 32 KB. Maximum batch size is defined in `pixabay.constants.ts`. IDs must be unique positive safe integers. Additional tags are limited to 20 items of 50 characters.

```json
{
  "images": [{ "pixabayId": 123 }],
  "settings": {
    "defaultCategoryId": "cat_nature",
    "sourceCategory": "nature",
    "additionalTags": ["curated"]
  }
}
```

The endpoint supports NDJSON progress events when the request accepts `application/x-ndjson`. Two items are processed concurrently; one failed item does not stop the rest. The final result classifies each ID as `imported`, `duplicate`, or `failed`.

## Security controls

- Pixabay API calls occur only in the Worker and require `PIXABAY_API_KEY`.
- Admin middleware verifies an 8-hour HMAC session and exact same-origin mutation requests.
- Persistent D1 rate limits are keyed with HMAC rather than raw IP/session values:
  - search: 30 per minute
  - import: 5 per minute
- Search and ID lookup responses are runtime-validated before mapping.
- Upstream calls use a 10-second timeout, at most three attempts, jitter, and bounded `Retry-After` handling.
- D1 cache entries are fresh for 24 hours. An expired entry can be used for at most seven additional days only if upstream fails; responses report `hit`, `miss`, or `stale`.
- Source downloads allow HTTPS Pixabay hosts only, follow at most five manual redirects, and validate every hop.
- Source bodies stream with a 20 MB limit and cancel immediately on overflow.
- Declared MIME type, binary signature, and dimensions must agree.
- Unique source ID and SHA-256 conflicts return `duplicate`, including concurrent races.
- Pixabay records always enter as drafts with creator, source URL, external ID, provenance, and license note.

## Admin UI behavior

The importer supports search filters, stable multi-select, review, progress, failure isolation, and retry of failed IDs only.

Hardening behavior:

- Result/queue/failure content is created with DOM APIs and `textContent`; no dynamic `innerHTML` interpolation.
- Preview URLs must be HTTPS Pixabay URLs.
- A new search aborts the previous request and stale responses cannot overwrite newer results.
- Search and import buttons lock while active; 401 redirects to login and 429 shows a retry countdown.
- Active imports warn before navigation.
- Summary receives focus and uses `aria-live`.
- Scrolling respects `prefers-reduced-motion`.

## Required bindings and secrets

```text
DB                Cloudflare D1
ORIGINAL_BUCKET   private original R2 bucket
PREVIEW_BUCKET    public-through-proxy preview R2 bucket
IMAGES            Cloudflare Images binding
PIXABAY_API_KEY   Worker secret
ADMIN_PASSWORD    Worker secret
AUTH_SECRET       Worker secret, at least 32 random bytes
```

Never put secrets in `wrangler.jsonc`, client code, a committed `.env`, or API responses. Use `.dev.vars` locally and `wrangler secret put` for deployed environments.

## Database migration

`db/migrations/0002_pixabay_importer.sql` adds source provenance columns and unique source/hash indexes. `0003_hardening.sql` adds `pixabay_api_cache` and `api_rate_limits`.

Fresh local state:

```bash
npm run db:migrate:local
```

Existing state that already has 0001/0002 must pass the safe baseline preflight:

```bash
npm run db:baseline:local
```

Production rollout is never automatic. Back up remote D1, explicitly confirm the baseline if needed, list pending migrations, apply them, configure secrets, run a deploy dry-run, smoke-test staging, and only then perform an operator-approved production deploy. See the root README for exact commands.

## Failure model

- Missing binding/secret: fail closed; no development fallback.
- Pixabay unavailable: use eligible stale cache or return a generic structured upstream error.
- Invalid upstream payload/URL/image: reject that item.
- R2/Images/D1 failure during ingestion: clean up this import's R2 objects where safe and return a failed item.
- Concurrent source/hash insert: clean up this attempt and return duplicate.
- Publish with incomplete metadata/provenance/assets: reject.
- Delete failure: the row remains archived for safe retry.

Internal failures are logged with request ID and route, without API keys, cookies, secrets, or raw IP addresses.
