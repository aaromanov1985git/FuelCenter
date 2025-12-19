"""add card_info_schedules table

Revision ID: 20250131_000004
Revises: 20250131_000003
Create Date: 2025-01-31 15:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20250131_000004'
down_revision = '20250131_000003'
branch_labels = None
depends_on = None


def upgrade():
    # Создаем таблицу card_info_schedules
    op.create_table(
        'card_info_schedules',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False, comment='Название регламента'),
        sa.Column('description', sa.String(length=500), nullable=True, comment='Описание регламента'),
        sa.Column('provider_template_id', sa.Integer(), nullable=False, comment='ID шаблона провайдера'),
        sa.Column('schedule', sa.String(length=100), nullable=False, comment='Расписание (cron-выражение)'),
        sa.Column('filter_options', sa.Text(), nullable=True, comment='JSON фильтр карт для обработки'),
        sa.Column('auto_update', sa.Boolean(), nullable=True, server_default='true', comment='Автоматически обновлять карты'),
        sa.Column('flags', sa.Integer(), nullable=True, server_default='23', comment='Флаги реквизитов для запроса'),
        sa.Column('is_active', sa.Boolean(), nullable=True, server_default='true', comment='Активен'),
        sa.Column('last_run_date', sa.DateTime(), nullable=True, comment='Дата и время последнего выполнения'),
        sa.Column('last_run_result', sa.Text(), nullable=True, comment='JSON результат последнего выполнения'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True, comment='Дата создания'),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True, comment='Дата обновления'),
        sa.ForeignKeyConstraint(['provider_template_id'], ['provider_templates.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Создаем индексы
    op.create_index('idx_card_info_schedules_template', 'card_info_schedules', ['provider_template_id'])
    op.create_index('idx_card_info_schedules_active', 'card_info_schedules', ['is_active'])


def downgrade():
    # Удаляем индексы
    op.drop_index('idx_card_info_schedules_active', table_name='card_info_schedules')
    op.drop_index('idx_card_info_schedules_template', table_name='card_info_schedules')
    
    # Удаляем таблицу
    op.drop_table('card_info_schedules')
