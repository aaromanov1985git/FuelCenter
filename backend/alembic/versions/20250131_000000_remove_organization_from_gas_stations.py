"""remove organization_id from gas_stations

Revision ID: 20250131_000000
Revises: 8352e2f8e707
Create Date: 2025-01-31 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '20250131_000000'
down_revision = '8352e2f8e707'
branch_labels = None
depends_on = None


def upgrade():
    # Удаляем старый индекс, который использовал organization_id
    try:
        op.drop_index('idx_gas_station_original_org', table_name='gas_stations')
    except Exception:
        # Индекс может не существовать, игнорируем ошибку
        pass
    
    # Удаляем внешний ключ для organization_id
    try:
        op.drop_constraint('fk_gas_stations_organization_id', 'gas_stations', type_='foreignkey')
    except Exception:
        # Внешний ключ может не существовать или иметь другое имя, пробуем альтернативное имя
        try:
            op.drop_constraint('gas_stations_organization_id_fkey', 'gas_stations', type_='foreignkey')
        except Exception:
            pass
    
    # Удаляем индекс для organization_id
    try:
        op.drop_index(op.f('ix_gas_stations_organization_id'), table_name='gas_stations')
    except Exception:
        # Индекс может не существовать, игнорируем ошибку
        pass
    
    # Удаляем колонку organization_id
    op.drop_column('gas_stations', 'organization_id')
    
    # Создаем новый индекс только по original_name (уникальный)
    op.create_index('idx_gas_station_original', 'gas_stations', ['original_name'], unique=True)


def downgrade():
    # Добавляем обратно колонку organization_id
    op.add_column('gas_stations', sa.Column('organization_id', sa.Integer(), nullable=True))
    
    # Создаем индекс для organization_id
    op.create_index(op.f('ix_gas_stations_organization_id'), 'gas_stations', ['organization_id'], unique=False)
    
    # Создаем внешний ключ
    op.create_foreign_key('fk_gas_stations_organization_id', 'gas_stations', 'organizations', ['organization_id'], ['id'])
    
    # Удаляем новый индекс
    op.drop_index('idx_gas_station_original', table_name='gas_stations')
    
    # Создаем старый индекс с organization_id
    op.create_index('idx_gas_station_original_org', 'gas_stations', ['original_name', 'organization_id'], unique=True)
