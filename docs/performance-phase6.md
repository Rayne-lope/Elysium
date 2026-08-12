# Phase 6 Performance and CDN Report

## Scope

Phase 6 optimizes public preview delivery without changing visual direction, database schema, original R2 objects, signed downloads, or dynamic HTML caching. A live custom domain remains an operator-controlled Phase 11 action.

## Baseline

Measured locally on 2026-08-10 before implementation:

| Signal | Baseline |
| --- | ---: |
| Homepage HTML | 38,748 bytes |
| Homepage wallpaper images | 16 |
| Native lazy images | 16 |
| Eager/high-priority images | 0 |
| Images with `srcset`/`sizes` | 0 |
| Hero source | CSS background, fixed 1600 AVIF |
| Font delivery | Render-blocking Google Fonts `@import` |

Sample featured preview weights were 43,462 bytes at 480, 154,432 bytes at 960, and 353,120 bytes at 1600. The immutable R2/proxy policy and ETag already existed, but responsive selection and a custom-domain configuration path did not.

## Implemented

- Optional strict `CDN_BASE_URL` origin with `/cdn-proxy/` fallback and CSP allowlisting.
- Shared preview-key validation for AVIF, numeric WebP, and fallback WebP; original and traversal keys remain rejected.
- Responsive `<picture>` markup with actual-width descriptors, context-aware `sizes`, an eager hero/detail/first-result candidate, and native lazy loading below the fold.
- Reserved image aspect ratios and request-free missing-preview placeholders.
- Self-hosted versioned Latin variable WOFF2 files for Plus Jakarta Sans and Outfit, preloaded with immutable static headers.
- Repeatable workerd audit covering public HTML, asset status, original/secret leakage, image attributes, ETag/304, immutable caching, and font delivery.

## Acceptance Results

Completed locally on 2026-08-10 against the workerd production build:

| Check | Result |
| --- | --- |
| Unit/security suite | 98/98 tests passed across 14 files |
| Astro check | 70 files, 0 errors, warnings, or hints |
| Production build | Passed with Astro SSR on the Cloudflare adapter |
| Workerd performance audit | Passed six public routes and three unique preview assets |
| Production dependency audit | 0 vulnerabilities |
| Wrangler dry-run | Passed with SSR, Assets, D1, both R2 buckets, and Images |

The final workerd audit measured 45,216 bytes and 17 responsive images on the homepage. The larger HTML than baseline is the expected responsive `<picture>` metadata; browsers now select an appropriately sized immutable preview rather than always downloading the 1600 px hero.

Lighthouse 13.4.1 mobile results using Chrome for Testing 151:

| Route | Performance | Accessibility | Best Practices | LCP | CLS | TBT |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Homepage | 98 | 100 | 100 | 2.30 s | 0 | 0 ms |
| Explore | 99 | 98 | 100 | 2.24 s | 0 | 15 ms |
| Detail | 98 | 98 | 100 | 2.42 s | 0 | 0 ms |

All Phase 6 lab thresholds passed. These are local workerd measurements, not claims about the future production edge. Live custom-domain cache validation remains a Phase 11 operator task.

## Production Operator Checklist

1. Attach only the preview bucket to the chosen custom domain.
2. Confirm HTTPS and certificate state are active; do not expose the original bucket or enable `r2.dev` for production.
3. Enable cache eligibility and Smart Tiered Cache for the preview hostname.
4. Configure the exact HTTPS origin as `CDN_BASE_URL` in the target deployment environment.
5. Verify preview URLs, one-year immutable headers, and `CF-Cache-Status: HIT` on a repeated request.
6. Keep exact-URL cache purge available for emergency takedowns.

References: [Cloudflare R2 public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/) and [Cloudflare R2 cache](https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/).
