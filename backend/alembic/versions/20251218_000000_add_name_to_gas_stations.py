"""add name field to gas_stations

Revision ID: 20251218_000000
Revises: 20251214_000000
Create Date: 2025-12-18 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '20251218_000000'
down_revision = '20251214_000000'
branch_labels = None
depends_on = None


def upgrade():
    # Добавляем поле name в gas_stations
    op.add_column('gas_stations', sa.Column('name', sa.String(length=200), nullable=True, comment='Наименование АЗС (редактируемое)'))
    
    # Заполняем name значением original_name для существующих записей
    op.execute("UPDATE gas_stations SET name = original_name WHERE name IS NULL")
    
    # Делаем поле обязательным после заполнения
    op.alter_column('gas_stations', 'name', nullable=False)


def downgrade():
    # Удаляем поле name из gas_stations
    op.drop_column('gas_stations', 'name')
