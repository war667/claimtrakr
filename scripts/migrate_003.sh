#!/bin/sh
set -e

cd "$(dirname "$0")/.."

echo "Applying migration 003: add leases table..."

docker compose exec db psql -U ct -d claimtrakr -c "
CREATE TABLE IF NOT EXISTS leases (
    id SERIAL PRIMARY KEY,
    lease_name TEXT NOT NULL,
    serial_nr TEXT REFERENCES claims(serial_nr) ON DELETE SET NULL,
    lessor TEXT,
    lessee TEXT,
    acreage NUMERIC(10, 4),
    annual_payment NUMERIC(12, 2),
    renewal_terms TEXT,
    start_dt DATE,
    expiration_dt DATE,
    workflow_status TEXT NOT NULL DEFAULT 'prospecting',
    notes TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_leases_serial_nr ON leases (serial_nr);
CREATE INDEX IF NOT EXISTS ix_leases_expiration_dt ON leases (expiration_dt);
CREATE INDEX IF NOT EXISTS ix_leases_workflow_status ON leases (workflow_status);
"

echo "Done."
