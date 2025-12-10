"""add gas_stations table

Revision ID: 20250128_000000
Revises: add_users_table
Create Date: 2025-01-28 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20250128_000000'
down_revision = 'add_users_table'
branch_labels = None
depends_on = None


def upgrade():
    # Создаем таблицу gas_stations
    op.create_table(
        'gas_stations',
        sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
        sa.Column('original_name', sa.String(length=200), nullable=False),
        sa.Column('azs_number', sa.String(length=50), nullable=True),
        sa.Column('location', sa.String(length=500), nullable=True),
        sa.Column('region', sa.String(length=200), nullable=True),
        sa.Column('settlement', sa.String(length=200), nullable=True),
        sa.Column('is_validated', sa.String(length=10), nullable=True, server_default='pending'),
        sa.Column('validation_errors', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Создаем индексы
    op.create_index('idx_gas_station_original', 'gas_stations', ['original_name'], unique=True)
    op.create_index(op.f('ix_gas_stations_id'), 'gas_stations', ['id'], unique=False)
    op.create_index(op.f('ix_gas_stations_original_name'), 'gas_stations', ['original_name'], unique=False)
    op.create_index(op.f('ix_gas_stations_azs_number'), 'gas_stations', ['azs_number'], unique=False)
    
    # Добавляем колонку gas_station_id в таблицу transactions
    op.add_column('transactions', sa.Column('gas_station_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_transactions_gas_station_id'), 'transactions', ['gas_station_id'], unique=False)
    op.create_foreign_key('fk_transactions_gas_station_id', 'transactions', 'gas_stations', ['gas_station_id'], ['id'])


def downgrade():
    # Удаляем внешний ключ и колонку gas_station_id из transactions
    op.drop_constraint('fk_transactions_gas_station_id', 'transactions', type_='foreignkey')
    op.drop_index(op.f('ix_transactions_gas_station_id'), table_name='transactions')
    op.drop_column('transactions', 'gas_station_id')
    
    # Удаляем индексы и таблицу gas_stations
    op.drop_index(op.f('ix_gas_stations_azs_number'), table_name='gas_stations')
    op.drop_index(op.f('ix_gas_stations_original_name'), table_name='gas_stations')
    op.drop_index(op.f('ix_gas_stations_id'), table_name='gas_stations')
    op.drop_index('idx_gas_station_original', table_name='gas_stations')
    op.drop_table('gas_stations')

