import { describe, it, expect } from 'vitest';
import { DBService, type ListWallpaperFilters } from '../../worker/services/db.service';

describe('DBService Query Logic & Mapper Tests', () => {
  it('fetches one tag by slug without loading the complete tag index', async () => {
    let sql = '';
    let binding = '';
    const db = {
      prepare(statement: string) {
        sql = statement;
        return {
          bind(value: string) {
            binding = value;
            return {
              async first() {
                return { id: 'tag_night', slug: 'night', name: 'Night', createdAt: '2026-01-01' };
              },
            };
          },
        };
      },
    } as unknown as D1Database;

    await expect(DBService.getTagBySlug(db, 'night')).resolves.toMatchObject({ slug: 'night' });
    expect(sql).toContain('WHERE slug = ?');
    expect(binding).toBe('night');
  });

  it('returns null for an empty or unknown tag slug', async () => {
    let preparations = 0;
    const db = {
      prepare() {
        preparations += 1;
        return { bind() { return { async first() { return null; } }; } };
      },
    } as unknown as D1Database;

    await expect(DBService.getTagBySlug(db, '')).resolves.toBeNull();
    await expect(DBService.getTagBySlug(db, 'missing')).resolves.toBeNull();
    expect(preparations).toBe(1);
  });

  it('maps an alphabetical category index with published counts and newest covers', async () => {
    let query = '';
    const coverRow = {
      taxonomy_id: 'cat_architecture', taxonomy_slug: 'architecture', taxonomy_name: 'Architecture',
      taxonomy_description: 'Structures', taxonomy_created_at: '2026-01-01T00:00:00Z',
      taxonomy_updated_at: '2026-01-02T00:00:00Z', published_count: 2,
      id: 'wp_cover', slug: 'newest-building', title: 'Newest Building', description: null,
      category_id: 'cat_architecture', width: 3840, height: 2160, aspect_ratio: 1.78,
      orientation: 'landscape', format: 'jpg', mime_type: 'image/jpeg', file_size: 100,
      resolution_label: '4K', original_r2_key: 'original/wp_cover/original.jpg',
      preview_480_key: 'preview/wp_cover/480.avif', preview_960_key: 'preview/wp_cover/960.avif',
      preview_1600_key: null, preview_fallback_key: 'preview/wp_cover/fallback.webp',
      file_hash: null, creator: null, source_provenance: null, source_provider: null,
      source_external_id: null, source_url: null, creator_url: null, license_note: null,
      status: 'published', is_featured: 0, download_count: 0,
      created_at: '2026-02-02T00:00:00Z', updated_at: '2026-02-02T00:00:00Z', published_at: null,
    };
    const emptyRow = {
      taxonomy_id: 'cat_dark', taxonomy_slug: 'dark', taxonomy_name: 'Dark',
      taxonomy_description: null, taxonomy_created_at: '2026-01-01T00:00:00Z',
      taxonomy_updated_at: '2026-01-02T00:00:00Z', published_count: null, id: null,
    };
    const db = {
      prepare(sql: string) {
        query = sql;
        return { async all() { return { results: [coverRow, emptyRow] }; } };
      },
    } as unknown as D1Database;

    const records = await DBService.getCategoryIndexRecords(db);

    expect(query).toContain('ROW_NUMBER() OVER');
    expect(query).toContain("WHERE w.status = 'published'");
    expect(query).toContain('ORDER BY c.name ASC');
    expect(records[0]).toMatchObject({
      category: { slug: 'architecture', name: 'Architecture' },
      count: 2,
      cover: { id: 'wp_cover', slug: 'newest-building' },
    });
    expect(records[1]).toMatchObject({ category: { slug: 'dark' }, count: 0, cover: null });
  });

  it('maps raw database snake_case row to Wallpaper camelCase domain object correctly', () => {
    const mockRow = {
      id: 'wp_1',
      slug: 'misty-alpine',
      title: 'Misty Alpine',
      description: 'Mountain artwork',
      category_id: 'cat_nature',
      width: 3840,
      height: 2160,
      aspect_ratio: 1.78,
      orientation: 'landscape',
      format: 'jpg',
      mime_type: 'image/jpeg',
      file_size: 5242880,
      resolution_label: '4K',
      original_r2_key: 'original/wp_1/original.jpg',
      preview_480_key: 'preview/wp_1/480.avif',
      preview_960_key: 'preview/wp_1/960.avif',
      preview_1600_key: 'preview/wp_1/1600.avif',
      preview_fallback_key: 'preview/wp_1/fallback.webp',
      file_hash: 'abc123hash',
      creator: 'Elysium Artist',
      source_provenance: 'Original Commission',
      source_provider: 'pixabay',
      source_external_id: '12345',
      source_url: 'https://pixabay.com/photos/example-12345/',
      creator_url: 'https://pixabay.com/users/example-1/',
      license_note: 'Standard License',
      status: 'published',
      is_featured: 1,
      download_count: 42,
      created_at: '2026-08-09T00:00:00Z',
      updated_at: '2026-08-09T00:00:00Z',
      published_at: '2026-08-09T00:00:00Z',
    };

    const wallpaper = (DBService as any).mapWallpaperRow(mockRow);

    expect(wallpaper.id).toBe('wp_1');
    expect(wallpaper.slug).toBe('misty-alpine');
    expect(wallpaper.categoryId).toBe('cat_nature');
    expect(wallpaper.aspectRatio).toBe(1.78);
    expect(wallpaper.isFeatured).toBe(true);
    expect(wallpaper.downloadCount).toBe(42);
    expect(wallpaper.originalR2Key).toBe('original/wp_1/original.jpg');
    expect(wallpaper.preview1600Key).toBe('preview/wp_1/1600.avif');
    expect(wallpaper.sourceProvider).toBe('pixabay');
    expect(wallpaper.sourceExternalId).toBe('12345');
  });

  it('validates filter parameters gracefully', async () => {
    const mockDb = {
      prepare: (sql: string) => ({
        bind: (...args: any[]) => ({
          first: async () => ({ total: 0 }),
          all: async () => ({ results: [] }),
        }),
      }),
    } as any;

    const filters: ListWallpaperFilters = {
      page: -1,
      limit: 500,
      status: 'published',
      orientation: 'landscape',
      searchQuery: 'alpine',
      sortBy: 'popular',
    };

    const result = await DBService.listWallpapers(mockDb, filters);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(50);
    expect(result.wallpapers).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('supports a 100-character literal search without SQLite LIKE patterns', async () => {
    const query = 'x'.repeat(100);
    const prepared: Array<{ sql: string; values: unknown[] }> = [];
    const mockDb = {
      prepare: (sql: string) => ({
        bind: (...values: unknown[]) => {
          prepared.push({ sql, values });
          return {
            first: async () => ({ total: 0 }),
            all: async () => ({ results: [] }),
          };
        },
      }),
    } as any;

    await DBService.listWallpapers(mockDb, { searchQuery: query, status: 'published' });

    expect(prepared).toHaveLength(2);
    expect(prepared[0].sql).toContain('instr(lower(w.title), lower(?))');
    expect(prepared[0].sql).not.toContain(' LIKE ');
    expect(prepared[0].values.slice(1, 5)).toEqual([query, query, query, query]);
  });

  it('keeps wallpaper insert placeholders aligned with bound values', async () => {
    const db = {
      prepare: (sql: string) => ({
        bind: (...values: unknown[]) => {
          expect(values).toHaveLength((sql.match(/\?/g) || []).length);
          return { sql, values };
        },
      }),
      batch: async () => [],
    } as unknown as D1Database;
    await DBService.createWallpaper(db, {
      id: 'wp_test', slug: 'test', title: 'Test', width: 3840, height: 2160,
      aspectRatio: 1.78, orientation: 'landscape', format: 'jpg', mimeType: 'image/jpeg',
      fileSize: 100, originalR2Key: 'original/wp_test/original.jpg', status: 'draft',
      isFeatured: false, downloadCount: 0, createdAt: '', updatedAt: '',
      sourceProvider: 'pixabay', sourceExternalId: '99',
    });
  });
});
