"""add_organization_id_to_fuel_cards_and_set_null_on_delete

Revision ID: 06a0c1992c7d
Revises: 20251214_000000
Create Date: 2025-12-14 15:05:58.876865

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '06a0c1992c7d'
down_revision = '20251214_000000'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Добавляем organization_id в таблицу fuel_cards
    op.add_column('fuel_cards', sa.Column('organization_id', sa.Integer(), nullable=True))
    
    # Создаем внешний ключ с ondelete='SET NULL'
    op.create_foreign_key(
        'fk_fuel_cards_organization_id',
        'fuel_cards',
        'organizations',
        ['organization_id'],
        ['id'],
        ondelete='SET NULL'
    )
    
    # Создаем индекс
    op.create_index('ix_fuel_cards_organization_id', 'fuel_cards', ['organization_id'])
    
    # Обновляем существующие ForeignKey для organizations, чтобы они использовали ondelete='SET NULL'
    # Для vehicles
    op.drop_constraint('fk_vehicles_organization_id', 'vehicles', type_='foreignkey')
    op.create_foreign_key(
        'fk_vehicles_organization_id',
        'vehicles',
        'organizations',
        ['organization_id'],
        ['id'],
        ondelete='SET NULL'
    )
    
    # Для providers
    op.drop_constraint('fk_providers_organization_id', 'providers', type_='foreignkey')
    op.create_foreign_key(
        'fk_providers_organization_id',
        'providers',
        'organizations',
        ['organization_id'],
        ['id'],
        ondelete='SET NULL'
    )
    
    # Для transactions (если organization_id nullable)
    # Проверяем, существует ли constraint
    op.execute("""
        DO $$ 
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.table_constraints 
                WHERE constraint_name = 'transactions_organization_id_fkey'
            ) THEN
                ALTER TABLE transactions DROP CONSTRAINT transactions_organization_id_fkey;
                ALTER TABLE transactions ADD CONSTRAINT transactions_organization_id_fkey 
                    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL;
            END IF;
        END $$;
    """)


def downgrade() -> None:
    # Удаляем индекс и внешний ключ для fuel_cards (если существуют)
    op.execute("""
        DO $$ 
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_indexes 
                WHERE indexname = 'ix_fuel_cards_organization_id'
            ) THEN
                DROP INDEX ix_fuel_cards_organization_id;
            END IF;
        END $$;
    """)
    op.execute("""
        DO $$ 
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.table_constraints 
                WHERE constraint_name = 'fk_fuel_cards_organization_id'
            ) THEN
                ALTER TABLE fuel_cards DROP CONSTRAINT fk_fuel_cards_organization_id;
            END IF;
        END $$;
    """)
    op.execute("""
        DO $$ 
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'fuel_cards' AND column_name = 'organization_id'
            ) THEN
                ALTER TABLE fuel_cards DROP COLUMN organization_id;
            END IF;
        END $$;
    """)
    
    # Восстанавливаем старые ForeignKey (без ondelete)
    op.drop_constraint('fk_vehicles_organization_id', 'vehicles', type_='foreignkey')
    op.create_foreign_key(
        'fk_vehicles_organization_id',
        'vehicles',
        'organizations',
        ['organization_id'],
        ['id']
    )
    
    op.drop_constraint('fk_providers_organization_id', 'providers', type_='foreignkey')
    op.create_foreign_key(
        'fk_providers_organization_id',
        'providers',
        'organizations',
        ['organization_id'],
        ['id']
    )
