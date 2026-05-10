#!/bin/sh
set -e

cd "$(dirname "$0")/.."

echo "Applying migration 005: add page_views table..."

docker compose exec db psql -U ct -d claimtrakr -c "
CREATE TABLE IF NOT EXISTS page_views (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL,
    page TEXT NOT NULL,
    visited_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_page_views_username ON page_views (username);
CREATE INDEX IF NOT EXISTS ix_page_views_visited_at ON page_views (visited_at DESC);
CREATE INDEX IF NOT EXISTS ix_page_views_page ON page_views (page);
"

echo "Done."
