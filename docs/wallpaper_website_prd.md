# PRODUCT REQUIREMENTS DOCUMENT (PRD)
# HIGH-RESOLUTION WALLPAPER PLATFORM

**Document Version:** 1.0  
**Status:** Initial Product Specification  
**Product Type:** High-resolution wallpaper gallery and download platform  
**Primary Stack:** Astro + Cloudflare Pages + Cloudflare Workers + Cloudflare D1 + Cloudflare R2  
**Primary Goal:** Menyediakan platform wallpaper resolusi tinggi dengan pengalaman browsing cepat, file preview ringan, dan file original yang tetap utuh tanpa proses resize, re-encoding, atau konversi pada saat download.

---

# 1. PRODUCT OVERVIEW

## 1.1 Product Vision

Membangun website wallpaper premium yang:

- cepat dibuka meskipun katalog berisi banyak gambar beresolusi tinggi,
- memiliki tampilan visual yang bersih dan fokus pada artwork,
- menyimpan file original secara terpisah dari file preview,
- memungkinkan user mengunduh file original tanpa manipulasi kualitas,
- memiliki arsitektur yang sederhana dan murah untuk dijalankan,
- dapat berkembang dari katalog sederhana menjadi platform wallpaper dengan kategori, pencarian, koleksi, analytics, dan akun pengguna bila diperlukan.

Website tidak menggunakan file original berukuran besar sebagai sumber utama pada grid atau halaman katalog.

Setiap wallpaper memiliki minimal dua kelompok asset:

1. **Preview Asset**
   - Digunakan untuk gallery dan halaman detail.
   - Format utama AVIF atau WebP.
   - Dioptimalkan untuk browser.
   - Dapat memiliki beberapa ukuran.

2. **Original Asset**
   - File sumber asli.
   - Tidak di-resize.
   - Tidak di-re-encode.
   - Tidak diubah formatnya ketika didownload.
   - Disimpan di Cloudflare R2.

---

# 2. PRODUCT GOALS

## 2.1 Primary Goals

1. Menyediakan katalog wallpaper dengan loading cepat.
2. Menjaga kualitas file original.
3. Memisahkan preview asset dari original asset.
4. Menyediakan sistem upload dan metadata yang terstruktur.
5. Menyediakan search, filter, dan category browsing.
6. Memberikan detail teknis wallpaper sebelum download.
7. Mencatat jumlah download tanpa mengganggu proses download.
8. Memiliki arsitektur yang dapat berjalan dalam ekosistem Cloudflare.
9. Mengoptimalkan SEO untuk halaman wallpaper.
10. Menyediakan fondasi yang dapat dikembangkan tanpa perlu mengganti arsitektur utama.

---

# 3. NON-GOALS — INITIAL RELEASE

Fitur berikut tidak termasuk MVP:

- marketplace wallpaper,
- sistem pembayaran,
- subscription berbayar,
- komentar publik,
- direct messaging,
- social feed kompleks,
- aplikasi mobile native,
- AI wallpaper generator di dalam website,
- sistem upload publik oleh semua user,
- creator revenue sharing,
- NFT atau blockchain integration,
- cloud editing wallpaper,
- advanced recommendation engine berbasis machine learning.

Fitur tersebut dapat dipertimbangkan pada phase lanjutan.

---

# 4. TARGET USERS

## 4.1 Visitor

User yang datang untuk:

- melihat wallpaper,
- mencari wallpaper,
- melihat kategori,
- membuka detail wallpaper,
- melihat resolusi dan aspect ratio,
- mengunduh file original.

Tidak wajib login pada MVP.

## 4.2 Administrator

User internal yang dapat:

- login ke admin panel,
- menambah wallpaper,
- upload original asset,
- upload atau generate preview asset,
- mengisi metadata,
- mengubah metadata,
- publish/unpublish wallpaper,
- menghapus wallpaper,
- melihat statistik dasar.

## 4.3 Future Registered User

Tidak termasuk MVP.

Potensi fitur:

- favorite,
- personal collection,
- download history,
- personalized recommendations,
- sync antar device.

---

# 5. CORE PRODUCT PRINCIPLES

## 5.1 Original File Integrity

File original yang telah diupload ke storage tidak boleh dimodifikasi oleh frontend.

Download harus mengambil object original.

## 5.2 Preview First

Semua gallery dan preview website menggunakan asset yang telah dioptimalkan.

Original asset tidak digunakan langsung dalam gallery.

## 5.3 Image-Centric Interface

UI tidak boleh mengalahkan visual wallpaper.

Elemen interface harus:

- minimal,
- ringan,
- mudah dipahami,
- memberikan ruang besar untuk artwork.

## 5.4 Performance First

Website harus memprioritaskan:

- lightweight JavaScript,
- responsive image,
- lazy loading,
- caching,
- static rendering jika memungkinkan,
- minimal client-side hydration.

## 5.5 Metadata Driven

Informasi wallpaper tidak disimpan hard-coded dalam source code.

Metadata harus berasal dari database.

---

# 6. TECHNICAL ARCHITECTURE

```text
                            USER
                              │
                              ▼
                        Main Website
                              │
                              ▼
                        Cloudflare CDN
                              │
                 ┌────────────┴────────────┐
                 │                         │
                 ▼                         ▼
              Astro                    Workers API
       Cloudflare Pages                     │
                 │                           │
         ┌───────┴────────┐          ┌───────┴────────┐
         │                │          │                │
         ▼                ▼          ▼                ▼
       D1 DB          Preview R2   D1 Metadata    Original R2
 Metadata/Stats          Assets       /Stats          Assets
```

---

# 7. TECH STACK

## 7.1 Frontend

**Astro**

Responsibilities:

- homepage,
- explore page,
- category page,
- wallpaper detail,
- search results,
- static content,
- SEO metadata,
- responsive image rendering,
- partial client-side interaction.

## 7.2 Hosting

**Cloudflare Pages**

Responsibilities:

- deploy Astro frontend,
- static delivery,
- edge CDN,
- preview deployment.

## 7.3 Backend API

**Cloudflare Workers**

Responsibilities:

- admin APIs,
- wallpaper metadata CRUD,
- download counter,
- signed/private operations,
- upload orchestration,
- validation,
- future user APIs.

## 7.4 Database

**Cloudflare D1**

Stores:

- wallpaper metadata,
- category data,
- tag data,
- download counters,
- publish status,
- asset references,
- timestamps.

## 7.5 Object Storage

**Cloudflare R2**

Stores:

```text
wallpapers/
├── original/
│   └── {wallpaper-id}/
│       └── original.ext
│
└── preview/
    └── {wallpaper-id}/
        ├── 480.avif
        ├── 960.avif
        ├── 1600.avif
        └── fallback.webp
```

Alternative:

```text
original/{wallpaper-id}.{ext}
preview/{wallpaper-id}/480.avif
preview/{wallpaper-id}/960.avif
preview/{wallpaper-id}/1600.avif
```

## 7.6 CDN Domain

Recommended structure:

```text
www.example.com
cdn.example.com
api.example.com
```

Possible simplified structure:

```text
example.com
cdn.example.com
```

---

# 8. INFORMATION ARCHITECTURE

## 8.1 Public Routes

```text
/
├── /explore
├── /wallpaper/[slug]
├── /category/[slug]
├── /tag/[slug]
├── /search
├── /latest
├── /popular
├── /about
├── /privacy
├── /terms
└── /license
```

## 8.2 Admin Routes

```text
/admin
├── /login
├── /dashboard
├── /wallpapers
├── /wallpapers/new
├── /wallpapers/[id]/edit
├── /categories
├── /tags
└── /analytics
```

---

# 9. CORE FEATURES

# 9.1 Homepage

Homepage bertujuan memperkenalkan koleksi dan mengarahkan user ke wallpaper.

Sections:

1. Hero / Featured Wallpaper
2. Latest Wallpapers
3. Popular Wallpapers
4. Featured Categories
5. Editorial Collection
6. Browse by Orientation
7. Footer

Possible orientation filters:

- Desktop
- Mobile
- Ultrawide
- Square
- Tablet

---

# 9.2 Explore Page

Grid semua wallpaper.

Required:

- responsive masonry/grid layout,
- pagination atau infinite loading,
- lazy loading,
- filter,
- sort.

Filters:

- orientation,
- category,
- resolution class,
- aspect ratio,
- tag.

Sort:

- newest,
- most downloaded,
- featured.

---

# 9.3 Wallpaper Card

Wallpaper card menampilkan:

- preview,
- title,
- optional category,
- optional resolution badge,
- optional orientation indicator.

Desktop interaction:

- subtle hover,
- quick detail action.

Mobile:

- tap membuka detail page.

Card tidak menggunakan original asset.

---

# 9.4 Wallpaper Detail Page

Required information:

- large preview,
- title,
- description,
- dimensions,
- aspect ratio,
- orientation,
- file format,
- original file size,
- category,
- tags,
- published date,
- download count,
- Download Original button.

Optional:

- related wallpapers,
- dominant color,
- device preview.

---

# 9.5 Download Original

Flow:

```text
User
  ↓
Click "Download Original"
  ↓
POST /api/wallpapers/{id}/download
  ↓
Validate wallpaper exists and published
  ↓
Increment download metric
  ↓
Return download URL / stream response
  ↓
Browser downloads original R2 object
```

Download response should use appropriate:

```http
Content-Type: actual-file-mime-type
Content-Disposition: attachment; filename="..."
```

The original file must not be transformed during this flow.

---

# 9.6 Search

Search fields:

- title,
- description,
- category,
- tags.

MVP implementation:

- normalized text query,
- SQL matching from D1.

Search result:

- wallpaper grid,
- result count,
- active query.

Future enhancement:

- typo tolerance,
- semantic search,
- autocomplete.

---

# 9.7 Categories

Each wallpaper may have one primary category.

Example categories:

- Nature
- Architecture
- Space
- Automotive
- Abstract
- Illustration
- Painting
- Dark
- Minimal
- Cinematic

Category list is configurable through admin.

---

# 9.8 Tags

One wallpaper may have multiple tags.

Examples:

- mountain,
- night,
- monochrome,
- impasto,
- vintage,
- ocean,
- forest,
- city,
- cinematic.

---

# 9.9 Orientation

System-generated field.

Possible enum:

```text
portrait
landscape
square
```

Determination:

```text
width > height  = landscape
height > width  = portrait
width = height  = square
```

---

# 9.10 Resolution Classification

Automatically calculated.

Possible labels:

```text
HD
FHD
QHD
4K
5K
6K
8K
Custom
```

Exact dimensions remain the primary source of truth.

Resolution label is only presentation metadata.

---

# 10. ADMIN CMS

# 10.1 Admin Authentication

MVP hanya membutuhkan administrator.

Requirements:

- protected admin route,
- secure session,
- logout,
- unauthorized access rejected.

Implementation can use Cloudflare-compatible authentication strategy.

---

# 10.2 Admin Dashboard

Dashboard cards:

- total wallpapers,
- published wallpapers,
- drafts,
- total downloads,
- total categories,
- storage summary if available.

Recent section:

- latest uploaded wallpapers,
- most downloaded wallpapers.

---

# 10.3 Create Wallpaper

Form fields:

### Content

- title,
- slug,
- description,
- category,
- tags.

### Asset

- original file,
- preview files.

### Technical

Auto extracted where possible:

- width,
- height,
- aspect ratio,
- orientation,
- format,
- file size.

### Publishing

- draft,
- published,
- featured.

### Optional Attribution

- creator,
- source/provenance,
- usage/license note.

---

# 10.4 Edit Wallpaper

Admin dapat mengubah:

- title,
- description,
- category,
- tags,
- featured flag,
- publish status,
- slug,
- attribution metadata.

Original file tidak diganti otomatis hanya karena metadata diedit.

Replacing original asset requires explicit action.

---

# 10.5 Delete Wallpaper

Delete operation must:

1. require explicit confirmation,
2. delete metadata,
3. delete corresponding preview objects,
4. delete original object,
5. remove tag relations,
6. prevent stale public route.

Recommended:

Use soft-delete before permanent deletion if audit/recovery is later required.

---

# 11. IMAGE PIPELINE

# 11.1 Original Upload Pipeline

```text
ADMIN SELECTS FILE
        │
        ▼
Validate type
        │
        ▼
Validate file size
        │
        ▼
Read dimensions
        │
        ▼
Generate unique wallpaper ID
        │
        ▼
Upload original untouched to R2
        │
        ▼
Store R2 object key
        │
        ▼
Generate/upload preview
        │
        ▼
Create metadata in D1
        │
        ▼
Publish
```

---

# 11.2 Supported Original Formats

Initial recommended support:

- JPEG
- PNG
- WebP
- AVIF

Optional future:

- TIFF master archival storage.

Browser compatibility should be considered before allowing direct public downloads of uncommon formats.

---

# 11.3 Preview Generation

Recommended preview sizes:

```text
480 px
960 px
1600 px
```

Width-based sizing for landscape assets.

Equivalent dimension logic for portrait assets.

Primary format:

- AVIF

Fallback:

- WebP

Preview generation must never overwrite original.

---

# 11.4 Duplicate Prevention

Generate hash from uploaded original file.

Example:

```text
SHA-256(original_file)
```

Database stores:

```text
file_hash
```

Before upload:

```text
if hash exists:
    warn duplicate
```

---

# 12. DATABASE DESIGN

# 12.1 wallpapers

```sql
CREATE TABLE wallpapers (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,

    category_id TEXT,

    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    aspect_ratio REAL NOT NULL,
    orientation TEXT NOT NULL,

    format TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    resolution_label TEXT,

    original_r2_key TEXT NOT NULL,
    preview_480_key TEXT,
    preview_960_key TEXT,
    preview_1600_key TEXT,
    preview_fallback_key TEXT,

    file_hash TEXT,

    creator TEXT,
    source_provenance TEXT,
    license_note TEXT,

    status TEXT DEFAULT 'draft',
    is_featured INTEGER DEFAULT 0,

    download_count INTEGER DEFAULT 0,

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    published_at TEXT,

    FOREIGN KEY (category_id) REFERENCES categories(id)
);
```

---

# 12.2 categories

```sql
CREATE TABLE categories (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

---

# 12.3 tags

```sql
CREATE TABLE tags (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL
);
```

---

# 12.4 wallpaper_tags

```sql
CREATE TABLE wallpaper_tags (
    wallpaper_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,

    PRIMARY KEY (wallpaper_id, tag_id),

    FOREIGN KEY (wallpaper_id)
        REFERENCES wallpapers(id)
        ON DELETE CASCADE,

    FOREIGN KEY (tag_id)
        REFERENCES tags(id)
        ON DELETE CASCADE
);
```

---

# 12.5 download_events

Optional MVP.

```sql
CREATE TABLE download_events (
    id TEXT PRIMARY KEY,
    wallpaper_id TEXT NOT NULL,
    downloaded_at TEXT NOT NULL,
    country_code TEXT,
    user_agent_class TEXT,

    FOREIGN KEY (wallpaper_id)
        REFERENCES wallpapers(id)
        ON DELETE CASCADE
);
```

Privacy-sensitive identifiers should not be stored unless there is a defined product need.

---

# 13. API DESIGN

Base:

```text
/api
```

---

# 13.1 Public API

## GET /api/wallpapers

Purpose:

- wallpaper listing.

Query params:

```text
page
limit
category
tag
orientation
sort
q
```

---

## GET /api/wallpapers/:slug

Returns:

- wallpaper metadata,
- preview URLs,
- category,
- tags.

Original object key should not be unnecessarily exposed if download routing is controlled by Worker.

---

## POST /api/wallpapers/:id/download

Purpose:

- validate wallpaper,
- increment download,
- issue download response.

---

## GET /api/categories

Returns public categories.

---

## GET /api/tags

Returns public tags.

---

# 13.2 Admin API

```text
POST   /api/admin/wallpapers
PUT    /api/admin/wallpapers/:id
DELETE /api/admin/wallpapers/:id

POST   /api/admin/categories
PUT    /api/admin/categories/:id
DELETE /api/admin/categories/:id

POST   /api/admin/tags
PUT    /api/admin/tags/:id
DELETE /api/admin/tags/:id
```

All admin endpoints require authentication.

---

# 14. UI / UX REQUIREMENTS

# 14.1 Visual Direction

Recommended aesthetic:

- editorial,
- premium,
- image-first,
- minimal,
- spacious,
- cinematic,
- refined typography.

Avoid:

- overly dense dashboard-like public UI,
- excessive borders,
- large amounts of decorative UI,
- intrusive badges,
- aggressive gradients,
- excessive animation.

---

# 14.2 Public Navigation

Desktop:

```text
Logo
Explore
Latest
Popular
Categories
Search
```

Mobile:

- logo,
- search,
- menu.

---

# 14.3 Responsive Breakpoints

Exact implementation is flexible.

Target device classes:

- mobile,
- tablet,
- laptop,
- desktop,
- ultrawide.

Wallpaper grid should adapt column count based on viewport.

---

# 14.4 Image Loading

Requirements:

- `loading="lazy"` below fold,
- responsive `srcset`,
- width/height defined,
- reserve layout space,
- use optimized preview,
- never load original in card grid.

---

# 14.5 Loading States

Use:

- lightweight skeleton,
- blurred placeholder,
- dominant color placeholder.

Avoid blocking spinner for the entire page.

---

# 14.6 Empty States

Examples:

Search:

```text
No wallpapers found for "..."
```

Category:

```text
No wallpapers available in this category yet.
```

---

# 15. SEO REQUIREMENTS

Every wallpaper detail page should include:

- unique title,
- meta description,
- canonical URL,
- Open Graph image,
- Twitter/social card metadata,
- structured image metadata where applicable,
- human-readable slug.

Example:

```text
/wallpaper/misty-alpine-impasto
```

Not:

```text
/wallpaper?id=8127391
```

---

# 16. ACCESSIBILITY REQUIREMENTS

Minimum targets:

- keyboard navigable,
- visible focus states,
- sufficient color contrast,
- semantic HTML,
- useful alt text,
- buttons must use proper button semantics,
- download action accessible by keyboard,
- reduced motion respected.

Artwork alt text should describe the visual rather than repeating title only.

---

# 17. PERFORMANCE REQUIREMENTS

Primary objectives:

- preview-first delivery,
- low JavaScript,
- edge caching,
- static generation where possible,
- minimal network requests.

Recommended targets:

- avoid original images on initial page load,
- compressed preview asset appropriate to displayed size,
- no layout shift from unknown image dimensions,
- API response payloads remain small.

---

# 18. CACHE STRATEGY

## Preview Asset

Recommended:

```text
Cache-Control: public, max-age=31536000, immutable
```

when filename/object key is content-versioned.

## Original Asset

Caching depends on download architecture.

Original asset may use long cache duration if immutable.

## HTML

Use Cloudflare/Astro strategy appropriate to content update frequency.

---

# 19. SECURITY REQUIREMENTS

## Public

- validate all query params,
- escape output,
- rate-limit sensitive API routes when necessary,
- do not expose admin credentials,
- never store secrets in frontend.

## Admin

- authentication required,
- CSRF-safe architecture if cookie-based session is used,
- secure cookie settings,
- input validation,
- file type validation,
- server-side authorization,
- upload size limits.

## R2

Admin credentials must never be exposed to client browser.

---

# 20. CONTENT AND RIGHTS REQUIREMENTS

For every wallpaper, system should support provenance metadata.

Fields:

- creator,
- source,
- license note,
- ownership/provenance status.

Purpose:

- avoid losing source information,
- allow future licensing page,
- simplify content auditing.

The platform should only publish files for which publication and distribution rights are established by the site operator.

---

# 21. ANALYTICS

# 21.1 MVP Metrics

Track:

- total wallpapers,
- total downloads,
- downloads per wallpaper,
- most downloaded wallpapers,
- newly published wallpapers.

---

# 21.2 Future Metrics

Optional:

- page views,
- search terms,
- category performance,
- download conversion rate,
- device class,
- country-level aggregate traffic.

Avoid collecting unnecessary personal data.

---

# 22. ERROR HANDLING

Examples:

## Wallpaper Not Found

Return:

```text
404
```

## Deleted/Unpublished Wallpaper

Public page must not expose content.

## R2 Object Missing

Worker should:

- fail gracefully,
- log asset inconsistency,
- avoid returning invalid download.

## Upload Failure

Admin must receive:

- explicit error,
- failed asset name,
- retry option.

---

# 23. LOGGING

Log server-side operational events such as:

- failed upload,
- failed database mutation,
- missing R2 object,
- failed download response,
- authentication failure,
- admin deletion.

Do not log confidential credentials.

---

# 24. TESTING STRATEGY

## Unit Tests

Target:

- metadata normalization,
- orientation calculation,
- aspect ratio calculation,
- resolution label calculation,
- slug creation,
- API validation.

## Integration Tests

Target:

- D1 CRUD,
- R2 upload,
- R2 delete,
- download endpoint,
- search filters,
- category filters.

## E2E Tests

Flows:

```text
Open homepage
→ open wallpaper
→ download original
```

```text
Admin login
→ upload wallpaper
→ publish
→ public detail visible
```

```text
Admin delete wallpaper
→ public page returns 404
```

---

# 25. DEPLOYMENT ENVIRONMENTS

Recommended:

```text
local
staging
production
```

Separate environment bindings where practical:

- D1 database,
- R2 bucket,
- secrets.

---

# 26. GIT WORKFLOW

Recommended branches:

```text
main
develop
feature/*
fix/*
```

Alternative simplified model:

```text
main
feature/*
```

For solo development, simplified model is sufficient.

---

# 27. PRODUCT PHASES

# PHASE 0 — FOUNDATION AND PROJECT DEFINITION

Goal:

Menetapkan fondasi repository, arsitektur, environment, dan aturan pengembangan.

---

## Phase 0.1 — Repository Initialization

Tasks:

- initialize Git repository,
- initialize Astro,
- create project structure,
- configure TypeScript,
- configure formatter,
- configure linter,
- create `.env.example`,
- create README.

Acceptance Criteria:

- Astro dapat dijalankan secara lokal,
- project memiliki struktur source yang jelas,
- tidak ada secret di repository.

---

## Phase 0.2 — Cloudflare Environment

Tasks:

- create Cloudflare Pages project,
- create R2 bucket,
- create D1 database,
- configure Worker,
- configure environment bindings.

Acceptance Criteria:

- frontend dapat deploy,
- Worker dapat membaca D1,
- Worker dapat mengakses R2.

---

## Phase 0.3 — Architecture Baseline

Create folders:

```text
src/
├── components/
├── layouts/
├── pages/
├── lib/
├── services/
├── styles/
└── types/

worker/
├── routes/
├── services/
├── middleware/
└── utils/

db/
├── migrations/
└── seed/
```

Acceptance Criteria:

- public frontend dan backend logic terpisah,
- schema migration tersedia,
- environment binding terdokumentasi.

---

# PHASE 1 — DATA AND STORAGE FOUNDATION

Goal:

Membangun fondasi metadata dan asset storage.

---

## Phase 1.1 — D1 Schema

Implement:

- wallpapers,
- categories,
- tags,
- wallpaper_tags.

Acceptance Criteria:

- migration berhasil,
- seed category dapat dijalankan,
- foreign key relationship valid.

---

## Phase 1.2 — R2 Asset Structure

Implement folder/key convention:

```text
original/{id}/original.ext
preview/{id}/480.avif
preview/{id}/960.avif
preview/{id}/1600.avif
preview/{id}/fallback.webp
```

Acceptance Criteria:

- file dapat diupload,
- file dapat dibaca,
- preview dan original tidak tercampur.

---

## Phase 1.3 — Metadata Utilities

Implement:

- dimension detection,
- aspect ratio,
- orientation,
- MIME type,
- file size,
- hash,
- slug.

Acceptance Criteria:

Input image menghasilkan metadata yang benar dan konsisten.

---

# PHASE 2 — ADMIN MVP

Goal:

Menyediakan workflow internal untuk memasukkan wallpaper tanpa manipulasi database manual.

---

## Phase 2.1 — Admin Authentication

Implement:

- admin login,
- authenticated session,
- protected route,
- logout.

Acceptance Criteria:

- anonymous visitor tidak dapat membuka admin,
- authenticated admin dapat membuka dashboard,
- session invalid tidak diterima.

---

## Phase 2.2 — Admin Dashboard

Implement:

- total wallpapers,
- draft count,
- published count,
- download count,
- latest uploads.

Acceptance Criteria:

Dashboard membaca data aktual dari D1.

---

## Phase 2.3 — Create Wallpaper Form

Implement fields:

- title,
- slug,
- description,
- category,
- tags,
- original upload,
- preview upload,
- publish status,
- featured.

Acceptance Criteria:

Admin dapat membuat satu wallpaper lengkap dari UI.

---

## Phase 2.4 — Original Upload

Implement:

- type validation,
- size validation,
- metadata extraction,
- hash generation,
- R2 upload.

Acceptance Criteria:

- original disimpan tanpa re-encoding,
- R2 key tersimpan di D1,
- duplicate hash dapat terdeteksi.

---

## Phase 2.5 — Preview Pipeline

Implement:

- preview asset creation or validated upload,
- 480,
- 960,
- 1600,
- fallback WebP.

Acceptance Criteria:

Public website tidak membutuhkan original untuk gallery.

---

## Phase 2.6 — Edit Wallpaper

Implement:

- metadata edit,
- category edit,
- tag edit,
- draft/publish,
- featured toggle.

Acceptance Criteria:

Edit metadata tidak mengubah original object.

---

## Phase 2.7 — Delete Wallpaper

Implement:

- confirmation modal,
- delete metadata,
- delete R2 preview,
- delete R2 original.

Acceptance Criteria:

Wallpaper yang dihapus tidak dapat diakses publik dan tidak meninggalkan orphan assets.

---

# PHASE 3 — PUBLIC WEBSITE MVP

Goal:

Membuat pengalaman browsing wallpaper lengkap.

---

## Phase 3.1 — Global Layout

Implement:

- navigation,
- responsive container,
- typography,
- footer,
- global color system.

Acceptance Criteria:

Layout konsisten pada mobile dan desktop.

---

## Phase 3.2 — Homepage

Implement:

- hero/featured,
- latest,
- popular,
- categories.

Acceptance Criteria:

Homepage menggunakan data D1 aktual.

---

## Phase 3.3 — Wallpaper Card

Implement:

- optimized preview,
- title,
- hover,
- responsive behavior.

Acceptance Criteria:

Tidak ada original asset yang dimuat di gallery.

---

## Phase 3.4 — Explore Page

Implement:

- responsive grid,
- pagination,
- sort.

Acceptance Criteria:

User dapat menjelajah seluruh koleksi tanpa reload asset besar yang tidak perlu.

---

## Phase 3.5 — Wallpaper Detail

Implement:

- large preview,
- metadata,
- categories,
- tags,
- resolution,
- file size,
- related section,
- download button.

Acceptance Criteria:

Detail sesuai dengan metadata di D1.

---

# PHASE 4 — DOWNLOAD SYSTEM

Goal:

Menyediakan download original yang aman dan terukur.

---

## Phase 4.1 — Download Endpoint

Implement:

```text
POST /api/wallpapers/:id/download
```

Flow:

- validate ID,
- verify published,
- get original object,
- increment count,
- return download response.

Acceptance Criteria:

User menerima object original.

---

## Phase 4.2 — Filename Handling

Generate human-readable filename.

Example:

```text
misty-alpine-impasto-4k.jpg
```

Acceptance Criteria:

Filename valid dan tidak mengandung unsafe characters.

---

## Phase 4.3 — Download Integrity Test

Test:

- upload file,
- calculate source SHA-256,
- download file,
- calculate downloaded SHA-256,
- compare hash.

Acceptance Criteria:

```text
source_hash == downloaded_hash
```

This is the key acceptance test for original file integrity.

---

# PHASE 5 — DISCOVERY SYSTEM

Goal:

Mempermudah user menemukan wallpaper.

---

## Phase 5.1 — Category Browsing

Implement:

```text
/category/[slug]
```

Acceptance Criteria:

Category hanya menampilkan wallpaper terkait.

---

## Phase 5.2 — Tags

Implement:

```text
/tag/[slug]
```

Acceptance Criteria:

Tag relation sesuai database.

---

## Phase 5.3 — Search

Implement:

- query field,
- title search,
- description search,
- tag match.

Acceptance Criteria:

Relevant matching wallpaper muncul pada result.

---

## Phase 5.4 — Filters

Implement:

- portrait,
- landscape,
- square,
- resolution class,
- category.

Acceptance Criteria:

Filter dapat dikombinasikan.

---

## Phase 5.5 — Sorting

Implement:

- newest,
- popular,
- featured.

Acceptance Criteria:

Sort menghasilkan urutan data yang konsisten.

---

# PHASE 6 — PERFORMANCE AND CDN

Goal:

Mengoptimalkan loading dan delivery asset.

---

## Phase 6.1 — Custom R2 Domain

Configure:

```text
cdn.example.com
```

Acceptance Criteria:

Asset dapat diakses melalui custom domain.

---

## Phase 6.2 — Cache Headers

Configure immutable cache for versioned image assets.

Acceptance Criteria:

Repeated requests dapat dilayani melalui cache sesuai policy.

---

## Phase 6.3 — Responsive Images

Implement:

- srcset,
- sizes,
- AVIF,
- WebP fallback.

Acceptance Criteria:

Browser tidak selalu mengambil preview 1600px untuk card kecil.

---

## Phase 6.4 — Lazy Loading

Acceptance Criteria:

Below-the-fold wallpaper tidak langsung dimuat pada initial page load.

---

## Phase 6.5 — Performance Audit

Audit:

- unused JS,
- image weight,
- layout shift,
- request waterfall.

Acceptance Criteria:

Tidak ada original wallpaper dalam normal gallery loading path.

---

# PHASE 7 — SEO AND SHAREABILITY

Goal:

Membuat wallpaper dapat ditemukan melalui search engine dan dibagikan dengan baik.

---

## Phase 7.1 — Metadata

Implement per wallpaper:

- title,
- description,
- canonical,
- Open Graph,
- social preview.

---

## Phase 7.2 — Sitemap

Generate:

```text
/sitemap.xml
```

Include:

- wallpaper pages,
- category pages,
- static public pages.

---

## Phase 7.3 — Robots

Implement:

```text
/robots.txt
```

Admin routes excluded from indexing.

---

## Phase 7.4 — Structured Metadata

Add appropriate structured metadata when applicable.

Acceptance Criteria:

No duplicate canonical URL and no missing page title.

---

# PHASE 8 — SECURITY AND HARDENING

Goal:

Memastikan admin, upload, dan API tidak mudah disalahgunakan.

---

## Phase 8.1 — Validation

Server validation for:

- ID,
- slug,
- file type,
- file size,
- metadata fields.

---

## Phase 8.2 — API Authorization

Ensure:

- public route read-only,
- admin mutation requires auth.

---

## Phase 8.3 — Upload Security

Validate:

- MIME,
- extension,
- file signature where implementation supports it.

Do not trust extension only.

---

## Phase 8.4 — Rate Limiting

Apply where needed:

- login,
- download API,
- admin mutation.

Acceptance Criteria:

Normal user flow remains unaffected.

---

## Phase 8.5 — Secret Management

Ensure:

- secrets stored in Cloudflare environment,
- secrets absent from frontend,
- `.env` ignored by Git.

---

# PHASE 9 — ANALYTICS AND OBSERVABILITY

Goal:

Mengetahui performa katalog tanpa membangun sistem analytics yang berlebihan.

---

## Phase 9.1 — Download Metrics

Implement:

- aggregate download count,
- most downloaded wallpapers.

---

## Phase 9.2 — Operational Logs

Log:

- failed upload,
- failed download,
- missing R2 object,
- API error.

---

## Phase 9.3 — Admin Analytics

Dashboard:

- total downloads,
- top wallpapers,
- newest wallpapers.

---

# PHASE 10 — TESTING AND QUALITY ASSURANCE

Goal:

Menjamin fitur utama tidak rusak saat deployment.

---

## Phase 10.1 — Unit Tests

Test:

- slug,
- orientation,
- aspect ratio,
- metadata validator,
- filename sanitizer.

---

## Phase 10.2 — Integration Tests

Test:

- D1 + Worker,
- Worker + R2,
- CRUD,
- download.

---

## Phase 10.3 — End-to-End Tests

Flows:

### Public

```text
Homepage
→ Explore
→ Detail
→ Download
```

### Admin

```text
Login
→ Upload
→ Publish
→ Edit
→ Delete
```

---

## Phase 10.4 — Cross-Browser QA

Test at minimum:

- Chrome,
- Safari,
- Firefox,
- Chromium mobile browser,
- Safari mobile if available.

---

# PHASE 11 — PRODUCTION RELEASE

Goal:

Meluncurkan MVP stabil.

---

## Phase 11.1 — Production Infrastructure

Configure:

- production D1,
- production R2,
- production Pages,
- production Worker,
- DNS,
- HTTPS.

---

## Phase 11.2 — Seed Initial Content

Recommended initial launch content:

- multiple categories,
- mix of portrait and landscape,
- sufficient wallpapers to make Explore useful.

No fixed minimum count is required by the architecture.

---

## Phase 11.3 — Final Verification

Checklist:

- admin protected,
- homepage functional,
- gallery optimized,
- original download verified by hash,
- mobile responsive,
- sitemap valid,
- 404 works,
- no development secrets exposed.

---

## Phase 11.4 — Launch

Production becomes public.

---

# PHASE 12 — POST-MVP IMPROVEMENTS

Not required for first launch.

---

## Phase 12.1 — Favorites

Requires user identity.

Functions:

- favorite wallpaper,
- remove favorite,
- favorites page.

---

## Phase 12.2 — Collections

User can organize favorites.

Example:

```text
OLED
Nature
iPhone
Desktop
Painting
```

---

## Phase 12.3 — User Accounts

Possible capabilities:

- login,
- profile,
- favorite sync,
- collections,
- history.

---

## Phase 12.4 — Personalized Recommendations

Start rule-based before machine learning.

Signals:

- tags,
- categories,
- orientation,
- favorites.

---

## Phase 12.5 — Editorial Collections

Admin-created curated collection.

Examples:

```text
Midnight Architecture
Impasto Landscapes
AMOLED Black
Golden Hour
Monochrome
```

---

## Phase 12.6 — Device-Aware Downloads

Allow user to select:

- original,
- desktop crop,
- mobile crop.

Important:

Original option must remain available and untouched.

Derived variants must be clearly distinguished from original.

---

# 28. IMPLEMENTATION PRIORITY

## P0 — Required for MVP

- Astro frontend
- Cloudflare Pages
- D1
- R2
- Worker API
- admin auth
- admin upload
- metadata
- preview/original separation
- homepage
- explore
- detail
- download original
- categories
- tags
- basic search
- responsive layout
- SEO basics
- security validation

## P1 — Strongly Recommended

- related wallpapers
- filters
- popular sort
- analytics
- duplicate hash detection
- custom R2 domain
- structured data
- automated preview pipeline

## P2 — Post-MVP

- user accounts
- favorites
- collections
- recommendation system
- device-specific generated variants
- advanced analytics

---

# 29. MVP DEFINITION OF DONE

MVP dianggap selesai jika seluruh kondisi berikut terpenuhi:

1. Admin dapat login.
2. Admin dapat upload original wallpaper.
3. Original tersimpan di R2 tanpa re-encoding.
4. Preview disimpan terpisah.
5. Metadata tersimpan di D1.
6. Admin dapat publish wallpaper.
7. Wallpaper muncul di homepage/explore.
8. User dapat membuka detail.
9. User dapat mencari wallpaper.
10. User dapat filter minimal berdasarkan category dan orientation.
11. User dapat mengunduh original.
12. Hash source dan downloaded file identik pada integrity test.
13. Download count tercatat.
14. Public gallery tidak memuat original asset.
15. Website responsive.
16. Admin route terlindungi.
17. Asset dan API tidak mengekspos secret.
18. Production deployment berjalan di Cloudflare.
19. Sitemap tersedia.
20. Tidak terdapat critical error pada primary user flows.

---

# 30. RECOMMENDED DEVELOPMENT ORDER

```text
Phase 0
  ↓
Phase 1
  ↓
Phase 2
  ↓
Phase 3
  ↓
Phase 4
  ↓
Phase 5
  ↓
Phase 6
  ↓
Phase 7
  ↓
Phase 8
  ↓
Phase 9
  ↓
Phase 10
  ↓
Phase 11
```

Post-MVP:

```text
Phase 12+
```

---

# 31. FINAL SYSTEM FLOW

```text
ADMIN
  │
  ├── Upload original
  │        │
  │        ▼
  │       R2 original
  │
  ├── Generate/upload preview
  │        │
  │        ▼
  │       R2 preview
  │
  └── Metadata
           │
           ▼
          D1
           │
           ▼

PUBLIC USER
     │
     ▼
    Astro
     │
     ├── Gallery ────────────> R2 Preview
     │
     ├── Metadata ───────────> D1
     │
     └── Download
             │
             ▼
           Worker
             │
             ├── Increment metric → D1
             │
             └── Original asset → R2
                                  │
                                  ▼
                            User Download
```

---

# 32. CORE TECHNICAL RULES

These rules should remain fixed unless architecture is intentionally redesigned.

1. **Never use original R2 asset as a gallery thumbnail.**
2. **Never re-encode original during download.**
3. **Preview and original must use different R2 object keys.**
4. **Public frontend must not contain storage credentials.**
5. **Technical metadata should be generated automatically where possible.**
6. **Download integrity must be verifiable through file hashing.**
7. **Admin mutation endpoints require authentication.**
8. **Published state in D1 determines public visibility.**
9. **Deleted wallpaper should not leave orphan objects.**
10. **Original file is the canonical downloadable asset.**
