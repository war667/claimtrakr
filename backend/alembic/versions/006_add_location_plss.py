"""add location_plss to usgs_dockets

Revision ID: 006
Revises: 005
Create Date: 2026-06-03
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = '006'
down_revision = '005'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('usgs_dockets', sa.Column('location_plss', JSONB, nullable=True))


def downgrade():
    op.drop_column('usgs_dockets', 'location_plss')
