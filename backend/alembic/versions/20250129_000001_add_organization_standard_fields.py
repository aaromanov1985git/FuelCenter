"""add organization standard fields

Revision ID: 20250129_000001
Revises: 20250129_000000
Create Date: 2025-01-29 00:00:01.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '20250129_000001'
down_revision = '20250129_000000'
branch_labels = None
depends_on = None


def upgrade():
    # Добавляем стандартные поля организации
    op.add_column('organizations', sa.Column('inn', sa.String(length=20), nullable=True))
    op.add_column('organizations', sa.Column('kpp', sa.String(length=20), nullable=True))
    op.add_column('organizations', sa.Column('ogrn', sa.String(length=20), nullable=True))
    op.add_column('organizations', sa.Column('legal_address', sa.String(length=500), nullable=True))
    op.add_column('organizations', sa.Column('actual_address', sa.String(length=500), nullable=True))
    op.add_column('organizations', sa.Column('phone', sa.String(length=50), nullable=True))
    op.add_column('organizations', sa.Column('email', sa.String(length=255), nullable=True))
    op.add_column('organizations', sa.Column('website', sa.String(length=255), nullable=True))
    op.add_column('organizations', sa.Column('contact_person', sa.String(length=200), nullable=True))
    op.add_column('organizations', sa.Column('contact_phone', sa.String(length=50), nullable=True))
    op.add_column('organizations', sa.Column('bank_name', sa.String(length=200), nullable=True))
    op.add_column('organizations', sa.Column('bank_account', sa.String(length=50), nullable=True))
    op.add_column('organizations', sa.Column('bank_bik', sa.String(length=20), nullable=True))
    op.add_column('organizations', sa.Column('bank_correspondent_account', sa.String(length=50), nullable=True))
    
    # Создаем индексы для часто используемых полей
    op.create_index(op.f('ix_organizations_inn'), 'organizations', ['inn'], unique=False)
    op.create_index(op.f('ix_organizations_email'), 'organizations', ['email'], unique=False)


def downgrade():
    # Удаляем индексы
    op.drop_index(op.f('ix_organizations_email'), table_name='organizations')
    op.drop_index(op.f('ix_organizations_inn'), table_name='organizations')
    
    # Удаляем колонки
    op.drop_column('organizations', 'bank_correspondent_account')
    op.drop_column('organizations', 'bank_bik')
    op.drop_column('organizations', 'bank_account')
    op.drop_column('organizations', 'bank_name')
    op.drop_column('organizations', 'contact_phone')
    op.drop_column('organizations', 'contact_person')
    op.drop_column('organizations', 'website')
    op.drop_column('organizations', 'email')
    op.drop_column('organizations', 'phone')
    op.drop_column('organizations', 'actual_address')
    op.drop_column('organizations', 'legal_address')
    op.drop_column('organizations', 'ogrn')
    op.drop_column('organizations', 'kpp')
    op.drop_column('organizations', 'inn')
