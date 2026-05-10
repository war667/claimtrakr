"""add leases table

Revision ID: 003
Revises: 002
Create Date: 2026-05-10 00:00:00.000000
"""
from alembic import op

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
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
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_leases_serial_nr ON leases (serial_nr)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_leases_expiration_dt ON leases (expiration_dt)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_leases_workflow_status ON leases (workflow_status)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS leases")
