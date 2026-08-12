-- Migration 0003: persistent upstream cache and abuse-control counters.

CREATE TABLE IF NOT EXISTS pixabay_api_cache (
    cache_key TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL,
    cached_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pixabay_api_cache_expires
ON pixabay_api_cache(expires_at);

CREATE TABLE IF NOT EXISTS api_rate_limits (
    scope TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    window_started_at INTEGER NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (scope, key_hash)
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_window
ON api_rate_limits(window_started_at);
