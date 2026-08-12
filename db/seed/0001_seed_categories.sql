-- Initial Categories Seed Data

INSERT OR IGNORE INTO categories (id, slug, name, description, created_at, updated_at) VALUES
('cat_nature', 'nature', 'Nature', 'Serene landscapes, forests, and outdoor sceneries', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cat_architecture', 'architecture', 'Architecture', 'Modern structures, urban photography, and interior design', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cat_space', 'space', 'Space', 'Galaxies, nebulas, stars, and cosmic phenomenon', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cat_automotive', 'automotive', 'Automotive', 'High performance vehicles and conceptual transport', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cat_abstract', 'abstract', 'Abstract', 'Fluid dynamics, geometric shapes, and minimal compositions', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cat_dark', 'dark', 'Dark', 'OLED black backgrounds and moody dark aesthetic', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cat_animals', 'animals', 'Animals', 'Wildlife, birds, marine life, and animal portraits', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cat_art', 'art', 'Art', 'Paintings, illustrations, sculpture, and decorative art', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('cat_food', 'food', 'Food', 'Dishes, fruit, ingredients, desserts, and beverages', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
