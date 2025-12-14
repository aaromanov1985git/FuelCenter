"""add coordinates to gas_stations

Revision ID: 20251214_000000
Revises: 20250131_000001
Create Date: 2025-12-14 17:56:55.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '20251214_000000'
down_revision = '20250131_000001'
branch_labels = None
depends_on = None


def upgrade():
    # Добавляем поля координат в gas_stations
    op.add_column('gas_stations', sa.Column('latitude', sa.Numeric(precision=10, scale=8), nullable=True, comment='Широта'))
    op.add_column('gas_stations', sa.Column('longitude', sa.Numeric(precision=11, scale=8), nullable=True, comment='Долгота'))


def downgrade():
    # Удаляем поля координат из gas_stations
    op.drop_column('gas_stations', 'longitude')
    op.drop_column('gas_stations', 'latitude')
