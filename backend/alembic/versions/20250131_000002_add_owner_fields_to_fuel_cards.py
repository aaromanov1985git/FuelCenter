"""add owner fields to fuel_cards

Revision ID: 20250131_000002
Revises: ('20251218_000000', 'b0ba1c251f50')
Create Date: 2025-01-31 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20250131_000002'
down_revision = ('20251218_000000', 'b0ba1c251f50')
branch_labels = None
depends_on = None


def upgrade():
    # Добавляем поле original_owner_name в fuel_cards
    op.add_column('fuel_cards', sa.Column('original_owner_name', sa.String(length=200), nullable=True, comment='Исходное наименование Владельца'))
    
    # Добавляем поле normalized_owner в fuel_cards с индексом
    op.add_column('fuel_cards', sa.Column('normalized_owner', sa.String(length=200), nullable=True, comment='Нормализованный владелец'))
    
    # Создаем индекс для normalized_owner
    op.create_index('ix_fuel_cards_normalized_owner', 'fuel_cards', ['normalized_owner'])


def downgrade():
    # Удаляем индекс
    op.drop_index('ix_fuel_cards_normalized_owner', table_name='fuel_cards')
    
    # Удаляем поля
    op.drop_column('fuel_cards', 'normalized_owner')
    op.drop_column('fuel_cards', 'original_owner_name')
