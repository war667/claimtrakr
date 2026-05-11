#!/bin/sh
set -e

cd "$(dirname "$0")/.."

echo "Applying migration 006: add lease_critical_dates table..."

docker compose exec db psql -U ct -d claimtrakr -c "
CREATE TABLE IF NOT EXISTS lease_critical_dates (
    id SERIAL PRIMARY KEY,
    lease_id INTEGER NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    date_type TEXT NOT NULL DEFAULT 'custom',
    critical_date DATE NOT NULL,
    alert_days INTEGER NOT NULL DEFAULT 60,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_lcd_lease_id ON lease_critical_dates (lease_id);
CREATE INDEX IF NOT EXISTS ix_lcd_critical_date ON lease_critical_dates (critical_date);
"

echo "Done."
