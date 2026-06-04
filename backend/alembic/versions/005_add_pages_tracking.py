"""add pages_total and pages_analyzed to usgs_dockets

Revision ID: 005
Revises: 004
Create Date: 2026-06-03
"""
from alembic import op
import sqlalchemy as sa

revision = '005'
down_revision = '004'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('usgs_dockets', sa.Column('pages_total', sa.Integer, nullable=True))
    op.add_column('usgs_dockets', sa.Column('pages_analyzed', sa.Integer, nullable=True))


def downgrade():
    op.drop_column('usgs_dockets', 'pages_analyzed')
    op.drop_column('usgs_dockets', 'pages_total')
