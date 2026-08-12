import { spawnSync } from 'node:child_process';

const remote = process.argv.includes('--remote');
const persistTo = process.env.D1_PERSIST_TO;
if (remote && process.env.D1_BACKUP_CONFIRMED !== 'yes') {
  console.error('Refusing remote baseline: create a D1 backup, then set D1_BACKUP_CONFIRMED=yes.');
  process.exit(2);
}

const expectedColumns = new Set([
  'id', 'slug', 'title', 'description', 'category_id', 'width', 'height', 'aspect_ratio',
  'orientation', 'format', 'mime_type', 'file_size', 'resolution_label', 'original_r2_key',
  'preview_480_key', 'preview_960_key', 'preview_1600_key', 'preview_fallback_key', 'file_hash',
  'creator', 'source_provenance', 'license_note', 'status', 'is_featured', 'download_count',
  'created_at', 'updated_at', 'published_at', 'source_provider', 'source_external_id',
  'source_url', 'creator_url',
]);
const expectedIndexes = new Set(['idx_wallpapers_source', 'idx_wallpapers_file_hash']);

function wrangler(command) {
  const args = ['wrangler', 'd1', 'execute', 'elysium_db', remote ? '--remote' : '--local', '--json', '--command', command];
  if (!remote && persistTo) args.splice(5, 0, '--persist-to', persistTo);
  const result = spawnSync('npx', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'Wrangler failed');
  const start = result.stdout.indexOf('[');
  if (start < 0) throw new Error('Wrangler did not return JSON');
  return JSON.parse(result.stdout.slice(start));
}

function rows(result) {
  const first = Array.isArray(result) ? result[0] : undefined;
  return first?.results || [];
}

const columns = new Set(rows(wrangler('PRAGMA table_info(wallpapers)')).map((row) => row.name));
const indexes = new Set(rows(wrangler('PRAGMA index_list(wallpapers)')).map((row) => row.name));
const missingColumns = [...expectedColumns].filter((name) => !columns.has(name));
const missingIndexes = [...expectedIndexes].filter((name) => !indexes.has(name));
if (missingColumns.length || missingIndexes.length) {
  console.error(`Preflight failed. Missing columns: ${missingColumns.join(', ') || 'none'}; indexes: ${missingIndexes.join(', ') || 'none'}.`);
  process.exit(1);
}

wrangler(`
CREATE TABLE IF NOT EXISTS d1_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0001_initial_schema.sql');
INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0002_pixabay_importer.sql');
`);
console.log(`Baseline recorded for 0001/0002 on ${remote ? 'remote' : 'local'} database after successful preflight.`);
