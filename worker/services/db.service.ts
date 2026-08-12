import type { Wallpaper, Category, Tag, OrientationType, WallpaperStatus } from '@/types';

export interface ListWallpaperFilters {
  page?: number;
  limit?: number;
  categorySlug?: string;
  tagSlug?: string;
  orientation?: OrientationType;
  resolutionLabel?: string;
  status?: WallpaperStatus;
  isFeatured?: boolean;
  searchQuery?: string;
  sortBy?: 'newest' | 'popular' | 'featured';
}

export interface ListWallpaperResult {
  wallpapers: Wallpaper[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CategoryIndexRecord {
  category: Category;
  count: number;
  cover: Wallpaper | null;
}

type DatabaseRow = Record<string, unknown>;

function optionalDatabaseString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export interface WallpaperUpdate {
  title: string;
  description: string | null;
  categoryId: string | null;
  status: WallpaperStatus;
  isFeatured: boolean;
  creator: string | null;
  sourceProvenance: string | null;
  licenseNote: string | null;
  tagIds?: string[];
}

export class DBService {
  /**
   * Fetches all public categories.
   */
  static async getCategories(db: D1Database): Promise<Category[]> {
    const { results } = await db
      .prepare('SELECT id, slug, name, description, created_at as createdAt, updated_at as updatedAt FROM categories ORDER BY name ASC')
      .all<Category>();

    return results || [];
  }

  static async getCategoriesWithPublishedCounts(db: D1Database): Promise<Array<Category & { count: number }>> {
    const { results } = await db.prepare(`
      SELECT c.id, c.slug, c.name, c.description,
        c.created_at as createdAt, c.updated_at as updatedAt,
        COUNT(w.id) as count
      FROM categories c
      LEFT JOIN wallpapers w ON w.category_id = c.id AND w.status = 'published'
      GROUP BY c.id
      ORDER BY c.name ASC
    `).all<Category & { count: number }>();
    return results || [];
  }

  static async getCategoryIndexRecords(db: D1Database): Promise<CategoryIndexRecord[]> {
    const { results } = await db.prepare(`
      WITH ranked_wallpapers AS (
        SELECT w.*,
          ROW_NUMBER() OVER (
            PARTITION BY w.category_id
            ORDER BY COALESCE(w.published_at, w.created_at) DESC, w.created_at DESC, w.id DESC
          ) AS cover_rank,
          COUNT(*) OVER (PARTITION BY w.category_id) AS published_count
        FROM wallpapers w
        WHERE w.status = 'published'
      )
      SELECT
        c.id AS taxonomy_id,
        c.slug AS taxonomy_slug,
        c.name AS taxonomy_name,
        c.description AS taxonomy_description,
        c.created_at AS taxonomy_created_at,
        c.updated_at AS taxonomy_updated_at,
        rw.*
      FROM categories c
      LEFT JOIN ranked_wallpapers rw
        ON rw.category_id = c.id AND rw.cover_rank = 1
      ORDER BY c.name ASC
    `).all<DatabaseRow>();

    return (results || []).map((row) => ({
      category: {
        id: String(row.taxonomy_id),
        slug: String(row.taxonomy_slug),
        name: String(row.taxonomy_name),
        description: optionalDatabaseString(row.taxonomy_description),
        createdAt: String(row.taxonomy_created_at),
        updatedAt: String(row.taxonomy_updated_at),
      },
      count: Number(row.published_count) || 0,
      cover: row.id ? this.mapWallpaperRow(row) : null,
    }));
  }

  /**
   * Fetches a single category by slug.
   */
  static async getCategoryBySlug(db: D1Database, slug: string): Promise<Category | null> {
    if (!slug) return null;
    const result = await db
      .prepare('SELECT id, slug, name, description, created_at as createdAt, updated_at as updatedAt FROM categories WHERE slug = ?')
      .bind(slug)
      .first<Category>();

    return result || null;
  }

  static async getCategoryById(db: D1Database, id: string): Promise<Category | null> {
    if (!id) return null;
    const result = await db
      .prepare('SELECT id, slug, name, description, created_at as createdAt, updated_at as updatedAt FROM categories WHERE id = ?')
      .bind(id)
      .first<Category>();
    return result || null;
  }

  /**
   * Creates a new category.
   */
  static async createCategory(
    db: D1Database,
    category: { id: string; slug: string; name: string; description?: string }
  ): Promise<Category> {
    const now = new Date().toISOString();
    await db
      .prepare('INSERT INTO categories (id, slug, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(category.id, category.slug, category.name, category.description || null, now, now)
      .run();

    return {
      id: category.id,
      slug: category.slug,
      name: category.name,
      description: category.description,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Fetches all tags.
   */
  static async getTags(db: D1Database): Promise<Tag[]> {
    const { results } = await db
      .prepare('SELECT id, slug, name, created_at as createdAt FROM tags ORDER BY name ASC')
      .all<Tag>();

    return results || [];
  }

  static async getTagBySlug(db: D1Database, slug: string): Promise<Tag | null> {
    if (!slug) return null;
    const result = await db
      .prepare('SELECT id, slug, name, created_at as createdAt FROM tags WHERE slug = ?')
      .bind(slug)
      .first<Tag>();

    return result || null;
  }

  /**
   * Fetches tags associated with a specific wallpaper.
   */
  static async getTagsByWallpaperId(db: D1Database, wallpaperId: string): Promise<Tag[]> {
    if (!wallpaperId) return [];
    const { results } = await db
      .prepare(`
        SELECT t.id, t.slug, t.name, t.created_at as createdAt
        FROM tags t
        JOIN wallpaper_tags wt ON t.id = wt.tag_id
        WHERE wt.wallpaper_id = ?
        ORDER BY t.name ASC
      `)
      .bind(wallpaperId)
      .all<Tag>();

    return results || [];
  }

  /**
   * Creates a tag if it does not exist.
   */
  static async createTag(db: D1Database, tag: { id: string; slug: string; name: string }): Promise<Tag> {
    const now = new Date().toISOString();
    await db
      .prepare('INSERT OR IGNORE INTO tags (id, slug, name, created_at) VALUES (?, ?, ?, ?)')
      .bind(tag.id, tag.slug, tag.name, now)
      .run();

    const canonical = await db.prepare(
      'SELECT id, slug, name, created_at as createdAt FROM tags WHERE slug = ? OR lower(name) = lower(?) LIMIT 1'
    ).bind(tag.slug, tag.name).first<Tag>();
    if (!canonical) throw new Error('Tag could not be created');
    return canonical;
  }

  /**
   * Checks if an identical original file hash already exists in database.
   */
  static async checkDuplicateHash(db: D1Database, fileHash: string): Promise<Wallpaper | null> {
    if (!fileHash) return null;

    const result = await db
      .prepare('SELECT * FROM wallpapers WHERE file_hash = ? LIMIT 1')
      .bind(fileHash)
      .first<DatabaseRow>();

    if (!result) return null;
    return this.mapWallpaperRow(result);
  }

  static async checkExternalSource(
    db: D1Database,
    provider: string,
    externalId: string
  ): Promise<Wallpaper | null> {
    if (!provider || !externalId) return null;
    const result = await db
      .prepare('SELECT * FROM wallpapers WHERE source_provider = ? AND source_external_id = ? LIMIT 1')
      .bind(provider, externalId)
      .first<DatabaseRow>();
    return result ? this.mapWallpaperRow(result) : null;
  }

  /**
   * Fetches wallpaper record by ID.
   */
  static async getWallpaperById(db: D1Database, id: string): Promise<Wallpaper | null> {
    if (!id) return null;
    const result = await db
      .prepare('SELECT * FROM wallpapers WHERE id = ?')
      .bind(id)
      .first<DatabaseRow>();

    if (!result) return null;
    return this.mapWallpaperRow(result);
  }

  /**
   * Fetches wallpaper record by slug.
   */
  static async getWallpaperBySlug(db: D1Database, slug: string): Promise<Wallpaper | null> {
    if (!slug) return null;
    const result = await db
      .prepare('SELECT * FROM wallpapers WHERE slug = ?')
      .bind(slug)
      .first<DatabaseRow>();

    if (!result) return null;
    return this.mapWallpaperRow(result);
  }

  /**
   * Dynamic wallpaper listing engine with filters, sorting, and pagination.
   */
  static async listWallpapers(db: D1Database, filters: ListWallpaperFilters = {}): Promise<ListWallpaperResult> {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(50, Math.max(1, filters.limit || 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const bindings: unknown[] = [];

    if (filters.status) {
      conditions.push('w.status = ?');
      bindings.push(filters.status);
    }

    if (filters.orientation) {
      conditions.push('w.orientation = ?');
      bindings.push(filters.orientation);
    }

    if (filters.resolutionLabel) {
      conditions.push('w.resolution_label = ?');
      bindings.push(filters.resolutionLabel);
    }

    if (filters.isFeatured !== undefined) {
      conditions.push('w.is_featured = ?');
      bindings.push(filters.isFeatured ? 1 : 0);
    }

    if (filters.categorySlug) {
      conditions.push('w.category_id IN (SELECT id FROM categories WHERE slug = ?)');
      bindings.push(filters.categorySlug);
    }

    if (filters.tagSlug) {
      conditions.push('w.id IN (SELECT wallpaper_id FROM wallpaper_tags wt JOIN tags t ON wt.tag_id = t.id WHERE t.slug = ?)');
      bindings.push(filters.tagSlug);
    }

    if (filters.searchQuery && filters.searchQuery.trim()) {
      const term = filters.searchQuery.trim();
      conditions.push("(instr(lower(w.title), lower(?)) > 0 OR instr(lower(COALESCE(w.description, '')), lower(?)) > 0 OR w.id IN (SELECT wt.wallpaper_id FROM wallpaper_tags wt JOIN tags t ON wt.tag_id = t.id WHERE instr(lower(t.name), lower(?)) > 0 OR instr(lower(t.slug), lower(?)) > 0))");
      bindings.push(term, term, term, term);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    let orderByClause = 'ORDER BY w.created_at DESC';
    if (filters.sortBy === 'popular') {
      orderByClause = 'ORDER BY w.download_count DESC, w.created_at DESC';
    } else if (filters.sortBy === 'featured') {
      orderByClause = 'ORDER BY w.is_featured DESC, w.created_at DESC';
    }

    // Query 1: Total Count
    const countSql = `SELECT COUNT(*) as total FROM wallpapers w ${whereClause}`;
    const countResult = await db.prepare(countSql).bind(...bindings).first<{ total: number }>();
    const total = countResult?.total || 0;

    // Query 2: Page Data
    const dataSql = `SELECT w.* FROM wallpapers w ${whereClause} ${orderByClause} LIMIT ? OFFSET ?`;
    const { results } = await db
      .prepare(dataSql)
      .bind(...bindings, limit, offset)
      .all<DatabaseRow>();

    const wallpapers = (results || []).map(r => this.mapWallpaperRow(r));
    const totalPages = Math.ceil(total / limit) || 1;

    return { wallpapers, total, page, limit, totalPages };
  }

  /**
   * Transactional creation of wallpaper and associated tag relations.
   */
  static async createWallpaper(db: D1Database, wallpaper: Wallpaper, tagIds: string[] = []): Promise<Wallpaper> {
    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [];

    statements.push(
      db.prepare(`
        INSERT INTO wallpapers (
          id, slug, title, description, category_id,
          width, height, aspect_ratio, orientation,
          format, mime_type, file_size, resolution_label,
          original_r2_key, preview_480_key, preview_960_key, preview_1600_key, preview_fallback_key,
          file_hash, creator, source_provenance, source_provider, source_external_id,
          source_url, creator_url, license_note,
          status, is_featured, download_count, created_at, updated_at, published_at
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?
        )
      `).bind(
        wallpaper.id, wallpaper.slug, wallpaper.title, wallpaper.description || null, wallpaper.categoryId || null,
        wallpaper.width, wallpaper.height, wallpaper.aspectRatio, wallpaper.orientation,
        wallpaper.format, wallpaper.mimeType, wallpaper.fileSize, wallpaper.resolutionLabel || null,
        wallpaper.originalR2Key, wallpaper.preview480Key || null, wallpaper.preview960Key || null, wallpaper.preview1600Key || null, wallpaper.previewFallbackKey || null,
        wallpaper.fileHash || null, wallpaper.creator || null, wallpaper.sourceProvenance || null,
        wallpaper.sourceProvider || null, wallpaper.sourceExternalId || null,
        wallpaper.sourceUrl || null, wallpaper.creatorUrl || null, wallpaper.licenseNote || null,
        wallpaper.status || 'draft', wallpaper.isFeatured ? 1 : 0, wallpaper.downloadCount || 0, now, now, wallpaper.publishedAt || null
      )
    );

    for (const tagId of tagIds) {
      statements.push(
        db.prepare('INSERT OR IGNORE INTO wallpaper_tags (wallpaper_id, tag_id) VALUES (?, ?)').bind(wallpaper.id, tagId)
      );
    }

    await db.batch(statements);
    return { ...wallpaper, createdAt: now, updatedAt: now };
  }

  /**
   * Transactional deletion of a wallpaper and its relations.
   */
  static async deleteWallpaper(db: D1Database, wallpaperId: string): Promise<boolean> {
    if (!wallpaperId) return false;

    const statements: D1PreparedStatement[] = [
      db.prepare('DELETE FROM wallpaper_tags WHERE wallpaper_id = ?').bind(wallpaperId),
      db.prepare('DELETE FROM download_events WHERE wallpaper_id = ?').bind(wallpaperId),
      db.prepare('DELETE FROM wallpapers WHERE id = ?').bind(wallpaperId),
    ];

    await db.batch(statements);
    return true;
  }

  static async bulkSetStatus(
    db: D1Database,
    wallpaperIds: string[],
    status: WallpaperStatus
  ): Promise<void> {
    const now = new Date().toISOString();
    const statements = wallpaperIds.map((id) => db
      .prepare(`UPDATE wallpapers SET status = ?, published_at = CASE
        WHEN ? = 'published' THEN COALESCE(published_at, ?)
        ELSE NULL END, updated_at = ? WHERE id = ?`)
      .bind(status, status, now, now, id));
    if (statements.length > 0) await db.batch(statements);
  }

  static async bulkSetCategory(
    db: D1Database,
    wallpaperIds: string[],
    categoryId: string | null
  ): Promise<void> {
    const now = new Date().toISOString();
    const statements = wallpaperIds.map((id) => db
      .prepare('UPDATE wallpapers SET category_id = ?, updated_at = ? WHERE id = ?')
      .bind(categoryId, now, id));
    if (statements.length > 0) await db.batch(statements);
  }

  static async bulkUpdateTag(
    db: D1Database,
    wallpaperIds: string[],
    tagId: string,
    operation: 'add' | 'remove'
  ): Promise<void> {
    const sql = operation === 'add'
      ? 'INSERT OR IGNORE INTO wallpaper_tags (wallpaper_id, tag_id) VALUES (?, ?)'
      : 'DELETE FROM wallpaper_tags WHERE wallpaper_id = ? AND tag_id = ?';
    const statements = wallpaperIds.map((id) => db.prepare(sql).bind(id, tagId));
    if (statements.length > 0) await db.batch(statements);
  }

  static async setWallpaperTags(db: D1Database, wallpaperId: string, tagIds: string[]): Promise<void> {
    const statements: D1PreparedStatement[] = [
      db.prepare('DELETE FROM wallpaper_tags WHERE wallpaper_id = ?').bind(wallpaperId),
      ...tagIds.map((tagId) => db
        .prepare('INSERT OR IGNORE INTO wallpaper_tags (wallpaper_id, tag_id) VALUES (?, ?)')
        .bind(wallpaperId, tagId)),
    ];
    await db.batch(statements);
  }

  static async updateWallpaperAtomic(
    db: D1Database,
    wallpaperId: string,
    update: WallpaperUpdate
  ): Promise<Wallpaper | null> {
    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [db.prepare(`
      UPDATE wallpapers SET
        title = ?, description = ?, category_id = ?, status = ?, is_featured = ?,
        creator = ?, source_provenance = ?, license_note = ?,
        published_at = CASE
          WHEN ? = 'published' AND status <> 'published' THEN ?
          WHEN ? <> 'published' THEN NULL
          ELSE published_at
        END,
        updated_at = ?
      WHERE id = ?
    `).bind(
      update.title, update.description, update.categoryId, update.status, update.isFeatured ? 1 : 0,
      update.creator, update.sourceProvenance, update.licenseNote,
      update.status, now, update.status, now, wallpaperId
    )];
    if (update.tagIds) {
      statements.push(db.prepare('DELETE FROM wallpaper_tags WHERE wallpaper_id = ?').bind(wallpaperId));
      for (const tagId of update.tagIds) {
        statements.push(db.prepare(
          'INSERT OR IGNORE INTO wallpaper_tags (wallpaper_id, tag_id) VALUES (?, ?)'
        ).bind(wallpaperId, tagId));
      }
    }
    await db.batch(statements);
    return this.getWallpaperById(db, wallpaperId);
  }

  /**
   * Increments download counter for specified wallpaper.
   */
  static async incrementDownloadCount(db: D1Database, wallpaperId: string): Promise<number> {
    await db
      .prepare('UPDATE wallpapers SET download_count = download_count + 1 WHERE id = ?')
      .bind(wallpaperId)
      .run();

    const updated = await db
      .prepare('SELECT download_count FROM wallpapers WHERE id = ?')
      .bind(wallpaperId)
      .first<{ download_count: number }>();

    return updated?.download_count || 0;
  }

  /**
   * Logs a download event for metric analytics.
   */
  static async logDownloadEvent(
    db: D1Database,
    event: { id: string; wallpaperId: string; countryCode?: string; userAgentClass?: string }
  ): Promise<void> {
    const now = new Date().toISOString();
    await db
      .prepare('INSERT INTO download_events (id, wallpaper_id, downloaded_at, country_code, user_agent_class) VALUES (?, ?, ?, ?, ?)')
      .bind(event.id, event.wallpaperId, now, event.countryCode || null, event.userAgentClass || null)
      .run();
  }

  /**
   * Executes atomic D1 batch transaction for download increment + event logging.
   */
  static async recordDownloadAtomic(
    db: D1Database,
    event: { id: string; wallpaperId: string; countryCode?: string; userAgentClass?: string }
  ): Promise<void> {
    const now = new Date().toISOString();
    const stmtIncrement = db
      .prepare('UPDATE wallpapers SET download_count = download_count + 1, updated_at = ? WHERE id = ?')
      .bind(now, event.wallpaperId);

    const stmtLogEvent = db
      .prepare('INSERT INTO download_events (id, wallpaper_id, downloaded_at, country_code, user_agent_class) VALUES (?, ?, ?, ?, ?)')
      .bind(event.id, event.wallpaperId, now, event.countryCode || null, event.userAgentClass || null);

    await db.batch([stmtIncrement, stmtLogEvent]);
  }

  /**
   * Maps raw database row snake_case to Wallpaper domain object camelCase.
   */
  private static mapWallpaperRow(row: DatabaseRow): Wallpaper {
    return {
      id: String(row.id),
      slug: String(row.slug),
      title: String(row.title),
      description: optionalDatabaseString(row.description),
      categoryId: optionalDatabaseString(row.category_id),
      width: Number(row.width),
      height: Number(row.height),
      aspectRatio: Number(row.aspect_ratio),
      orientation: row.orientation as OrientationType,
      format: String(row.format),
      mimeType: String(row.mime_type),
      fileSize: Number(row.file_size),
      resolutionLabel: optionalDatabaseString(row.resolution_label),
      originalR2Key: String(row.original_r2_key),
      preview480Key: optionalDatabaseString(row.preview_480_key),
      preview960Key: optionalDatabaseString(row.preview_960_key),
      preview1600Key: optionalDatabaseString(row.preview_1600_key),
      previewFallbackKey: optionalDatabaseString(row.preview_fallback_key),
      fileHash: optionalDatabaseString(row.file_hash),
      creator: optionalDatabaseString(row.creator),
      sourceProvenance: optionalDatabaseString(row.source_provenance),
      sourceProvider: optionalDatabaseString(row.source_provider),
      sourceExternalId: optionalDatabaseString(row.source_external_id),
      sourceUrl: optionalDatabaseString(row.source_url),
      creatorUrl: optionalDatabaseString(row.creator_url),
      licenseNote: optionalDatabaseString(row.license_note),
      status: row.status as WallpaperStatus,
      isFeatured: Boolean(row.is_featured),
      downloadCount: Number(row.download_count) || 0,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      publishedAt: optionalDatabaseString(row.published_at),
    };
  }
}
