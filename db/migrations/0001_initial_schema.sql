-- Migration 0001: Initial Schema Setup

-- Categories Table
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Tags Table
CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL
);

-- Wallpapers Table
CREATE TABLE IF NOT EXISTS wallpapers (
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

-- Wallpaper Tags Junction Table
CREATE TABLE IF NOT EXISTS wallpaper_tags (
    wallpaper_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (wallpaper_id, tag_id),
    FOREIGN KEY (wallpaper_id) REFERENCES wallpapers(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- Download Events Table
CREATE TABLE IF NOT EXISTS download_events (
    id TEXT PRIMARY KEY,
    wallpaper_id TEXT NOT NULL,
    downloaded_at TEXT NOT NULL,
    country_code TEXT,
    user_agent_class TEXT,
    FOREIGN KEY (wallpaper_id) REFERENCES wallpapers(id) ON DELETE CASCADE
);

-- Indexes for Fast Query Performance
CREATE INDEX IF NOT EXISTS idx_wallpapers_status ON wallpapers(status);
CREATE INDEX IF NOT EXISTS idx_wallpapers_category ON wallpapers(category_id);
CREATE INDEX IF NOT EXISTS idx_wallpapers_orientation ON wallpapers(orientation);
CREATE INDEX IF NOT EXISTS idx_wallpapers_featured ON wallpapers(is_featured);
