"""Add Firebird connection support to ProviderTemplate

Revision ID: add_firebird_connection
Revises: 
Create Date: 2024-12-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_firebird_connection'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Добавление поддержки подключения к Firebird Database в таблицу provider_templates
    """
    # Добавляем поле connection_type (тип подключения: file или firebird)
    op.add_column('provider_templates', sa.Column('connection_type', sa.String(length=50), nullable=False, server_default='file'))
    
    # Добавляем поле connection_settings (настройки подключения к БД в формате JSON)
    op.add_column('provider_templates', sa.Column('connection_settings', sa.Text(), nullable=True))
    
    # Добавляем поле source_table (имя таблицы в БД Firebird)
    op.add_column('provider_templates', sa.Column('source_table', sa.String(length=200), nullable=True))
    
    # Добавляем поле source_query (SQL запрос для получения данных)
    op.add_column('provider_templates', sa.Column('source_query', sa.Text(), nullable=True))


def downgrade() -> None:
    """
    Откат изменений: удаление полей поддержки Firebird
    """
    op.drop_column('provider_templates', 'source_query')
    op.drop_column('provider_templates', 'source_table')
    op.drop_column('provider_templates', 'connection_settings')
    op.drop_column('provider_templates', 'connection_type')

