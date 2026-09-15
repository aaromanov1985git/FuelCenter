"""Резервуары, замеры уровнемеров, лимиты карт и состояние загрузки из Топаза

Сливает две головы графа миграций (add_system_settings и 1216d34a1c28).
Таблицы создаются только если их ещё нет: при сбое alembic приложение
падает на Base.metadata.create_all, и таблицы могут уже существовать.

Revision ID: 20260914_000000
Revises: add_system_settings, 1216d34a1c28
Create Date: 2026-09-14 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '20260914_000000'
down_revision = ('add_system_settings', '1216d34a1c28')
branch_labels = None
depends_on = None


def _has_table(name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(name)


def upgrade() -> None:
    if not _has_table('tanks'):
        op.create_table(
            'tanks',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('provider_id', sa.Integer(), sa.ForeignKey('providers.id'), nullable=False, comment='ID провайдера'),
            sa.Column('template_id', sa.Integer(), sa.ForeignKey('provider_templates.id'), nullable=False, comment='Шаблон-источник подключения'),
            sa.Column('gas_station_id', sa.Integer(), sa.ForeignKey('gas_stations.id'), nullable=True, comment='АЗС в справочнике GSM'),
            sa.Column('azs_code', sa.String(50), nullable=False, comment='Код АЗС (торговой точки) в Топазе'),
            sa.Column('source_key', sa.String(100), nullable=False, comment='Ключ резервуара в источнике'),
            sa.Column('tank_number', sa.Integer(), comment='Номер ёмкости'),
            sa.Column('source_name', sa.String(200), comment='Наименование ёмкости в Топазе'),
            sa.Column('source_fuel', sa.String(100), comment='Вид топлива по данным Топаза'),
            sa.Column('fuel_type_override', sa.String(100), comment='Вид топлива, заданный вручную'),
            sa.Column('capacity_liters', sa.Numeric(12, 2), comment='Вместимость, л'),
            sa.Column('overflow_group', sa.String(50), comment='Группа перелива'),
            sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true(), comment='Учитывать ёмкость в остатках'),
            sa.Column('last_measured_at', sa.DateTime(), comment='Время последнего замера'),
            sa.Column('last_volume', sa.Numeric(12, 2), comment='Объём на последнем замере, л'),
            sa.Column('last_mass', sa.Numeric(12, 2), comment='Масса на последнем замере, кг'),
            sa.Column('last_density', sa.Numeric(8, 2), comment='Плотность на последнем замере'),
            sa.Column('last_temperature', sa.Numeric(6, 2), comment='Температура на последнем замере'),
            sa.Column('last_water', sa.Numeric(10, 2), comment='Подтоварная вода на последнем замере'),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
        )
        op.create_index('ix_tanks_id', 'tanks', ['id'])
        op.create_index('ix_tanks_provider_id', 'tanks', ['provider_id'])
        op.create_index('ix_tanks_template_id', 'tanks', ['template_id'])
        op.create_index('ix_tanks_gas_station_id', 'tanks', ['gas_station_id'])
        op.create_index('ix_tanks_azs_code', 'tanks', ['azs_code'])
        op.create_index('idx_tank_template_source', 'tanks', ['template_id', 'source_key'], unique=True)

    if not _has_table('tank_readings'):
        op.create_table(
            'tank_readings',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('tank_id', sa.Integer(), sa.ForeignKey('tanks.id', ondelete='CASCADE'), nullable=False),
            sa.Column('measured_at', sa.DateTime(), nullable=False),
            sa.Column('volume', sa.Numeric(12, 2)),
            sa.Column('mass', sa.Numeric(12, 2)),
            sa.Column('density', sa.Numeric(8, 2)),
            sa.Column('temperature', sa.Numeric(6, 2)),
            sa.Column('water', sa.Numeric(10, 2)),
            sa.Column('source_row_id', sa.BigInteger(), nullable=False),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        )
        op.create_index('ix_tank_readings_id', 'tank_readings', ['id'])
        op.create_index('idx_tank_reading_source', 'tank_readings', ['tank_id', 'source_row_id'], unique=True)
        op.create_index('idx_tank_reading_time', 'tank_readings', ['tank_id', 'measured_at'])

    if not _has_table('card_limits'):
        op.create_table(
            'card_limits',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('provider_id', sa.Integer(), sa.ForeignKey('providers.id'), nullable=False),
            sa.Column('template_id', sa.Integer(), sa.ForeignKey('provider_templates.id'), nullable=False),
            sa.Column('source_card_id', sa.Integer(), nullable=False),
            sa.Column('source_fuel_id', sa.Integer(), nullable=False),
            sa.Column('card_code', sa.String(50)),
            sa.Column('card_name', sa.String(200)),
            sa.Column('card_enabled', sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column('source_fuel', sa.String(100)),
            sa.Column('fuel_type', sa.String(100)),
            sa.Column('limit_type_id', sa.Integer()),
            sa.Column('limit_type_name', sa.String(100)),
            sa.Column('limit_liters', sa.Numeric(12, 2)),
            sa.Column('period', sa.Integer()),
            sa.Column('period_start', sa.DateTime()),
            sa.Column('used_liters', sa.Numeric(12, 2)),
            sa.Column('synced_at', sa.DateTime()),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
        )
        op.create_index('ix_card_limits_id', 'card_limits', ['id'])
        op.create_index('ix_card_limits_provider_id', 'card_limits', ['provider_id'])
        op.create_index('ix_card_limits_template_id', 'card_limits', ['template_id'])
        op.create_index('ix_card_limits_card_code', 'card_limits', ['card_code'])
        op.create_index('ix_card_limits_card_name', 'card_limits', ['card_name'])
        op.create_index('ix_card_limits_fuel_type', 'card_limits', ['fuel_type'])
        op.create_index('idx_card_limit_source', 'card_limits', ['template_id', 'source_card_id', 'source_fuel_id'], unique=True)

    if not _has_table('topaz_sync_states'):
        op.create_table(
            'topaz_sync_states',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('template_id', sa.Integer(), sa.ForeignKey('provider_templates.id'), nullable=False, unique=True),
            sa.Column('source_kind', sa.String(20)),
            sa.Column('last_tank_row_id', sa.BigInteger(), nullable=False, server_default='0'),
            sa.Column('last_run_at', sa.DateTime()),
            sa.Column('source_clock', sa.DateTime()),
            sa.Column('last_success_at', sa.DateTime()),
            sa.Column('last_status', sa.String(20)),
            sa.Column('last_error', sa.Text()),
            sa.Column('tanks_count', sa.Integer()),
            sa.Column('readings_added', sa.Integer()),
            sa.Column('limits_count', sa.Integer()),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
        )
        op.create_index('ix_topaz_sync_states_id', 'topaz_sync_states', ['id'])


def downgrade() -> None:
    for table in ('topaz_sync_states', 'card_limits', 'tank_readings', 'tanks'):
        if _has_table(table):
            op.drop_table(table)
