"""add normalization_settings table

Revision ID: 20250131_000003
Revises: 20250131_000002
Create Date: 2025-01-31 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20250131_000003'
down_revision = '20250131_000002'
branch_labels = None
depends_on = None


def upgrade():
    # Создаем таблицу normalization_settings
    op.create_table(
        'normalization_settings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('dictionary_type', sa.String(length=50), nullable=False, comment='Тип справочника'),
        sa.Column('options', sa.Text(), nullable=True, comment='JSON настройки нормализации'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True, comment='Дата создания'),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True, comment='Дата обновления'),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Создаем индексы
    op.create_index('idx_normalization_settings_type', 'normalization_settings', ['dictionary_type'], unique=True)
    
    # Создаем начальные настройки по умолчанию для fuel_card_owner
    op.execute("""
        INSERT INTO normalization_settings (dictionary_type, options, created_at, updated_at)
        VALUES (
            'fuel_card_owner',
            '{"case": "preserve", "remove_special_chars": false, "remove_extra_spaces": true, "trim": true, "priority_license_plate": true, "priority_garage_number": true, "min_garage_number_length": 2, "max_garage_number_length": 10, "remove_chars": []}',
            now(),
            now()
        )
    """)


def downgrade():
    # Удаляем индексы
    op.drop_index('idx_normalization_settings_type', table_name='normalization_settings')
    
    # Удаляем таблицу
    op.drop_table('normalization_settings')
