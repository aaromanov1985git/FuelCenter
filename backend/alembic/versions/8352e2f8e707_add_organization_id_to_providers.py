"""add_organization_id_to_providers

Revision ID: 8352e2f8e707
Revises: 20250130_000000
Create Date: 2025-12-13 19:03:16.939768

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '8352e2f8e707'
down_revision = '20250130_000000'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Добавляем поле organization_id в таблицу providers
    op.add_column('providers', sa.Column('organization_id', sa.Integer(), nullable=True))
    
    # Добавляем внешний ключ
    op.create_foreign_key(
        'fk_providers_organization_id',
        'providers',
        'organizations',
        ['organization_id'],
        ['id']
    )
    
    # Добавляем индекс для быстрого поиска
    op.create_index('ix_providers_organization_id', 'providers', ['organization_id'])


def downgrade() -> None:
    # Удаляем индекс
    op.drop_index('ix_providers_organization_id', table_name='providers')
    
    # Удаляем внешний ключ
    op.drop_constraint('fk_providers_organization_id', 'providers', type_='foreignkey')
    
    # Удаляем поле
    op.drop_column('providers', 'organization_id')
