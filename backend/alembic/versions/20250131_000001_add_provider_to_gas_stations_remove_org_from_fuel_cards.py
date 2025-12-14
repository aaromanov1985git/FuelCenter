"""add provider_id to gas_stations and remove organization_id from fuel_cards

Revision ID: 20250131_000001
Revises: 20250131_000000
Create Date: 2025-01-31 00:00:01.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '20250131_000001'
down_revision = '20250131_000000'
branch_labels = None
depends_on = None


def upgrade():
    # Добавляем provider_id в gas_stations
    op.add_column('gas_stations', sa.Column('provider_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_gas_stations_provider_id'), 'gas_stations', ['provider_id'], unique=False)
    op.create_foreign_key('fk_gas_stations_provider_id', 'gas_stations', 'providers', ['provider_id'], ['id'])
    
    # Удаляем organization_id из fuel_cards
    # Сначала удаляем старые индексы, которые используют organization_id
    try:
        op.drop_index('idx_fuel_card_active', table_name='fuel_cards')
    except Exception:
        pass
    
    try:
        op.drop_index('idx_fuel_card_number_org', table_name='fuel_cards')
    except Exception:
        pass
    
    # Удаляем внешний ключ
    try:
        op.drop_constraint('fk_fuel_cards_organization_id', 'fuel_cards', type_='foreignkey')
    except Exception:
        try:
            op.drop_constraint('fuel_cards_organization_id_fkey', 'fuel_cards', type_='foreignkey')
        except Exception:
            pass
    
    # Удаляем индекс для organization_id
    try:
        op.drop_index(op.f('ix_fuel_cards_organization_id'), table_name='fuel_cards')
    except Exception:
        pass
    
    # Удаляем колонку organization_id
    op.drop_column('fuel_cards', 'organization_id')
    
    # Создаем новые индексы без organization_id
    op.create_index('idx_fuel_card_active', 'fuel_cards', ['card_number', 'is_active_assignment', 'assignment_start_date', 'assignment_end_date'], unique=False)
    op.create_index('idx_fuel_card_number', 'fuel_cards', ['card_number'], unique=True)


def downgrade():
    # Откатываем изменения для fuel_cards
    op.add_column('fuel_cards', sa.Column('organization_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_fuel_cards_organization_id'), 'fuel_cards', ['organization_id'], unique=False)
    op.create_foreign_key('fk_fuel_cards_organization_id', 'fuel_cards', 'organizations', ['organization_id'], ['id'])
    
    # Удаляем новые индексы
    op.drop_index('idx_fuel_card_number', table_name='fuel_cards')
    op.drop_index('idx_fuel_card_active', table_name='fuel_cards')
    
    # Создаем старые индексы
    op.create_index('idx_fuel_card_number_org', 'fuel_cards', ['card_number', 'organization_id'], unique=True)
    op.create_index('idx_fuel_card_active', 'fuel_cards', ['card_number', 'organization_id', 'is_active_assignment', 'assignment_start_date', 'assignment_end_date'], unique=False)
    
    # Откатываем изменения для gas_stations
    op.drop_constraint('fk_gas_stations_provider_id', 'gas_stations', type_='foreignkey')
    op.drop_index(op.f('ix_gas_stations_provider_id'), table_name='gas_stations')
    op.drop_column('gas_stations', 'provider_id')
