"""Add auto load settings to ProviderTemplate

Revision ID: add_auto_load_settings
Revises: add_firebird_connection
Create Date: 2024-12-10 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_auto_load_settings'
down_revision = 'add_firebird_connection'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Добавление полей автоматической загрузки в таблицу provider_templates
    """
    # Добавляем поле auto_load_enabled (включена ли автоматическая загрузка)
    op.add_column('provider_templates', sa.Column('auto_load_enabled', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    
    # Добавляем поле auto_load_schedule (расписание автоматической загрузки, cron-выражение)
    op.add_column('provider_templates', sa.Column('auto_load_schedule', sa.String(length=100), nullable=True))
    
    # Добавляем поле auto_load_date_from_offset (смещение в днях для начальной даты)
    op.add_column('provider_templates', sa.Column('auto_load_date_from_offset', sa.Integer(), nullable=False, server_default=sa.text('-7')))
    
    # Добавляем поле auto_load_date_to_offset (смещение в днях для конечной даты)
    op.add_column('provider_templates', sa.Column('auto_load_date_to_offset', sa.Integer(), nullable=False, server_default=sa.text('-1')))
    
    # Добавляем поле last_auto_load_date (дата и время последней автоматической загрузки)
    op.add_column('provider_templates', sa.Column('last_auto_load_date', sa.DateTime(), nullable=True))


def downgrade() -> None:
    """
    Откат изменений: удаление полей автоматической загрузки
    """
    op.drop_column('provider_templates', 'last_auto_load_date')
    op.drop_column('provider_templates', 'auto_load_date_to_offset')
    op.drop_column('provider_templates', 'auto_load_date_from_offset')
    op.drop_column('provider_templates', 'auto_load_schedule')
    op.drop_column('provider_templates', 'auto_load_enabled')

