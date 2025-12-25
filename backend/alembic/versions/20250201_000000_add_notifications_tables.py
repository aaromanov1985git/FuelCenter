"""Add notifications tables

Revision ID: add_notifications_tables
Revises: add_name_to_gas_stations
Create Date: 2025-02-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import func


# revision identifiers, used by Alembic.
revision = 'add_notifications_tables'
down_revision = '20250131_000004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Создание таблиц для системы уведомлений
    """
    # Таблица настроек уведомлений
    op.create_table(
        'notification_settings',
        sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('email_enabled', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('telegram_enabled', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('push_enabled', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('in_app_enabled', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('telegram_chat_id', sa.String(length=100), nullable=True),
        sa.Column('telegram_username', sa.String(length=100), nullable=True),
        sa.Column('push_subscription', sa.Text(), nullable=True),
        sa.Column('categories', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=func.now(), onupdate=func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE')
    )
    
    # Индексы для notification_settings
    op.create_index('idx_notification_settings_user', 'notification_settings', ['user_id'], unique=True)
    op.create_index(op.f('ix_notification_settings_id'), 'notification_settings', ['id'], unique=False)
    op.create_index('ix_notification_settings_telegram_chat_id', 'notification_settings', ['telegram_chat_id'], unique=False)
    
    # Таблица уведомлений
    op.create_table(
        'notifications',
        sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('category', sa.String(length=100), nullable=True),
        sa.Column('type', sa.String(length=50), nullable=False, server_default='info'),
        sa.Column('delivery_status', sa.Text(), nullable=True),
        sa.Column('is_read', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('read_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=func.now()),
        sa.Column('entity_type', sa.String(length=100), nullable=True),
        sa.Column('entity_id', sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE')
    )
    
    # Индексы для notifications
    op.create_index('idx_notifications_user_created', 'notifications', ['user_id', 'created_at'], unique=False)
    op.create_index('idx_notifications_user_read', 'notifications', ['user_id', 'is_read'], unique=False)
    op.create_index('idx_notifications_category', 'notifications', ['category'], unique=False)
    op.create_index('idx_notifications_type', 'notifications', ['type'], unique=False)
    op.create_index(op.f('ix_notifications_id'), 'notifications', ['id'], unique=False)
    op.create_index(op.f('ix_notifications_user_id'), 'notifications', ['user_id'], unique=False)
    op.create_index(op.f('ix_notifications_is_read'), 'notifications', ['is_read'], unique=False)
    op.create_index(op.f('ix_notifications_category'), 'notifications', ['category'], unique=False)
    op.create_index(op.f('ix_notifications_type'), 'notifications', ['type'], unique=False)
    op.create_index(op.f('ix_notifications_entity_type'), 'notifications', ['entity_type'], unique=False)
    op.create_index(op.f('ix_notifications_entity_id'), 'notifications', ['entity_id'], unique=False)
    op.create_index(op.f('ix_notifications_created_at'), 'notifications', ['created_at'], unique=False)


def downgrade() -> None:
    """
    Откат изменений: удаление таблиц уведомлений
    """
    # Удаляем индексы для notifications
    op.drop_index(op.f('ix_notifications_created_at'), table_name='notifications')
    op.drop_index(op.f('ix_notifications_entity_id'), table_name='notifications')
    op.drop_index(op.f('ix_notifications_entity_type'), table_name='notifications')
    op.drop_index(op.f('ix_notifications_type'), table_name='notifications')
    op.drop_index(op.f('ix_notifications_category'), table_name='notifications')
    op.drop_index(op.f('ix_notifications_is_read'), table_name='notifications')
    op.drop_index(op.f('ix_notifications_user_id'), table_name='notifications')
    op.drop_index(op.f('ix_notifications_id'), table_name='notifications')
    op.drop_index('idx_notifications_type', table_name='notifications')
    op.drop_index('idx_notifications_category', table_name='notifications')
    op.drop_index('idx_notifications_user_read', table_name='notifications')
    op.drop_index('idx_notifications_user_created', table_name='notifications')
    
    # Удаляем таблицу notifications
    op.drop_table('notifications')
    
    # Удаляем индексы для notification_settings
    op.drop_index('ix_notification_settings_telegram_chat_id', table_name='notification_settings')
    op.drop_index(op.f('ix_notification_settings_id'), table_name='notification_settings')
    op.drop_index('idx_notification_settings_user', table_name='notification_settings')
    
    # Удаляем таблицу notification_settings
    op.drop_table('notification_settings')

