"""add usgs_dockets table

Revision ID: 004
Revises: 003
Create Date: 2026-06-03
"""
from alembic import op
import sqlalchemy as sa

revision = '004'
down_revision = '003'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'usgs_dockets',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('docket_nr', sa.Text, nullable=False),
        sa.Column('agency', sa.Text, nullable=False),
        sa.Column('state', sa.Text, nullable=False),
        sa.Column('county', sa.Text, nullable=False),
        sa.Column('property_name', sa.Text),
        sa.Column('commodity', sa.Text),
        sa.Column('pdf_url', sa.Text, nullable=False),
        sa.Column('pdf_path', sa.Text),
        sa.Column('file_size_bytes', sa.BigInteger),
        sa.Column('summary', sa.Text),
        sa.Column('extracted_text', sa.Text),
        sa.Column('land_hint', sa.Text),
        sa.Column('status', sa.Text, nullable=False, server_default='pending'),
        sa.Column('error_msg', sa.Text),
        sa.Column('fetched_at', sa.TIMESTAMP(timezone=True)),
        sa.Column('processed_at', sa.TIMESTAMP(timezone=True)),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_usgs_dockets_docket_nr', 'usgs_dockets', ['docket_nr'], unique=True)
    op.create_index('ix_usgs_dockets_state', 'usgs_dockets', ['state'])
    op.create_index('ix_usgs_dockets_status', 'usgs_dockets', ['status'])


def downgrade():
    op.drop_table('usgs_dockets')
