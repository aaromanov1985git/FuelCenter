"""
Модели базы данных для транзакций ГСМ
"""
from sqlalchemy import Column, Integer, String, Numeric, DateTime, Date, Index, ForeignKey, Text, Boolean, Table
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

# Таблица связи many-to-many между пользователями и организациями
user_organizations = Table(
    'user_organizations',
    Base.metadata,
    Column('user_id', Integer, ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
    Column('organization_id', Integer, ForeignKey('organizations.id', ondelete='CASCADE'), primary_key=True),
    Index('idx_user_organizations_user', 'user_id'),
    Index('idx_user_organizations_org', 'organization_id'),
)


class Transaction(Base):
    """
    Модель транзакции ГСМ
    """
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Основные поля
    transaction_date = Column(DateTime, nullable=False, index=True, comment="Дата и время транзакции")
    card_number = Column(String(50), index=True, comment="Номер карты")
    vehicle = Column(String(200), comment="Закреплена за (транспортное средство) - исходное название")
    vehicle_id = Column(Integer, index=True, comment="ID транспортного средства из справочника")
    azs_number = Column(String(100), index=True, comment="Номер АЗС")
    gas_station_id = Column(Integer, ForeignKey("gas_stations.id"), index=True, comment="ID АЗС из справочника")
    provider_id = Column(Integer, ForeignKey("providers.id"), index=True, comment="ID провайдера")
    
    # Географические данные
    supplier = Column(String(200), comment="Поставщик")
    region = Column(String(200), comment="Регион")
    settlement = Column(String(200), comment="Населенный пункт")
    location = Column(String(500), comment="Местоположение")
    location_code = Column(String(50), comment="Код местоположения")
    
    # Товар и операция
    product = Column(String(200), index=True, comment="Товар / услуга")
    operation_type = Column(String(50), default="Покупка", comment="Тип операции")
    quantity = Column(Numeric(10, 2), nullable=False, comment="Количество")
    
    # Финансовые данные
    currency = Column(String(10), default="RUB", comment="Валюта транзакции")
    exchange_rate = Column(Numeric(10, 4), default=1, comment="Курс конвертации")
    price = Column(Numeric(10, 2), comment="Цена")
    price_with_discount = Column(Numeric(10, 2), comment="Цена со скидкой")
    amount = Column(Numeric(10, 2), comment="Сумма")
    amount_with_discount = Column(Numeric(10, 2), comment="Сумма со скидкой")
    discount_percent = Column(Numeric(5, 2), comment="Скидка, %")
    discount_amount = Column(Numeric(10, 2), comment="Сумма скидки")
    vat_rate = Column(Numeric(5, 2), comment="Ставка НДС")
    vat_amount = Column(Numeric(10, 2), comment="Сумма НДС")
    
    # Метаданные
    created_at = Column(DateTime, server_default=func.now(), comment="Дата создания записи")
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), comment="Дата обновления записи")
    source_file = Column(String(500), comment="Исходный файл")
    organization = Column(String(200), comment="Организация (старое поле, для обратной совместимости)")
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete='SET NULL'), index=True, nullable=True, comment="ID организации")
    
    # Связи
    provider = relationship("Provider", back_populates="transactions")
    organization_rel = relationship("Organization", back_populates="transactions")

    # Уникальный индекс для предотвращения дубликатов
    __table_args__ = (
        Index('idx_unique_transaction', 
              'transaction_date', 'card_number', 'azs_number', 'quantity', 'product',
              unique=False),  # Не unique, чтобы можно было проверять вручную
    )


class Vehicle(Base):
    """
    Справочник транспортных средств
    """
    __tablename__ = "vehicles"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Связь с организацией
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete='SET NULL'), index=True, nullable=True, comment="ID организации")
    
    # Исходное наименование из файла
    original_name = Column(String(200), nullable=False, index=True, comment="Исходное наименование ТС")
    
    # Нормализованные данные
    garage_number = Column(String(50), index=True, comment="Гаражный номер")
    license_plate = Column(String(20), index=True, comment="Государственный номер")
    
    # Статус валидации
    is_validated = Column(String(10), default="pending", comment="Статус: pending, valid, invalid")
    validation_errors = Column(String(500), comment="Ошибки валидации")
    
    # Метаданные
    created_at = Column(DateTime, server_default=func.now(), comment="Дата создания")
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), comment="Дата обновления")
    
    # Связи
    organization = relationship("Organization", back_populates="vehicles")
    
    # Уникальность по исходному наименованию и организации
    __table_args__ = (
        Index('idx_vehicle_original_org', 'original_name', 'organization_id', unique=True),
    )


class Provider(Base):
    """
    Справочник провайдеров (Лукойл, Газпром и т.д.)
    """
    __tablename__ = "providers"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Связь с организацией
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete='SET NULL'), index=True, nullable=True, comment="ID организации")
    
    name = Column(String(100), nullable=False, unique=True, index=True, comment="Название провайдера")
    code = Column(String(50), nullable=False, unique=True, index=True, comment="Код провайдера")
    is_active = Column(Boolean, default=True, comment="Активен")
    
    # Метаданные
    created_at = Column(DateTime, server_default=func.now(), comment="Дата создания")
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), comment="Дата обновления")
    
    # Связи
    organization = relationship("Organization", back_populates="providers")
    templates = relationship("ProviderTemplate", back_populates="provider", cascade="all, delete-orphan")
    fuel_cards = relationship("FuelCard", back_populates="provider")
    gas_stations = relationship("GasStation", back_populates="provider")
    transactions = relationship("Transaction", back_populates="provider")


class ProviderTemplate(Base):
    """
    Шаблоны отчетов провайдеров с маппингом полей
    Поддерживает четыре типа подключения:
    - "file": загрузка из файла Excel (по умолчанию)
    - "firebird": загрузка из базы данных Firebird
    - "api": загрузка через API провайдера (например, PetrolPlus)
    - "web": загрузка через веб-сервис с авторизацией (JWT токен)
    """
    __tablename__ = "provider_templates"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    provider_id = Column(Integer, ForeignKey("providers.id"), nullable=False, index=True, comment="ID провайдера")
    
    name = Column(String(200), nullable=False, comment="Название шаблона")
    description = Column(String(500), comment="Описание шаблона")
    
    # Тип подключения: "file" (загрузка из файла), "firebird" (загрузка из БД Firebird), "api" (загрузка через API) или "web" (веб-сервис с авторизацией)
    connection_type = Column(String(50), default="file", nullable=False, comment="Тип подключения: file, firebird, api, web")
    
    # Настройки подключения (JSON):
    # - Для Firebird: {"host": "localhost", "database": "/path/to/database.fdb", "user": "SYSDBA", "password": "masterkey", "port": 3050}
    # - Для API: {"base_url": "https://api.example.com", "api_key": "...", "api_token": "...", "provider_type": "petrolplus"}
    # - Для Web: {"base_url": "http://example.com:8080", "username": "user", "password": "pass"}
    connection_settings = Column(Text, comment="JSON настройки подключения (для connection_type=firebird, api или web)")
    
    # Маппинг полей: JSON с маппингом колонок Excel/таблиц БД/полей API на поля системы
    # Пример: {"user": "Пользователь", "card": "№ карты", "date": "Дата", ...}
    field_mapping = Column(Text, nullable=False, comment="JSON маппинг полей шаблона")
    
    # Параметры парсинга (для типа "file")
    header_row = Column(Integer, default=0, comment="Номер строки с заголовками (0-based)")
    data_start_row = Column(Integer, default=1, comment="Номер строки начала данных (0-based)")
    
    # Параметры для типа "firebird"
    # Имя таблицы или SQL запрос для получения данных
    source_table = Column(String(200), comment="Имя таблицы в БД Firebird или SQL запрос")
    source_query = Column(Text, comment="SQL запрос для получения данных (если указан, используется вместо source_table)")
    
    # Маппинг видов топлива: JSON с маппингом названий из файла на нормализованные названия
    # Пример: {"ДТ": "Дизельное топливо", "АИ-95": "Бензин АИ-95", "АИ-92": "Бензин АИ-92"}
    fuel_type_mapping = Column(Text, comment="JSON маппинг видов топлива для нормализации")
    
    is_active = Column(Boolean, default=True, comment="Активен")
    
    # Настройки автоматической загрузки (для типов firebird и api)
    # Включена ли автоматическая загрузка данных из Firebird/API
    auto_load_enabled = Column(Boolean, default=False, comment="Включена ли автоматическая загрузка")
    # Расписание автоматической загрузки (cron-выражение или простой формат: "daily", "hourly", "weekly")
    # Примеры cron: "0 2 * * *" - каждый день в 2:00, "0 */6 * * *" - каждые 6 часов
    auto_load_schedule = Column(String(100), comment="Расписание автоматической загрузки (cron-выражение)")
    # Смещение в днях от текущей даты для date_from (по умолчанию -7, т.е. неделя назад)
    auto_load_date_from_offset = Column(Integer, default=-7, comment="Смещение в днях для начальной даты загрузки")
    # Смещение в днях от текущей даты для date_to (по умолчанию -1, т.е. вчера)
    auto_load_date_to_offset = Column(Integer, default=-1, comment="Смещение в днях для конечной даты загрузки")
    # Дата и время последней автоматической загрузки
    last_auto_load_date = Column(DateTime, comment="Дата и время последней автоматической загрузки")
    
    # Метаданные
    created_at = Column(DateTime, server_default=func.now(), comment="Дата создания")
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), comment="Дата обновления")
    
    # Связи
    provider = relationship("Provider", back_populates="templates")


class FuelCard(Base):
    """
    Справочник топливных карт
    """
    __tablename__ = "fuel_cards"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    card_number = Column(String(50), nullable=False, index=True, comment="Номер топливной карты")
    
    # Связь с провайдером
    provider_id = Column(Integer, ForeignKey("providers.id"), index=True, comment="ID провайдера")
    
    # Связь с ТС (периодическое закрепление)
    vehicle_id = Column(Integer, index=True, comment="ID транспортного средства")
    
    # Периодическое закрепление
    assignment_start_date = Column(Date, comment="Дата начала закрепления")
    assignment_end_date = Column(Date, comment="Дата окончания закрепления")
    is_active_assignment = Column(Boolean, default=True, comment="Активное закрепление")
    
    # Статус блокировки карты
    is_blocked = Column(Boolean, default=False, index=True, comment="Карта заблокирована")
    
    # Метаданные
    created_at = Column(DateTime, server_default=func.now(), comment="Дата создания")
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), comment="Дата обновления")
    
    # Связи
    provider = relationship("Provider", back_populates="fuel_cards")
    
    # Индекс для проверки пересечений карт
    __table_args__ = (
        Index('idx_fuel_card_active', 'card_number', 'is_active_assignment', 'assignment_start_date', 'assignment_end_date'),
        Index('idx_fuel_card_number', 'card_number', unique=True),
    )


class GasStation(Base):
    """
    Справочник автозаправочных станций (АЗС)
    """
    __tablename__ = "gas_stations"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Связь с провайдером
    provider_id = Column(Integer, ForeignKey("providers.id"), index=True, nullable=True, comment="ID провайдера")
    
    # Исходное наименование из файла
    original_name = Column(String(200), nullable=False, index=True, comment="Исходное наименование АЗС")
    
    # Нормализованные данные
    azs_number = Column(String(50), index=True, comment="Номер АЗС")
    location = Column(String(500), comment="Местоположение")
    region = Column(String(200), comment="Регион")
    settlement = Column(String(200), comment="Населенный пункт")
    
    # Координаты местоположения
    latitude = Column(Numeric(10, 8), comment="Широта")
    longitude = Column(Numeric(11, 8), comment="Долгота")
    
    # Статус валидации
    is_validated = Column(String(10), default="pending", comment="Статус: pending, valid, invalid")
    validation_errors = Column(String(500), comment="Ошибки валидации")
    
    # Метаданные
    created_at = Column(DateTime, server_default=func.now(), comment="Дата создания")
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), comment="Дата обновления")
    
    # Связи
    provider = relationship("Provider", back_populates="gas_stations")
    
    # Уникальность по исходному наименованию
    __table_args__ = (
        Index('idx_gas_station_original', 'original_name', unique=True),
    )


class UploadPeriodLock(Base):
    """
    Модель закрытия периода загрузки
    Хранит дату, раньше которой нельзя загружать транзакции
    """
    __tablename__ = "upload_period_lock"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    lock_date = Column(Date, nullable=False, unique=True, index=True, comment="Дата закрытия периода загрузки")
    
    # Метаданные
    created_at = Column(DateTime, server_default=func.now(), comment="Дата создания")
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), comment="Дата обновления")
    
    # Уникальность: только одна запись с датой закрытия периода
    __table_args__ = (
        Index('idx_upload_period_lock_unique', 'lock_date', unique=True),
    )


class Organization(Base):
    """
    Модель организации
    """
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Основные поля
    name = Column(String(200), nullable=False, unique=True, index=True, comment="Название организации")
    code = Column(String(50), nullable=False, unique=True, index=True, comment="Код организации")
    description = Column(Text, comment="Описание организации")
    
    # Стандартные поля организации
    inn = Column(String(20), index=True, comment="ИНН")
    kpp = Column(String(20), index=True, comment="КПП")
    ogrn = Column(String(20), index=True, comment="ОГРН")
    legal_address = Column(String(500), comment="Юридический адрес")
    actual_address = Column(String(500), comment="Фактический адрес")
    phone = Column(String(50), comment="Телефон")
    email = Column(String(255), index=True, comment="Email")
    website = Column(String(255), comment="Веб-сайт")
    contact_person = Column(String(200), comment="Контактное лицо")
    contact_phone = Column(String(50), comment="Контактный телефон")
    bank_name = Column(String(200), comment="Название банка")
    bank_account = Column(String(50), comment="Расчетный счет")
    bank_bik = Column(String(20), comment="БИК банка")
    bank_correspondent_account = Column(String(50), comment="Корреспондентский счет")
    
    # Статус активности
    is_active = Column(Boolean, default=True, index=True, comment="Активна")
    
    # Метаданные
    created_at = Column(DateTime, server_default=func.now(), comment="Дата создания")
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), comment="Дата обновления")
    
    # Связи
    users = relationship("User", secondary=user_organizations, back_populates="organizations")
    vehicles = relationship("Vehicle", back_populates="organization")
    transactions = relationship("Transaction", back_populates="organization_rel")
    providers = relationship("Provider", back_populates="organization")
    
    __table_args__ = (
        Index('idx_organization_name', 'name', unique=True),
        Index('idx_organization_code', 'code', unique=True),
    )


class User(Base):
    """
    Модель пользователя системы
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Основные поля
    username = Column(String(100), nullable=False, unique=True, index=True, comment="Имя пользователя")
    email = Column(String(255), nullable=False, unique=True, index=True, comment="Email адрес")
    hashed_password = Column(String(255), nullable=False, comment="Хешированный пароль")
    
    # Роль пользователя: admin, user, viewer
    role = Column(String(50), default="user", nullable=False, index=True, comment="Роль пользователя")
    
    # Статус активности
    is_active = Column(Boolean, default=True, index=True, comment="Активен")
    is_superuser = Column(Boolean, default=False, comment="Суперпользователь")
    
    # Метаданные
    created_at = Column(DateTime, server_default=func.now(), comment="Дата создания")
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), comment="Дата обновления")
    last_login = Column(DateTime, comment="Дата последнего входа")
    
    # Связи
    organizations = relationship("Organization", secondary=user_organizations, back_populates="users")
    
    # Уникальность по username и email
    __table_args__ = (
        Index('idx_user_username', 'username', unique=True),
        Index('idx_user_email', 'email', unique=True),
    )


class UploadEvent(Base):
    """
    История загрузок (ручных и регламентных)
    """
    __tablename__ = "upload_events"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    # Источник и статус
    source_type = Column(String(20), nullable=False, default="manual", comment="manual | auto")
    status = Column(String(20), nullable=False, default="success", comment="success | failed | partial")
    is_scheduled = Column(Boolean, default=False, comment="Регламентная загрузка")

    # Связи
    provider_id = Column(Integer, ForeignKey("providers.id"), index=True, nullable=True)
    template_id = Column(Integer, ForeignKey("provider_templates.id"), index=True, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)

    # Основные атрибуты
    file_name = Column(String(500), comment="Имя файла/канал загрузки")
    username = Column(String(100), comment="Имя пользователя инициатора")
    transactions_total = Column(Integer, default=0, comment="Всего записей в загрузке")
    transactions_created = Column(Integer, default=0, comment="Создано транзакций")
    transactions_skipped = Column(Integer, default=0, comment="Пропущено транзакций")
    transactions_failed = Column(Integer, default=0, comment="Ошибочных транзакций")
    duration_ms = Column(Integer, comment="Длительность обработки, мс")
    message = Column(Text, comment="Сообщение/предупреждения по загрузке")

    # Метаданные
    created_at = Column(DateTime, server_default=func.now(), comment="Дата создания записи")
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), comment="Дата обновления записи")

    # Связи для удобства выборок
    provider = relationship("Provider", lazy="joined")
    template = relationship("ProviderTemplate", lazy="joined")
    user = relationship("User", lazy="joined")

    __table_args__ = (
        Index('idx_upload_events_created_at', 'created_at'),
        Index('idx_upload_events_status', 'status'),
        Index('idx_upload_events_source', 'source_type'),
        Index('idx_upload_events_scheduled', 'is_scheduled'),
    )


class SystemLog(Base):
    """
    Логи системных событий
    """
    __tablename__ = "system_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Уровень логирования
    level = Column(String(20), nullable=False, index=True, comment="Уровень: DEBUG, INFO, WARNING, ERROR, CRITICAL")
    
    # Основная информация
    message = Column(Text, nullable=False, comment="Сообщение лога")
    module = Column(String(200), comment="Модуль, где произошло событие")
    function = Column(String(200), comment="Функция, где произошло событие")
    line_number = Column(Integer, comment="Номер строки кода")
    
    # Контекст события
    event_type = Column(String(100), index=True, comment="Тип события: request, database, service, scheduler, etc.")
    event_category = Column(String(100), index=True, comment="Категория: auth, upload, transaction, etc.")
    
    # Дополнительные данные (JSON)
    extra_data = Column(Text, comment="Дополнительные данные в формате JSON")
    
    # Информация об ошибке (если есть)
    exception_type = Column(String(200), comment="Тип исключения")
    exception_message = Column(Text, comment="Сообщение исключения")
    stack_trace = Column(Text, comment="Трассировка стека")
    
    # Метаданные
    created_at = Column(DateTime, server_default=func.now(), index=True, comment="Дата и время создания")
    
    __table_args__ = (
        Index('idx_system_logs_created_at', 'created_at'),
        Index('idx_system_logs_level', 'level'),
        Index('idx_system_logs_event_type', 'event_type'),
        Index('idx_system_logs_event_category', 'event_category'),
        Index('idx_system_logs_level_created', 'level', 'created_at'),
    )


class UserActionLog(Base):
    """
    Логи действий пользователей
    """
    __tablename__ = "user_action_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Связь с пользователем
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True, comment="ID пользователя")
    username = Column(String(100), index=True, comment="Имя пользователя (на случай удаления пользователя)")
    
    # Действие пользователя
    action_type = Column(String(100), nullable=False, index=True, comment="Тип действия: login, logout, create, update, delete, view, export, etc.")
    action_category = Column(String(100), index=True, comment="Категория: auth, transaction, vehicle, organization, etc.")
    action_description = Column(Text, nullable=False, comment="Описание действия")
    
    # Объект действия
    entity_type = Column(String(100), index=True, comment="Тип сущности: Transaction, Vehicle, Organization, etc.")
    entity_id = Column(Integer, index=True, comment="ID сущности")
    
    # Дополнительные данные (JSON)
    request_data = Column(Text, comment="Данные запроса в формате JSON")
    response_data = Column(Text, comment="Данные ответа в формате JSON")
    changes = Column(Text, comment="Изменения (для update операций) в формате JSON")
    
    # Информация о запросе
    ip_address = Column(String(50), index=True, comment="IP адрес пользователя")
    user_agent = Column(String(500), comment="User-Agent браузера")
    request_method = Column(String(10), comment="HTTP метод")
    request_path = Column(String(500), comment="Путь запроса")
    
    # Результат действия
    status = Column(String(20), default="success", index=True, comment="Статус: success, failed, partial")
    error_message = Column(Text, comment="Сообщение об ошибке (если есть)")
    
    # Метаданные
    created_at = Column(DateTime, server_default=func.now(), index=True, comment="Дата и время создания")
    
    # Связи
    user = relationship("User", lazy="joined")
    
    __table_args__ = (
        Index('idx_user_action_logs_created_at', 'created_at'),
        Index('idx_user_action_logs_user_id', 'user_id'),
        Index('idx_user_action_logs_action_type', 'action_type'),
        Index('idx_user_action_logs_entity_type', 'entity_type'),
        Index('idx_user_action_logs_status', 'status'),
        Index('idx_user_action_logs_user_created', 'user_id', 'created_at'),
    )
