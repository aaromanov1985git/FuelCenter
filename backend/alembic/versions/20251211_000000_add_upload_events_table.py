"""add upload_events table

Revision ID: 20251211_000000
Revises: 20250128_000000
Create Date: 2025-12-11 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import func


# revision identifiers, used by Alembic.
revision = '20251211_000000'
down_revision = '20250128_000000'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'upload_events',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('source_type', sa.String(length=20), nullable=False, server_default='manual'),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='success'),
        sa.Column('is_scheduled', sa.Boolean(), nullable=True, server_default=sa.text('false')),
        sa.Column('provider_id', sa.Integer(), nullable=True),
        sa.Column('template_id', sa.Integer(), nullable=True),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('file_name', sa.String(length=500), nullable=True),
        sa.Column('username', sa.String(length=100), nullable=True),
        sa.Column('transactions_total', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('transactions_created', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('transactions_skipped', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('transactions_failed', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('duration_ms', sa.Integer(), nullable=True),
        sa.Column('message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=func.now(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=func.now(), nullable=True, onupdate=func.now()),
        sa.ForeignKeyConstraint(['provider_id'], ['providers.id']),
        sa.ForeignKeyConstraint(['template_id'], ['provider_templates.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
    )

    # Индексы
    op.create_index('idx_upload_events_created_at', 'upload_events', ['created_at'], unique=False)
    op.create_index('idx_upload_events_status', 'upload_events', ['status'], unique=False)
    op.create_index('idx_upload_events_source', 'upload_events', ['source_type'], unique=False)
    op.create_index('idx_upload_events_scheduled', 'upload_events', ['is_scheduled'], unique=False)
    op.create_index(op.f('ix_upload_events_id'), 'upload_events', ['id'], unique=False)
    op.create_index(op.f('ix_upload_events_provider_id'), 'upload_events', ['provider_id'], unique=False)
    op.create_index(op.f('ix_upload_events_template_id'), 'upload_events', ['template_id'], unique=False)
    op.create_index(op.f('ix_upload_events_user_id'), 'upload_events', ['user_id'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_upload_events_user_id'), table_name='upload_events')
    op.drop_index(op.f('ix_upload_events_template_id'), table_name='upload_events')
    op.drop_index(op.f('ix_upload_events_provider_id'), table_name='upload_events')
    op.drop_index(op.f('ix_upload_events_id'), table_name='upload_events')
    op.drop_index('idx_upload_events_scheduled', table_name='upload_events')
    op.drop_index('idx_upload_events_source', table_name='upload_events')
    op.drop_index('idx_upload_events_status', table_name='upload_events')
    op.drop_index('idx_upload_events_created_at', table_name='upload_events')
    op.drop_table('upload_events')
