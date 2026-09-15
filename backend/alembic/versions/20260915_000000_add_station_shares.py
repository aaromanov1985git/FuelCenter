"""Общие ссылки на просмотр АЗС без входа

Таблица создаётся только если её ещё нет: при сбое alembic приложение
падает на Base.metadata.create_all, и таблица может уже существовать.

Revision ID: 20260915_000000
Revises: 20260914_000000
Create Date: 2026-09-15 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = '20260915_000000'
down_revision = '20260914_000000'
branch_labels = None
depends_on = None


def upgrade() -> None:
    if sa.inspect(op.get_bind()).has_table('station_shares'):
        return
    op.create_table(
        'station_shares',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('token', sa.String(64), nullable=False),
        sa.Column('provider_id', sa.Integer(), sa.ForeignKey('providers.id'), nullable=False),
        sa.Column('azs_code', sa.String(50), nullable=False),
        sa.Column('note', sa.String(200)),
        sa.Column('show_tanks', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('show_fills', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('show_limits', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('revoked_at', sa.DateTime()),
        sa.Column('created_by_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_by_name', sa.String(100)),
        sa.Column('open_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('last_opened_at', sa.DateTime()),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index('ix_station_shares_id', 'station_shares', ['id'])
    op.create_index('ix_station_shares_token', 'station_shares', ['token'], unique=True)
    op.create_index('ix_station_shares_provider_id', 'station_shares', ['provider_id'])
    op.create_index('ix_station_shares_azs_code', 'station_shares', ['azs_code'])


def downgrade() -> None:
    if sa.inspect(op.get_bind()).has_table('station_shares'):
        op.drop_table('station_shares')
