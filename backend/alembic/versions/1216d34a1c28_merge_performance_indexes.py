"""merge performance indexes

Revision ID: 1216d34a1c28
Revises: add_performance_indexes, 20250120_000000
Create Date: 2025-12-26 11:38:57.336865

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '1216d34a1c28'
down_revision = ('add_performance_indexes', '20250120_000000')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
