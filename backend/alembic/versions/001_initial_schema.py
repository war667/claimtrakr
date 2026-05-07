"""initial schema

Revision ID: 001
Revises:
Create Date: 2024-01-01 00:00:00.000000
"""
from alembic import op

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis;")
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";')

    op.execute("""
    CREATE TABLE data_sources (
        id SERIAL PRIMARY KEY,
        source_key TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        source_type TEXT NOT NULL,
        base_url TEXT,
        layer_index INT,
        state_filter TEXT[],
        is_active BOOLEAN DEFAULT TRUE,
        phase INT DEFAULT 1,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    """)

    op.execute("""
    CREATE TABLE ingestion_runs (
        id SERIAL PRIMARY KEY,
        source_id INT REFERENCES data_sources(id),
        triggered_by TEXT DEFAULT 'scheduler',
        started_at TIMESTAMPTZ DEFAULT NOW(),
        finished_at TIMESTAMPTZ,
        status TEXT DEFAULT 'running',
        records_fetched INT DEFAULT 0,
        records_upserted INT DEFAULT 0,
        records_errored INT DEFAULT 0,
        changes_detected INT DEFAULT 0,
        error_summary TEXT,
        metadata JSONB DEFAULT '{}'
    );
    """)

    op.execute("""
    CREATE TABLE ingestion_errors (
        id SERIAL PRIMARY KEY,
        run_id INT REFERENCES ingestion_runs(id) ON DELETE CASCADE,
        error_type TEXT,
        serial_nr TEXT,
        page_offset INT,
        error_message TEXT,
        raw_data JSONB,
        occurred_at TIMESTAMPTZ DEFAULT NOW()
    );
    """)

    op.execute("""
    CREATE TABLE source_raw_records (
        id BIGSERIAL PRIMARY KEY,
        run_id INT REFERENCES ingestion_runs(id),
        source_id INT REFERENCES data_sources(id),
        serial_nr TEXT NOT NULL,
        fetched_at TIMESTAMPTZ DEFAULT NOW(),
        raw_json JSONB NOT NULL
    );
    """)

    op.execute("""
    CREATE TABLE disposition_codes (
        code TEXT PRIMARY KEY,
        description TEXT NOT NULL,
        category TEXT,
        is_closure BOOLEAN DEFAULT FALSE
    );
    """)

    op.execute("""
    CREATE TABLE claims (
        id BIGSERIAL PRIMARY KEY,
        serial_nr TEXT UNIQUE NOT NULL,
        source_id INT REFERENCES data_sources(id),
        claim_name TEXT,
        claim_type TEXT,
        claimant_name TEXT,
        claimant_addr TEXT,
        state TEXT,
        county TEXT,
        meridian TEXT,
        township TEXT,
        township_dir TEXT,
        range TEXT,
        range_dir TEXT,
        section TEXT,
        aliquot TEXT,
        acres NUMERIC(10,2),
        case_status TEXT NOT NULL,
        disposition_cd TEXT,
        disposition_desc TEXT,
        location_dt DATE,
        filing_dt DATE,
        closed_dt DATE,
        last_action_dt DATE,
        blm_url TEXT,
        source_layer TEXT,
        geom GEOMETRY(MultiPolygon, 4326),
        geom_source TEXT DEFAULT 'source',
        geom_confidence TEXT DEFAULT 'low',
        bbox GEOMETRY(Polygon, 4326),
        first_seen_at TIMESTAMPTZ DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ DEFAULT NOW(),
        last_run_id INT REFERENCES ingestion_runs(id),
        prev_status TEXT,
        prev_disp_cd TEXT,
        prev_claimant TEXT,
        is_duplicate BOOLEAN DEFAULT FALSE,
        needs_review BOOLEAN DEFAULT FALSE,
        raw_json JSONB
    );
    """)

    op.execute("CREATE INDEX idx_claims_state ON claims(state);")
    op.execute("CREATE INDEX idx_claims_county ON claims(county);")
    op.execute("CREATE INDEX idx_claims_case_status ON claims(case_status);")
    op.execute("CREATE INDEX idx_claims_claim_type ON claims(claim_type);")
    op.execute("CREATE INDEX idx_claims_closed_dt ON claims(closed_dt);")
    op.execute("CREATE INDEX idx_claims_last_seen_at ON claims(last_seen_at);")
    op.execute("CREATE INDEX idx_claims_geom ON claims USING GIST(geom);")
    op.execute("CREATE INDEX idx_claims_bbox ON claims USING GIST(bbox);")

    op.execute("""
    CREATE TABLE claim_snapshots (
        id BIGSERIAL PRIMARY KEY,
        serial_nr TEXT NOT NULL,
        snapped_at TIMESTAMPTZ DEFAULT NOW(),
        run_id INT REFERENCES ingestion_runs(id),
        case_status TEXT,
        disposition_cd TEXT,
        claimant_name TEXT,
        acres NUMERIC(10,2),
        geom_hash TEXT,
        raw_json JSONB
    );
    """)

    op.execute("""
    CREATE TABLE claim_events (
        id BIGSERIAL PRIMARY KEY,
        serial_nr TEXT NOT NULL,
        run_id INT REFERENCES ingestion_runs(id),
        event_type TEXT NOT NULL,
        event_subtype TEXT,
        old_value TEXT,
        new_value TEXT,
        detected_at TIMESTAMPTZ DEFAULT NOW(),
        notes TEXT
    );
    """)

    op.execute("CREATE INDEX idx_claim_events_serial_detected ON claim_events(serial_nr, detected_at DESC);")
    op.execute("CREATE INDEX idx_claim_events_event_type ON claim_events(event_type);")
    op.execute("CREATE INDEX idx_claim_events_detected_at ON claim_events(detected_at DESC);")

    op.execute("""
    CREATE TABLE targets (
        id SERIAL PRIMARY KEY,
        serial_nr TEXT NOT NULL REFERENCES claims(serial_nr),
        workflow_status TEXT NOT NULL DEFAULT 'new',
        assigned_to TEXT,
        created_by TEXT,
        priority_score INT DEFAULT 0,
        priority_label TEXT,
        notes TEXT,
        internal_name TEXT,
        proposed_claim_type TEXT,
        proposed_name TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        status_changed_at TIMESTAMPTZ DEFAULT NOW()
    );
    """)

    op.execute("""
    CREATE TABLE target_status_history (
        id SERIAL PRIMARY KEY,
        target_id INT REFERENCES targets(id) ON DELETE CASCADE,
        from_status TEXT,
        to_status TEXT NOT NULL,
        changed_by TEXT,
        changed_at TIMESTAMPTZ DEFAULT NOW(),
        notes TEXT
    );
    """)

    op.execute("""
    CREATE TABLE due_diligence_items (
        id SERIAL PRIMARY KEY,
        target_id INT REFERENCES targets(id) ON DELETE CASCADE,
        task_key TEXT NOT NULL,
        task_label TEXT NOT NULL,
        is_complete BOOLEAN DEFAULT FALSE,
        completed_by TEXT,
        completed_at TIMESTAMPTZ,
        notes TEXT,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );
    """)

    op.execute("""
    CREATE TABLE target_files (
        id SERIAL PRIMARY KEY,
        target_id INT REFERENCES targets(id) ON DELETE CASCADE,
        file_type TEXT,
        filename TEXT NOT NULL,
        storage_path TEXT NOT NULL,
        file_size_bytes INT,
        mime_type TEXT,
        uploaded_by TEXT,
        uploaded_at TIMESTAMPTZ DEFAULT NOW(),
        notes TEXT
    );
    """)

    op.execute("""
    CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT,
        role TEXT DEFAULT 'researcher',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        last_login_at TIMESTAMPTZ
    );
    """)

    op.execute("""
    CREATE TABLE saved_searches (
        id SERIAL PRIMARY KEY,
        created_by TEXT,
        name TEXT NOT NULL,
        filters JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );
    """)

    op.execute("""
    CREATE TABLE exports (
        id SERIAL PRIMARY KEY,
        exported_by TEXT,
        export_type TEXT,
        filters_used JSONB,
        record_count INT,
        exported_at TIMESTAMPTZ DEFAULT NOW()
    );
    """)

    # Seed disposition_codes
    op.execute("""
    INSERT INTO disposition_codes (code, description, category, is_closure) VALUES
        ('MC', 'Mining Claim - Active', 'active', false),
        ('NR', 'Non-Renewal - Maintenance Fee Not Paid', 'closed_nonpayment', true),
        ('VR', 'Voluntary Relinquishment', 'closed_voluntary', true),
        ('CO', 'Contested - Closed', 'closed_contest', true),
        ('EX', 'Expiration', 'closed_nonpayment', true),
        ('WD', 'Withdrawal - Land Closed to Location', 'closed_withdrawal', true),
        ('IN', 'Invalid - Contest Decision', 'closed_invalid', true),
        ('NL', 'Null/Void', 'closed_invalid', true),
        ('PA', 'Patented', 'patented', false),
        ('SI', 'Small Miner Waiver', 'active', false);
    """)

    # Seed data_sources
    op.execute("""
    INSERT INTO data_sources (source_key, display_name, source_type, base_url, layer_index, state_filter, is_active, phase) VALUES
        ('blm_active', 'BLM MLRS Active Mining Claims', 'arcgis_rest',
         'https://gis.blm.gov/nlsdb/rest/services/Mining_Claims/MiningClaims/MapServer',
         0, ARRAY['UT','NV'], true, 1),
        ('blm_closed', 'BLM MLRS Closed Mining Claims', 'arcgis_rest',
         'https://gis.blm.gov/nlsdb/rest/services/Mining_Claims/MiningClaims/MapServer',
         0, ARRAY['UT','NV'], true, 1),
        ('manual_upload', 'Manual CSV / GeoJSON Upload', 'csv_upload',
         NULL, NULL, NULL, true, 1);
    """)

    # Seed admin user
    op.execute("""
    INSERT INTO users (username, email, role, is_active) VALUES
        ('admin', 'admin@internal', 'owner', true);
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS exports CASCADE;")
    op.execute("DROP TABLE IF EXISTS saved_searches CASCADE;")
    op.execute("DROP TABLE IF EXISTS users CASCADE;")
    op.execute("DROP TABLE IF EXISTS target_files CASCADE;")
    op.execute("DROP TABLE IF EXISTS due_diligence_items CASCADE;")
    op.execute("DROP TABLE IF EXISTS target_status_history CASCADE;")
    op.execute("DROP TABLE IF EXISTS targets CASCADE;")
    op.execute("DROP TABLE IF EXISTS claim_events CASCADE;")
    op.execute("DROP TABLE IF EXISTS claim_snapshots CASCADE;")
    op.execute("DROP TABLE IF EXISTS claims CASCADE;")
    op.execute("DROP TABLE IF EXISTS disposition_codes CASCADE;")
    op.execute("DROP TABLE IF EXISTS source_raw_records CASCADE;")
    op.execute("DROP TABLE IF EXISTS ingestion_errors CASCADE;")
    op.execute("DROP TABLE IF EXISTS ingestion_runs CASCADE;")
    op.execute("DROP TABLE IF EXISTS data_sources CASCADE;")
