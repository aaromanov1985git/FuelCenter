"""add organizations and organization_id to dictionaries

Revision ID: 20250129_000000
Revises: 20251211_000000
Create Date: 2025-01-29 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20250129_000000'
down_revision = '20251211_000000'
branch_labels = None
depends_on = None


def upgrade():
    # Создаем таблицу organizations
    op.create_table(
        'organizations',
        sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('code', sa.String(length=50), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Создаем индексы для organizations
    op.create_index('idx_organization_name', 'organizations', ['name'], unique=True)
    op.create_index('idx_organization_code', 'organizations', ['code'], unique=True)
    op.create_index(op.f('ix_organizations_id'), 'organizations', ['id'], unique=False)
    op.create_index(op.f('ix_organizations_is_active'), 'organizations', ['is_active'], unique=False)
    
    # Создаем таблицу связи user_organizations
    op.create_table(
        'user_organizations',
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('organization_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id', 'organization_id')
    )
    
    # Создаем индексы для user_organizations
    op.create_index('idx_user_organizations_user', 'user_organizations', ['user_id'], unique=False)
    op.create_index('idx_user_organizations_org', 'user_organizations', ['organization_id'], unique=False)
    
    # Добавляем organization_id в vehicles
    op.add_column('vehicles', sa.Column('organization_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_vehicles_organization_id'), 'vehicles', ['organization_id'], unique=False)
    op.create_foreign_key('fk_vehicles_organization_id', 'vehicles', 'organizations', ['organization_id'], ['id'])
    
    # Удаляем старый уникальный индекс и создаем новый с учетом organization_id
    op.drop_index('idx_vehicle_original', table_name='vehicles')
    op.create_index('idx_vehicle_original_org', 'vehicles', ['original_name', 'organization_id'], unique=True)
    
    # Добавляем organization_id в gas_stations
    op.add_column('gas_stations', sa.Column('organization_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_gas_stations_organization_id'), 'gas_stations', ['organization_id'], unique=False)
    op.create_foreign_key('fk_gas_stations_organization_id', 'gas_stations', 'organizations', ['organization_id'], ['id'])
    
    # Удаляем старый уникальный индекс и создаем новый с учетом organization_id
    op.drop_index('idx_gas_station_original', table_name='gas_stations')
    op.create_index('idx_gas_station_original_org', 'gas_stations', ['original_name', 'organization_id'], unique=True)
    
    # Добавляем organization_id в fuel_cards
    op.add_column('fuel_cards', sa.Column('organization_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_fuel_cards_organization_id'), 'fuel_cards', ['organization_id'], unique=False)
    op.create_foreign_key('fk_fuel_cards_organization_id', 'fuel_cards', 'organizations', ['organization_id'], ['id'])
    
    # Удаляем старый уникальный индекс card_number и создаем новый с учетом organization_id
    op.drop_index('ix_fuel_cards_card_number', table_name='fuel_cards')
    op.create_index('idx_fuel_card_number_org', 'fuel_cards', ['card_number', 'organization_id'], unique=True)
    
    # Обновляем индекс для fuel_cards
    op.drop_index('idx_fuel_card_active', table_name='fuel_cards')
    op.create_index('idx_fuel_card_active', 'fuel_cards', ['card_number', 'organization_id', 'is_active_assignment', 'assignment_start_date', 'assignment_end_date'], unique=False)
    
    # Добавляем organization_id в transactions
    op.add_column('transactions', sa.Column('organization_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_transactions_organization_id'), 'transactions', ['organization_id'], unique=False)
    op.create_foreign_key('fk_transactions_organization_id', 'transactions', 'organizations', ['organization_id'], ['id'])
    
    # Поле organization (строка) оставляем для обратной совместимости


def downgrade():
    # Удаляем organization_id из transactions
    op.drop_constraint('fk_transactions_organization_id', 'transactions', type_='foreignkey')
    op.drop_index(op.f('ix_transactions_organization_id'), table_name='transactions')
    op.drop_column('transactions', 'organization_id')
    
    # Удаляем organization_id из fuel_cards
    op.drop_constraint('fk_fuel_cards_organization_id', 'fuel_cards', type_='foreignkey')
    op.drop_index('idx_fuel_card_active', table_name='fuel_cards')
    op.drop_index('idx_fuel_card_number_org', table_name='fuel_cards')
    op.drop_index(op.f('ix_fuel_cards_organization_id'), table_name='fuel_cards')
    op.drop_column('fuel_cards', 'organization_id')
    # Восстанавливаем старый индекс
    op.create_index('ix_fuel_cards_card_number', 'fuel_cards', ['card_number'], unique=True)
    op.create_index('idx_fuel_card_active', 'fuel_cards', ['card_number', 'is_active_assignment', 'assignment_start_date', 'assignment_end_date'], unique=False)
    
    # Удаляем organization_id из gas_stations
    op.drop_constraint('fk_gas_stations_organization_id', 'gas_stations', type_='foreignkey')
    op.drop_index('idx_gas_station_original_org', table_name='gas_stations')
    op.drop_index(op.f('ix_gas_stations_organization_id'), table_name='gas_stations')
    op.drop_column('gas_stations', 'organization_id')
    # Восстанавливаем старый индекс
    op.create_index('idx_gas_station_original', 'gas_stations', ['original_name'], unique=True)
    
    # Удаляем organization_id из vehicles
    op.drop_constraint('fk_vehicles_organization_id', 'vehicles', type_='foreignkey')
    op.drop_index('idx_vehicle_original_org', table_name='vehicles')
    op.drop_index(op.f('ix_vehicles_organization_id'), table_name='vehicles')
    op.drop_column('vehicles', 'organization_id')
    # Восстанавливаем старый индекс
    op.create_index('idx_vehicle_original', 'vehicles', ['original_name'], unique=True)
    
    # Удаляем таблицу связи user_organizations
    op.drop_index('idx_user_organizations_org', table_name='user_organizations')
    op.drop_index('idx_user_organizations_user', table_name='user_organizations')
    op.drop_table('user_organizations')
    
    # Удаляем таблицу organizations
    op.drop_index(op.f('ix_organizations_is_active'), table_name='organizations')
    op.drop_index(op.f('ix_organizations_id'), table_name='organizations')
    op.drop_index('idx_organization_code', table_name='organizations')
    op.drop_index('idx_organization_name', table_name='organizations')
    op.drop_table('organizations')
