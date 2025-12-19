"""add fuel card analysis tables

Revision ID: 20250120_000000
Revises: 20251218_000000
Create Date: 2025-01-20 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20250120_000000'
down_revision = '20251218_000000'
branch_labels = None
depends_on = None


def upgrade():
    # Создаем таблицу vehicle_refuels
    op.create_table(
        'vehicle_refuels',
        sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
        sa.Column('vehicle_id', sa.Integer(), nullable=False, comment='ID транспортного средства'),
        sa.Column('refuel_date', sa.DateTime(), nullable=False, comment='Дата и время заправки'),
        sa.Column('fuel_type', sa.String(length=200), nullable=True, comment='Тип топлива'),
        sa.Column('quantity', sa.Numeric(precision=10, scale=2), nullable=False, comment='Количество заправленного топлива (литры)'),
        sa.Column('fuel_level_before', sa.Numeric(precision=5, scale=2), nullable=True, comment='Уровень топлива до заправки (% или литры)'),
        sa.Column('fuel_level_after', sa.Numeric(precision=5, scale=2), nullable=True, comment='Уровень топлива после заправки (% или литры)'),
        sa.Column('odometer_reading', sa.Numeric(precision=10, scale=1), nullable=True, comment='Показания одометра на момент заправки'),
        sa.Column('source_system', sa.String(length=100), nullable=False, comment='Источник данных (GLONASS, телематика, ручной ввод)'),
        sa.Column('source_id', sa.String(length=200), nullable=True, comment='ID записи в системе-источнике'),
        sa.Column('latitude', sa.Numeric(precision=10, scale=8), nullable=True, comment='Широта места заправки'),
        sa.Column('longitude', sa.Numeric(precision=11, scale=8), nullable=True, comment='Долгота места заправки'),
        sa.Column('location_accuracy', sa.Numeric(precision=8, scale=2), nullable=True, comment='Точность определения местоположения (метры)'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True, comment='Дата создания записи'),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True, comment='Дата обновления записи'),
        sa.ForeignKeyConstraint(['vehicle_id'], ['vehicles.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_vehicle_refuel_vehicle_date', 'vehicle_refuels', ['vehicle_id', 'refuel_date'], unique=False)
    op.create_index('idx_vehicle_refuel_source', 'vehicle_refuels', ['source_system', 'source_id'], unique=False)
    op.create_index(op.f('ix_vehicle_refuels_id'), 'vehicle_refuels', ['id'], unique=False)
    op.create_index(op.f('ix_vehicle_refuels_refuel_date'), 'vehicle_refuels', ['refuel_date'], unique=False)
    op.create_index(op.f('ix_vehicle_refuels_source_system'), 'vehicle_refuels', ['source_system'], unique=False)
    op.create_index(op.f('ix_vehicle_refuels_vehicle_id'), 'vehicle_refuels', ['vehicle_id'], unique=False)
    op.create_index(op.f('ix_vehicle_refuels_fuel_type'), 'vehicle_refuels', ['fuel_type'], unique=False)
    op.create_index(op.f('ix_vehicle_refuels_source_id'), 'vehicle_refuels', ['source_id'], unique=False)

    # Создаем таблицу vehicle_locations
    op.create_table(
        'vehicle_locations',
        sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
        sa.Column('vehicle_id', sa.Integer(), nullable=False, comment='ID транспортного средства'),
        sa.Column('timestamp', sa.DateTime(), nullable=False, comment='Дата и время фиксации местоположения'),
        sa.Column('latitude', sa.Numeric(precision=10, scale=8), nullable=False, comment='Широта'),
        sa.Column('longitude', sa.Numeric(precision=11, scale=8), nullable=False, comment='Долгота'),
        sa.Column('speed', sa.Numeric(precision=6, scale=2), nullable=True, comment='Скорость движения (км/ч)'),
        sa.Column('heading', sa.Numeric(precision=5, scale=2), nullable=True, comment='Направление движения (градусы)'),
        sa.Column('accuracy', sa.Numeric(precision=8, scale=2), nullable=True, comment='Точность определения местоположения (метры)'),
        sa.Column('source', sa.String(length=100), nullable=False, server_default='GLONASS', comment='Источник данных (GLONASS, GPS, телематика)'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True, comment='Дата создания записи'),
        sa.ForeignKeyConstraint(['vehicle_id'], ['vehicles.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_vehicle_location_vehicle_timestamp', 'vehicle_locations', ['vehicle_id', 'timestamp'], unique=False)
    op.create_index('idx_vehicle_location_timestamp', 'vehicle_locations', ['timestamp'], unique=False)
    op.create_index(op.f('ix_vehicle_locations_id'), 'vehicle_locations', ['id'], unique=False)
    op.create_index(op.f('ix_vehicle_locations_timestamp'), 'vehicle_locations', ['timestamp'], unique=False)
    op.create_index(op.f('ix_vehicle_locations_vehicle_id'), 'vehicle_locations', ['vehicle_id'], unique=False)
    op.create_index(op.f('ix_vehicle_locations_source'), 'vehicle_locations', ['source'], unique=False)

    # Создаем таблицу fuel_card_analysis_results
    op.create_table(
        'fuel_card_analysis_results',
        sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
        sa.Column('transaction_id', sa.Integer(), nullable=False, comment='ID транзакции по карте'),
        sa.Column('refuel_id', sa.Integer(), nullable=True, comment='ID заправки ТС (если найдено соответствие)'),
        sa.Column('fuel_card_id', sa.Integer(), nullable=True, comment='ID топливной карты'),
        sa.Column('vehicle_id', sa.Integer(), nullable=True, comment='ID транспортного средства'),
        sa.Column('analysis_date', sa.DateTime(), nullable=False, server_default=sa.text('now()'), comment='Дата проведения анализа'),
        sa.Column('match_status', sa.String(length=50), nullable=False, comment='Статус соответствия: matched, no_refuel, location_mismatch, quantity_mismatch, time_mismatch, multiple_matches'),
        sa.Column('match_confidence', sa.Numeric(precision=5, scale=2), nullable=True, comment='Уверенность в соответствии (0-100%)'),
        sa.Column('distance_to_azs', sa.Numeric(precision=10, scale=2), nullable=True, comment='Расстояние от ТС до АЗС в момент транзакции (метры)'),
        sa.Column('time_difference', sa.Integer(), nullable=True, comment='Разница во времени между транзакцией и заправкой (секунды)'),
        sa.Column('quantity_difference', sa.Numeric(precision=10, scale=2), nullable=True, comment='Разница в количестве топлива (литры)'),
        sa.Column('analysis_details', sa.Text(), nullable=True, comment='JSON с детальной информацией об анализе'),
        sa.Column('is_anomaly', sa.Boolean(), nullable=True, server_default='false', comment='Флаг аномалии (требует внимания)'),
        sa.Column('anomaly_type', sa.String(length=50), nullable=True, comment='Тип аномалии: fuel_theft, card_misuse, data_error, equipment_failure'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True, comment='Дата создания записи'),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True, comment='Дата обновления записи'),
        sa.ForeignKeyConstraint(['transaction_id'], ['transactions.id'], ),
        sa.ForeignKeyConstraint(['refuel_id'], ['vehicle_refuels.id'], ),
        sa.ForeignKeyConstraint(['fuel_card_id'], ['fuel_cards.id'], ),
        sa.ForeignKeyConstraint(['vehicle_id'], ['vehicles.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_fuel_card_analysis_transaction', 'fuel_card_analysis_results', ['transaction_id'], unique=False)
    op.create_index('idx_fuel_card_analysis_status', 'fuel_card_analysis_results', ['match_status', 'is_anomaly'], unique=False)
    op.create_index('idx_fuel_card_analysis_anomaly', 'fuel_card_analysis_results', ['is_anomaly', 'anomaly_type'], unique=False)
    op.create_index('idx_fuel_card_analysis_date', 'fuel_card_analysis_results', ['analysis_date'], unique=False)
    op.create_index(op.f('ix_fuel_card_analysis_results_id'), 'fuel_card_analysis_results', ['id'], unique=False)
    op.create_index(op.f('ix_fuel_card_analysis_results_transaction_id'), 'fuel_card_analysis_results', ['transaction_id'], unique=False)
    op.create_index(op.f('ix_fuel_card_analysis_results_match_status'), 'fuel_card_analysis_results', ['match_status'], unique=False)
    op.create_index(op.f('ix_fuel_card_analysis_results_is_anomaly'), 'fuel_card_analysis_results', ['is_anomaly'], unique=False)
    op.create_index(op.f('ix_fuel_card_analysis_results_anomaly_type'), 'fuel_card_analysis_results', ['anomaly_type'], unique=False)
    op.create_index(op.f('ix_fuel_card_analysis_results_analysis_date'), 'fuel_card_analysis_results', ['analysis_date'], unique=False)
    op.create_index(op.f('ix_fuel_card_analysis_results_refuel_id'), 'fuel_card_analysis_results', ['refuel_id'], unique=False)
    op.create_index(op.f('ix_fuel_card_analysis_results_fuel_card_id'), 'fuel_card_analysis_results', ['fuel_card_id'], unique=False)
    op.create_index(op.f('ix_fuel_card_analysis_results_vehicle_id'), 'fuel_card_analysis_results', ['vehicle_id'], unique=False)


def downgrade():
    # Удаляем таблицы в обратном порядке
    op.drop_index(op.f('ix_fuel_card_analysis_results_vehicle_id'), table_name='fuel_card_analysis_results')
    op.drop_index(op.f('ix_fuel_card_analysis_results_fuel_card_id'), table_name='fuel_card_analysis_results')
    op.drop_index(op.f('ix_fuel_card_analysis_results_refuel_id'), table_name='fuel_card_analysis_results')
    op.drop_index(op.f('ix_fuel_card_analysis_results_analysis_date'), table_name='fuel_card_analysis_results')
    op.drop_index(op.f('ix_fuel_card_analysis_results_anomaly_type'), table_name='fuel_card_analysis_results')
    op.drop_index(op.f('ix_fuel_card_analysis_results_is_anomaly'), table_name='fuel_card_analysis_results')
    op.drop_index(op.f('ix_fuel_card_analysis_results_match_status'), table_name='fuel_card_analysis_results')
    op.drop_index(op.f('ix_fuel_card_analysis_results_transaction_id'), table_name='fuel_card_analysis_results')
    op.drop_index(op.f('ix_fuel_card_analysis_results_id'), table_name='fuel_card_analysis_results')
    op.drop_index('idx_fuel_card_analysis_date', table_name='fuel_card_analysis_results')
    op.drop_index('idx_fuel_card_analysis_anomaly', table_name='fuel_card_analysis_results')
    op.drop_index('idx_fuel_card_analysis_status', table_name='fuel_card_analysis_results')
    op.drop_index('idx_fuel_card_analysis_transaction', table_name='fuel_card_analysis_results')
    op.drop_table('fuel_card_analysis_results')
    
    op.drop_index(op.f('ix_vehicle_locations_source'), table_name='vehicle_locations')
    op.drop_index(op.f('ix_vehicle_locations_vehicle_id'), table_name='vehicle_locations')
    op.drop_index(op.f('ix_vehicle_locations_timestamp'), table_name='vehicle_locations')
    op.drop_index(op.f('ix_vehicle_locations_id'), table_name='vehicle_locations')
    op.drop_index('idx_vehicle_location_timestamp', table_name='vehicle_locations')
    op.drop_index('idx_vehicle_location_vehicle_timestamp', table_name='vehicle_locations')
    op.drop_table('vehicle_locations')
    
    op.drop_index(op.f('ix_vehicle_refuels_source_id'), table_name='vehicle_refuels')
    op.drop_index(op.f('ix_vehicle_refuels_fuel_type'), table_name='vehicle_refuels')
    op.drop_index(op.f('ix_vehicle_refuels_vehicle_id'), table_name='vehicle_refuels')
    op.drop_index(op.f('ix_vehicle_refuels_refuel_date'), table_name='vehicle_refuels')
    op.drop_index(op.f('ix_vehicle_refuels_id'), table_name='vehicle_refuels')
    op.drop_index('idx_vehicle_refuel_source', table_name='vehicle_refuels')
    op.drop_index('idx_vehicle_refuel_vehicle_date', table_name='vehicle_refuels')
    op.drop_table('vehicle_refuels')
