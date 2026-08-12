-- Migration 0002: external provider provenance for curated imports.

ALTER TABLE wallpapers ADD COLUMN source_provider TEXT;
ALTER TABLE wallpapers ADD COLUMN source_external_id TEXT;
ALTER TABLE wallpapers ADD COLUMN source_url TEXT;
ALTER TABLE wallpapers ADD COLUMN creator_url TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallpapers_source
ON wallpapers(source_provider, source_external_id)
WHERE source_provider IS NOT NULL AND source_external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallpapers_file_hash
ON wallpapers(file_hash)
WHERE file_hash IS NOT NULL;
