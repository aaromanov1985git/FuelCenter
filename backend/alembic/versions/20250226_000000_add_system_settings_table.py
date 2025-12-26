"""Add system_settings table

Revision ID: add_system_settings
Revises: add_notifications_tables
Create Date: 2025-02-26 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import func


# revision identifiers, used by Alembic.
revision = 'add_system_settings'
down_revision = 'add_notifications_tables'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Создание таблицы системных настроек
    """
    op.create_table(
        'system_settings',
        sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
        sa.Column('key', sa.String(length=100), nullable=False),
        sa.Column('value', sa.Text(), nullable=True),
        sa.Column('is_encrypted', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('description', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=func.now(), onupdate=func.now()),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Индексы
    op.create_index('ix_system_settings_id', 'system_settings', ['id'], unique=False)
    op.create_index('ix_system_settings_key', 'system_settings', ['key'], unique=True)


def downgrade() -> None:
    """
    Удаление таблицы системных настроек
    """
    op.drop_index('ix_system_settings_key', table_name='system_settings')
    op.drop_index('ix_system_settings_id', table_name='system_settings')
    op.drop_table('system_settings')

