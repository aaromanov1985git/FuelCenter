"""add logging tables

Revision ID: 20250130_000000
Revises: 20250129_000001
Create Date: 2025-01-30 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20250130_000000'
down_revision = '20250129_000001'
branch_labels = None
depends_on = None


def upgrade():
    # Создаем таблицу system_logs
    op.create_table(
        'system_logs',
        sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
        sa.Column('level', sa.String(length=20), nullable=False, comment='Уровень: DEBUG, INFO, WARNING, ERROR, CRITICAL'),
        sa.Column('message', sa.Text(), nullable=False, comment='Сообщение лога'),
        sa.Column('module', sa.String(length=200), nullable=True, comment='Модуль, где произошло событие'),
        sa.Column('function', sa.String(length=200), nullable=True, comment='Функция, где произошло событие'),
        sa.Column('line_number', sa.Integer(), nullable=True, comment='Номер строки кода'),
        sa.Column('event_type', sa.String(length=100), nullable=True, comment='Тип события: request, database, service, scheduler, etc.'),
        sa.Column('event_category', sa.String(length=100), nullable=True, comment='Категория: auth, upload, transaction, etc.'),
        sa.Column('extra_data', sa.Text(), nullable=True, comment='Дополнительные данные в формате JSON'),
        sa.Column('exception_type', sa.String(length=200), nullable=True, comment='Тип исключения'),
        sa.Column('exception_message', sa.Text(), nullable=True, comment='Сообщение исключения'),
        sa.Column('stack_trace', sa.Text(), nullable=True, comment='Трассировка стека'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True, comment='Дата и время создания'),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Создаем индексы для system_logs
    op.create_index('idx_system_logs_created_at', 'system_logs', ['created_at'], unique=False)
    op.create_index('idx_system_logs_level', 'system_logs', ['level'], unique=False)
    op.create_index('idx_system_logs_event_type', 'system_logs', ['event_type'], unique=False)
    op.create_index('idx_system_logs_event_category', 'system_logs', ['event_category'], unique=False)
    op.create_index('idx_system_logs_level_created', 'system_logs', ['level', 'created_at'], unique=False)
    op.create_index(op.f('ix_system_logs_id'), 'system_logs', ['id'], unique=False)
    
    # Создаем таблицу user_action_logs
    op.create_table(
        'user_action_logs',
        sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
        sa.Column('user_id', sa.Integer(), nullable=True, comment='ID пользователя'),
        sa.Column('username', sa.String(length=100), nullable=True, comment='Имя пользователя (на случай удаления пользователя)'),
        sa.Column('action_type', sa.String(length=100), nullable=False, comment='Тип действия: login, logout, create, update, delete, view, export, etc.'),
        sa.Column('action_category', sa.String(length=100), nullable=True, comment='Категория: auth, transaction, vehicle, organization, etc.'),
        sa.Column('action_description', sa.Text(), nullable=False, comment='Описание действия'),
        sa.Column('entity_type', sa.String(length=100), nullable=True, comment='Тип сущности: Transaction, Vehicle, Organization, etc.'),
        sa.Column('entity_id', sa.Integer(), nullable=True, comment='ID сущности'),
        sa.Column('request_data', sa.Text(), nullable=True, comment='Данные запроса в формате JSON'),
        sa.Column('response_data', sa.Text(), nullable=True, comment='Данные ответа в формате JSON'),
        sa.Column('changes', sa.Text(), nullable=True, comment='Изменения (для update операций) в формате JSON'),
        sa.Column('ip_address', sa.String(length=50), nullable=True, comment='IP адрес пользователя'),
        sa.Column('user_agent', sa.String(length=500), nullable=True, comment='User-Agent браузера'),
        sa.Column('request_method', sa.String(length=10), nullable=True, comment='HTTP метод'),
        sa.Column('request_path', sa.String(length=500), nullable=True, comment='Путь запроса'),
        sa.Column('status', sa.String(length=20), server_default='success', nullable=True, comment='Статус: success, failed, partial'),
        sa.Column('error_message', sa.Text(), nullable=True, comment='Сообщение об ошибке (если есть)'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True, comment='Дата и время создания'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Создаем индексы для user_action_logs
    op.create_index('idx_user_action_logs_created_at', 'user_action_logs', ['created_at'], unique=False)
    op.create_index('idx_user_action_logs_user_id', 'user_action_logs', ['user_id'], unique=False)
    op.create_index('idx_user_action_logs_action_type', 'user_action_logs', ['action_type'], unique=False)
    op.create_index('idx_user_action_logs_entity_type', 'user_action_logs', ['entity_type'], unique=False)
    op.create_index('idx_user_action_logs_status', 'user_action_logs', ['status'], unique=False)
    op.create_index('idx_user_action_logs_user_created', 'user_action_logs', ['user_id', 'created_at'], unique=False)
    op.create_index(op.f('ix_user_action_logs_id'), 'user_action_logs', ['id'], unique=False)
    op.create_index(op.f('ix_user_action_logs_username'), 'user_action_logs', ['username'], unique=False)


def downgrade():
    # Удаляем индексы для user_action_logs
    op.drop_index(op.f('ix_user_action_logs_username'), table_name='user_action_logs')
    op.drop_index(op.f('ix_user_action_logs_id'), table_name='user_action_logs')
    op.drop_index('idx_user_action_logs_user_created', table_name='user_action_logs')
    op.drop_index('idx_user_action_logs_status', table_name='user_action_logs')
    op.drop_index('idx_user_action_logs_entity_type', table_name='user_action_logs')
    op.drop_index('idx_user_action_logs_action_type', table_name='user_action_logs')
    op.drop_index('idx_user_action_logs_user_id', table_name='user_action_logs')
    op.drop_index('idx_user_action_logs_created_at', table_name='user_action_logs')
    
    # Удаляем таблицу user_action_logs
    op.drop_table('user_action_logs')
    
    # Удаляем индексы для system_logs
    op.drop_index(op.f('ix_system_logs_id'), table_name='system_logs')
    op.drop_index('idx_system_logs_level_created', table_name='system_logs')
    op.drop_index('idx_system_logs_event_category', table_name='system_logs')
    op.drop_index('idx_system_logs_event_type', table_name='system_logs')
    op.drop_index('idx_system_logs_level', table_name='system_logs')
    op.drop_index('idx_system_logs_created_at', table_name='system_logs')
    
    # Удаляем таблицу system_logs
    op.drop_table('system_logs')
