"""add password_hash, is_admin to users; add login_events table

Revision ID: 002
Revises: 001
Create Date: 2026-05-09 00:00:00.000000
"""
from alembic import op

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE")
    op.execute("""
        CREATE TABLE IF NOT EXISTS login_events (
            id SERIAL PRIMARY KEY,
            username TEXT NOT NULL,
            ip_address TEXT,
            session_id TEXT,
            logged_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_login_events_username ON login_events (username)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_login_events_logged_at ON login_events (logged_at DESC)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS login_events")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS password_hash")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS is_admin")
