"""remove_organization_id_from_fuel_cards

Revision ID: b0ba1c251f50
Revises: 06a0c1992c7d
Create Date: 2025-12-14 15:13:13.479384

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b0ba1c251f50'
down_revision = '06a0c1992c7d'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Удаляем индекс
    op.drop_index('ix_fuel_cards_organization_id', table_name='fuel_cards')
    
    # Удаляем внешний ключ
    op.drop_constraint('fk_fuel_cards_organization_id', 'fuel_cards', type_='foreignkey')
    
    # Удаляем колонку
    op.drop_column('fuel_cards', 'organization_id')


def downgrade() -> None:
    # Восстанавливаем колонку
    op.add_column('fuel_cards', sa.Column('organization_id', sa.Integer(), nullable=True))
    
    # Восстанавливаем внешний ключ
    op.create_foreign_key(
        'fk_fuel_cards_organization_id',
        'fuel_cards',
        'organizations',
        ['organization_id'],
        ['id'],
        ondelete='SET NULL'
    )
    
    # Восстанавливаем индекс
    op.create_index('ix_fuel_cards_organization_id', 'fuel_cards', ['organization_id'])
