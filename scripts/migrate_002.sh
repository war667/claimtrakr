#!/bin/sh
set -e

cd "$(dirname "$0")/.."

echo "Applying migration 002: add password_hash, is_admin, login_events..."

docker compose exec db psql -U ct -d claimtrakr -c "
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE IF NOT EXISTS login_events (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL,
    ip_address TEXT,
    session_id TEXT,
    logged_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_login_events_username ON login_events (username);
CREATE INDEX IF NOT EXISTS ix_login_events_logged_at ON login_events (logged_at DESC);
"

echo "Done."
