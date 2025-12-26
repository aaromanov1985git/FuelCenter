"""Add performance indexes

Revision ID: add_performance_indexes
Revises: 
Create Date: 2025-12-26

Добавление индексов для оптимизации производительности запросов
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_performance_indexes'
down_revision = None  # Измените на ID предыдущей миграции
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Добавление индексов для оптимизации"""
    
    # Индексы для таблицы transactions (основная таблица, часто запрашивается)
    
    # Составной индекс для фильтрации по дате и провайдеру (частый запрос)
    op.create_index(
        'idx_transactions_date_provider',
        'transactions',
        ['transaction_date', 'provider_id'],
        if_not_exists=True
    )
    
    # Индекс для поиска по номеру карты
    op.create_index(
        'idx_transactions_card_number',
        'transactions',
        ['card_number'],
        if_not_exists=True
    )
    
    # Индекс для фильтрации по ТС
    op.create_index(
        'idx_transactions_vehicle_id',
        'transactions',
        ['vehicle_id'],
        if_not_exists=True
    )
    
    # Составной индекс для сортировки и пагинации
    op.create_index(
        'idx_transactions_date_desc_id',
        'transactions',
        [sa.text('transaction_date DESC'), 'id'],
        if_not_exists=True
    )
    
    # Индексы для таблицы fuel_cards
    
    # Индекс по номеру карты (уникальный индекс уже есть в модели, создаем обычный)
    # Проверяем существование перед созданием
    try:
        op.create_index(
            'idx_fuel_cards_card_number_lookup',
            'fuel_cards',
            ['card_number'],
            if_not_exists=True
        )
    except Exception:
        pass  # Игнорируем если индекс уже существует
    
    # Индекс для поиска карт провайдера
    op.create_index(
        'idx_fuel_cards_provider',
        'fuel_cards',
        ['provider_id'],
        if_not_exists=True
    )
    
    # Индексы для таблицы vehicles
    
    # Индекс по государственному номеру
    op.create_index(
        'idx_vehicles_license_plate',
        'vehicles',
        ['license_plate'],
        if_not_exists=True
    )
    
    # Индексы для таблицы gas_stations
    
    # Индекс для поиска по названию (для автодополнения)
    op.create_index(
        'idx_gas_stations_name',
        'gas_stations',
        ['name'],
        if_not_exists=True
    )
    
    # Индекс для поиска по провайдеру
    op.create_index(
        'idx_gas_stations_provider',
        'gas_stations',
        ['provider_id'],
        if_not_exists=True
    )
    
    # Индексы для логов (если таблицы существуют)
    # Используем try/except для безопасного создания индексов
    # Индекс для фильтрации системных логов по дате и уровню
    try:
        op.create_index(
            'idx_system_logs_timestamp_level',
            'system_logs',
            ['created_at', 'level'],
            if_not_exists=True
        )
    except Exception:
        pass  # Игнорируем если таблица/колонки не существуют
    
    # Индекс для логов действий пользователей
    try:
        op.create_index(
            'idx_user_action_logs_user_timestamp',
            'user_action_logs',
            ['user_id', 'created_at'],
            if_not_exists=True
        )
    except Exception:
        pass
    
    # Индекс для поиска по типу действия
    try:
        op.create_index(
            'idx_user_action_logs_action_type',
            'user_action_logs',
            ['action_type', 'created_at'],
            if_not_exists=True
        )
    except Exception:
        pass


def downgrade() -> None:
    """Удаление индексов"""
    
    # Transactions
    op.drop_index('idx_transactions_date_provider', table_name='transactions', if_exists=True)
    op.drop_index('idx_transactions_card_number', table_name='transactions', if_exists=True)
    op.drop_index('idx_transactions_vehicle_id', table_name='transactions', if_exists=True)
    op.drop_index('idx_transactions_date_desc_id', table_name='transactions', if_exists=True)
    
    # Fuel cards
    op.drop_index('idx_fuel_cards_card_number', table_name='fuel_cards', if_exists=True)
    op.drop_index('idx_fuel_cards_provider', table_name='fuel_cards', if_exists=True)
    
    # Vehicles
    op.drop_index('idx_vehicles_license_plate', table_name='vehicles', if_exists=True)
    
    # Gas stations
    op.drop_index('idx_gas_stations_name', table_name='gas_stations', if_exists=True)
    op.drop_index('idx_gas_stations_provider', table_name='gas_stations', if_exists=True)
    
    # Logs
    op.drop_index('idx_system_logs_timestamp_level', table_name='system_logs', if_exists=True)
    op.drop_index('idx_user_action_logs_user_timestamp', table_name='user_action_logs', if_exists=True)
    op.drop_index('idx_user_action_logs_action_type', table_name='user_action_logs', if_exists=True)

