#!/bin/bash
set -e
docker compose exec db psql -U ct claimtrakr <<'SQL'
CREATE TABLE IF NOT EXISTS blm_payment_tracking (
    id SERIAL PRIMARY KEY,
    serial_nr TEXT NOT NULL,
    legacy_lead_file_nr TEXT,
    claim_name TEXT,
    claimant TEXT,
    customer_id TEXT,
    location_dt DATE,
    closed_dt DATE,
    next_pmt_due_dt DATE,
    case_disposition TEXT,
    lead_file_nr TEXT,
    meridian_twp_rng TEXT,
    admin_state TEXT,
    field_office TEXT,
    county TEXT,
    claim_type TEXT,
    sections TEXT,
    is_paid BOOLEAN NOT NULL DEFAULT FALSE,
    paid_at TIMESTAMPTZ,
    paid_by TEXT,
    notes TEXT,
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(serial_nr, next_pmt_due_dt)
);
SQL
echo "migrate_007: blm_payment_tracking created"
