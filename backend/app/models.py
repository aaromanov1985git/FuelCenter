"""
Модели базы данных для транзакций ГСМ
"""
from sqlalchemy import Column, Integer, BigInteger, String, Numeric, DateTime, Date, Index, ForeignKey, Text, Boolean, Table, true, false
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
    
    # Данные владельца
    original_owner_name = Column(String(200), comment="Исходное наименование Владельца")
    normalized_owner = Column(String(200), index=True, comment="Нормализованный владелец")
    
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
    
    # Наименование АЗС (редактируемое, при создании равно original_name)
    name = Column(String(200), nullable=False, comment="Наименование АЗС (редактируемое)")
    
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


class FuelType(Base):
    """
    Справочник видов топлива
    """
    __tablename__ = "fuel_types"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Исходное наименование из транзакций
    original_name = Column(String(200), nullable=False, index=True, comment="Исходное наименование вида топлива")
    
    # Нормализованное наименование (редактируемое, при создании равно original_name)
    normalized_name = Column(String(200), nullable=False, comment="Нормализованное наименование вида топлива (редактируемое)")
    
    # Статус валидации
    is_validated = Column(String(10), default="pending", comment="Статус: pending, valid, invalid")
    validation_errors = Column(String(500), comment="Ошибки валидации")
    
    # Метаданные
    created_at = Column(DateTime, server_default=func.now(), comment="Дата создания")
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), comment="Дата обновления")
    
    # Уникальность по исходному наименованию
    __table_args__ = (
        Index('idx_fuel_type_original', 'original_name', unique=True),
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


class NormalizationSettings(Base):
    """
    Настройки нормализации для справочников
    """
    __tablename__ = "normalization_settings"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Тип справочника: 'fuel_card_owner', 'vehicle', 'gas_station', 'fuel_type'
    dictionary_type = Column(String(50), nullable=False, unique=True, index=True, comment="Тип справочника")
    
    # Опции нормализации (JSON)
    # {
    #   "case": "upper" | "lower" | "title" | "preserve" - регистр
    #   "remove_special_chars": true/false - удалять спецсимволы
    #   "remove_extra_spaces": true/false - удалять лишние пробелы
    #   "trim": true/false - обрезать пробелы в начале/конце
    #   "priority_license_plate": true/false - приоритет госномера
    #   "priority_garage_number": true/false - приоритет гаражного номера
    #   "min_garage_number_length": 2 - минимальная длина гаражного номера
    #   "max_garage_number_length": 10 - максимальная длина гаражного номера
    #   "remove_chars": ["символ1", "символ2"] - список символов для удаления
    # }
    options = Column(Text, comment="JSON настройки нормализации")
    
    # Метаданные
    created_at = Column(DateTime, server_default=func.now(), comment="Дата создания")
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), comment="Дата обновления")
    
    __table_args__ = (
        Index('idx_normalization_settings_type', 'dictionary_type', unique=True),
    )


class CardInfoSchedule(Base):
    """
    Регламент получения информации по топливным картам через Web API
    """
    __tablename__ = "card_info_schedules"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Название регламента
    name = Column(String(200), nullable=False, comment="Название регламента")
    
    # Описание
    description = Column(String(500), comment="Описание регламента")
    
    # ID шаблона провайдера с типом подключения "web"
    provider_template_id = Column(Integer, ForeignKey("provider_templates.id"), nullable=False, index=True, comment="ID шаблона провайдера")
    
    # Расписание (cron-выражение или простой формат: "daily", "hourly", "weekly")
    # Примеры cron: "0 2 * * *" - каждый день в 2:00, "0 */6 * * *" - каждые 6 часов
    schedule = Column(String(100), nullable=False, comment="Расписание (cron-выражение)")
    
    # Фильтр карт для обработки (JSON)
    # {
    #   "provider_ids": [1, 2, 3] - только карты этих провайдеров
    #   "card_numbers": ["1100018800004794", ...] - конкретные номера карт (если пусто - все карты провайдера)
    #   "only_with_vehicle": true/false - только карты, привязанные к ТС
    #   "only_blocked": true/false - только заблокированные карты
    #   "only_active": true/false - только активные карты
    # }
    filter_options = Column(Text, comment="JSON фильтр карт для обработки")
    
    # Автоматически обновлять карты данными из API
    auto_update = Column(Boolean, default=True, comment="Автоматически обновлять карты")
    
    # Флаги реквизитов для запроса (битовая маска)
    # 1=FirstName, 2=LastName, 4=Patronymic, 8=BirthDate, 16=PhoneNumber, 32=Sex
    # По умолчанию 23 (1+2+4+16 = ФИО + телефон)
    flags = Column(Integer, default=23, comment="Флаги реквизитов для запроса")
    
    # Активен ли регламент
    is_active = Column(Boolean, default=True, comment="Активен")
    
    # Дата и время последнего выполнения
    last_run_date = Column(DateTime, comment="Дата и время последнего выполнения")
    
    # Результат последнего выполнения (JSON)
    # {
    #   "status": "success" | "error" | "partial",
    #   "cards_processed": 10,
    #   "cards_updated": 8,
    #   "cards_failed": 2,
    #   "error_message": "..."
    # }
    last_run_result = Column(Text, comment="JSON результат последнего выполнения")
    
    # Метаданные
    created_at = Column(DateTime, server_default=func.now(), comment="Дата создания")
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), comment="Дата обновления")
    
    # Связи
    provider_template = relationship("ProviderTemplate", backref="card_info_schedules")
    
    __table_args__ = (
        Index('idx_card_info_schedules_template', 'provider_template_id'),
        Index('idx_card_info_schedules_active', 'is_active'),
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


class VehicleRefuel(Base):
    """
    Данные о фактических заправках транспортных средств
    Получаются из внешних систем (GLONASS, телематика и т.д.)
    """
    __tablename__ = "vehicle_refuels"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Связь с ТС
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False, index=True, comment="ID транспортного средства")
    
    # Данные о заправке
    refuel_date = Column(DateTime, nullable=False, index=True, comment="Дата и время заправки")
    fuel_type = Column(String(200), index=True, comment="Тип топлива")
    quantity = Column(Numeric(10, 2), nullable=False, comment="Количество заправленного топлива (литры)")
    
    # Данные о состоянии ТС
    fuel_level_before = Column(Numeric(5, 2), comment="Уровень топлива до заправки (% или литры)")
    fuel_level_after = Column(Numeric(5, 2), comment="Уровень топлива после заправки (% или литры)")
    odometer_reading = Column(Numeric(10, 1), comment="Показания одометра на момент заправки")
    
    # Источник данных
    source_system = Column(String(100), nullable=False, index=True, comment="Источник данных (GLONASS, телематика, ручной ввод)")
    source_id = Column(String(200), index=True, comment="ID записи в системе-источнике")
    
    # Геолокация
    latitude = Column(Numeric(10, 8), comment="Широта места заправки")
    longitude = Column(Numeric(11, 8), comment="Долгота места заправки")
    location_accuracy = Column(Numeric(8, 2), comment="Точность определения местоположения (метры)")
    
    # Метаданные
    created_at = Column(DateTime, server_default=func.now(), comment="Дата создания записи")
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), comment="Дата обновления записи")
    
    # Связи
    vehicle = relationship("Vehicle", backref="refuels")
    
    __table_args__ = (
        Index('idx_vehicle_refuel_vehicle_date', 'vehicle_id', 'refuel_date'),
        Index('idx_vehicle_refuel_source', 'source_system', 'source_id'),
    )


class VehicleLocation(Base):
    """
    История местоположений транспортных средств
    Данные из систем GLONASS/GPS/телематики
    """
    __tablename__ = "vehicle_locations"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Связь с ТС
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False, index=True, comment="ID транспортного средства")
    
    # Данные о местоположении
    timestamp = Column(DateTime, nullable=False, index=True, comment="Дата и время фиксации местоположения")
    latitude = Column(Numeric(10, 8), nullable=False, comment="Широта")
    longitude = Column(Numeric(11, 8), nullable=False, comment="Долгота")
    
    # Дополнительные данные
    speed = Column(Numeric(6, 2), comment="Скорость движения (км/ч)")
    heading = Column(Numeric(5, 2), comment="Направление движения (градусы)")
    accuracy = Column(Numeric(8, 2), comment="Точность определения местоположения (метры)")
    
    # Источник данных
    source = Column(String(100), nullable=False, default="GLONASS", index=True, comment="Источник данных (GLONASS, GPS, телематика)")
    
    # Метаданные
    created_at = Column(DateTime, server_default=func.now(), comment="Дата создания записи")
    
    # Связи
    vehicle = relationship("Vehicle", backref="locations")
    
    __table_args__ = (
        Index('idx_vehicle_location_vehicle_timestamp', 'vehicle_id', 'timestamp'),
        Index('idx_vehicle_location_timestamp', 'timestamp'),
    )


class FuelCardAnalysisResult(Base):
    """
    Результаты анализа соответствия транзакций по картам и фактических заправок ТС
    """
    __tablename__ = "fuel_card_analysis_results"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Связи с основными сущностями
    transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=False, index=True, comment="ID транзакции по карте")
    refuel_id = Column(Integer, ForeignKey("vehicle_refuels.id"), index=True, nullable=True, comment="ID заправки ТС (если найдено соответствие)")
    fuel_card_id = Column(Integer, ForeignKey("fuel_cards.id"), index=True, nullable=True, comment="ID топливной карты")
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), index=True, nullable=True, comment="ID транспортного средства")
    
    # Данные анализа
    analysis_date = Column(DateTime, nullable=False, index=True, server_default=func.now(), comment="Дата проведения анализа")
    
    # Статус соответствия
    match_status = Column(String(50), nullable=False, index=True, comment="Статус соответствия: matched, no_refuel, location_mismatch, quantity_mismatch, time_mismatch, multiple_matches")
    match_confidence = Column(Numeric(5, 2), comment="Уверенность в соответствии (0-100%)")
    
    # Метрики соответствия
    distance_to_azs = Column(Numeric(10, 2), comment="Расстояние от ТС до АЗС в момент транзакции (метры)")
    time_difference = Column(Integer, comment="Разница во времени между транзакцией и заправкой (секунды)")
    quantity_difference = Column(Numeric(10, 2), comment="Разница в количестве топлива (литры)")
    
    # Детальная информация об анализе (JSON)
    analysis_details = Column(Text, comment="JSON с детальной информацией об анализе")
    
    # Флаги аномалий
    is_anomaly = Column(Boolean, default=False, index=True, comment="Флаг аномалии (требует внимания)")
    anomaly_type = Column(String(50), index=True, comment="Тип аномалии: fuel_theft, card_misuse, data_error, equipment_failure")
    
    # Метаданные
    created_at = Column(DateTime, server_default=func.now(), comment="Дата создания записи")
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), comment="Дата обновления записи")
    
    # Связи
    transaction = relationship("Transaction", backref="analysis_results")
    refuel = relationship("VehicleRefuel", backref="analysis_results")
    fuel_card = relationship("FuelCard", backref="analysis_results")
    vehicle = relationship("Vehicle", backref="analysis_results")
    
    __table_args__ = (
        Index('idx_fuel_card_analysis_transaction', 'transaction_id'),
        Index('idx_fuel_card_analysis_status', 'match_status', 'is_anomaly'),
        Index('idx_fuel_card_analysis_anomaly', 'is_anomaly', 'anomaly_type'),
        Index('idx_fuel_card_analysis_date', 'analysis_date'),
    )


class NotificationSettings(Base):
    """
    Настройки уведомлений пользователя
    """
    __tablename__ = "notification_settings"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Связь с пользователем
    user_id = Column(Integer, ForeignKey("users.id", ondelete='CASCADE'), nullable=False, unique=True, index=True, comment="ID пользователя")
    
    # Настройки каналов уведомлений
    email_enabled = Column(Boolean, default=True, comment="Включены ли уведомления по email")
    telegram_enabled = Column(Boolean, default=False, comment="Включены ли уведомления в Telegram")
    push_enabled = Column(Boolean, default=True, comment="Включены ли push-уведомления")
    in_app_enabled = Column(Boolean, default=True, comment="Включены ли уведомления в системе")
    
    # Настройки Telegram
    telegram_chat_id = Column(String(100), index=True, comment="ID чата Telegram для уведомлений")
    telegram_username = Column(String(100), comment="Имя пользователя Telegram")
    
    # Настройки Push
    push_subscription = Column(Text, comment="JSON с данными подписки на push-уведомления")
    
    # Категории уведомлений (JSON)
    # Пример: {"upload_events": true, "errors": true, "system": false, "transactions": true}
    categories = Column(Text, comment="JSON с настройками категорий уведомлений")
    
    # Метаданные
    created_at = Column(DateTime, server_default=func.now(), comment="Дата создания")
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), comment="Дата обновления")
    
    # Связи
    user = relationship("User", backref="notification_settings")
    
    __table_args__ = (
        Index('idx_notification_settings_user', 'user_id', unique=True),
    )


class Notification(Base):
    """
    Уведомления пользователей
    """
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Связь с пользователем
    user_id = Column(Integer, ForeignKey("users.id", ondelete='CASCADE'), nullable=False, index=True, comment="ID пользователя")
    
    # Основные поля уведомления
    title = Column(String(200), nullable=False, comment="Заголовок уведомления")
    message = Column(Text, nullable=False, comment="Текст уведомления")
    category = Column(String(100), index=True, comment="Категория уведомления: upload_events, errors, system, transactions, etc.")
    type = Column(String(50), default="info", index=True, comment="Тип уведомления: info, success, warning, error")
    
    # Статус доставки по каналам (JSON)
    # Пример: {"email": "sent", "telegram": "sent", "push": "failed", "in_app": "delivered"}
    delivery_status = Column(Text, comment="JSON со статусом доставки по каналам")
    
    # Метаданные
    is_read = Column(Boolean, default=False, index=True, comment="Прочитано ли уведомление")
    read_at = Column(DateTime, comment="Дата и время прочтения")
    created_at = Column(DateTime, server_default=func.now(), index=True, comment="Дата создания")
    
    # Связанные сущности (опционально)
    entity_type = Column(String(100), index=True, comment="Тип связанной сущности: Transaction, UploadEvent, etc.")
    entity_id = Column(Integer, index=True, comment="ID связанной сущности")
    
    # Связи
    user = relationship("User", backref="notifications")
    
    __table_args__ = (
        Index('idx_notifications_user_created', 'user_id', 'created_at'),
        Index('idx_notifications_user_read', 'user_id', 'is_read'),
        Index('idx_notifications_category', 'category'),
        Index('idx_notifications_type', 'type'),
    )


class SystemSettings(Base):
    """
    Глобальные системные настройки (SMTP, Telegram Bot и др.)
    Хранятся в виде ключ-значение
    """
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # Ключ настройки (уникальный)
    key = Column(String(100), nullable=False, unique=True, index=True, comment="Ключ настройки")
    
    # Значение настройки (зашифрованное для паролей)
    value = Column(Text, comment="Значение настройки")
    
    # Флаг, является ли значение зашифрованным (для паролей)
    is_encrypted = Column(Boolean, default=False, comment="Зашифровано ли значение")
    
    # Описание настройки
    description = Column(String(500), comment="Описание настройки")
    
    # Метаданные
    created_at = Column(DateTime, server_default=func.now(), comment="Дата создания")
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), comment="Дата обновления")

class Tank(Base):
    """
    Резервуар (ёмкость) АЗС, прочитанный из базы Топаза.
    Ручные поля (вместимость, поправка вида топлива, группа перелива) заполняются в GSM.
    """
    __tablename__ = "tanks"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    provider_id = Column(Integer, ForeignKey("providers.id"), nullable=False, index=True, comment="ID провайдера")
    template_id = Column(Integer, ForeignKey("provider_templates.id"), nullable=False, index=True, comment="Шаблон-источник подключения")
    gas_station_id = Column(Integer, ForeignKey("gas_stations.id"), nullable=True, index=True, comment="АЗС в справочнике GSM")

    azs_code = Column(String(50), nullable=False, index=True, comment="Код АЗС (торговой точки) в Топазе")
    source_key = Column(String(100), nullable=False, comment="Ключ резервуара в источнике: snap:<TankID> или ses:<АЗС>:<номер>")
    tank_number = Column(Integer, comment="Номер ёмкости")
    source_name = Column(String(200), comment="Наименование ёмкости в Топазе")
    source_fuel = Column(String(100), comment="Вид топлива по данным Топаза")

    fuel_type_override = Column(String(100), comment="Вид топлива, заданный вручную")
    capacity_liters = Column(Numeric(12, 2), comment="Вместимость, л")
    overflow_group = Column(String(50), comment="Группа перелива: ёмкости с одинаковой группой соединены")
    is_active = Column(Boolean, nullable=False, default=True, server_default=true(), comment="Учитывать ёмкость в остатках")

    last_measured_at = Column(DateTime, comment="Время последнего замера")
    last_volume = Column(Numeric(12, 2), comment="Объём на последнем замере, л")
    last_mass = Column(Numeric(12, 2), comment="Масса на последнем замере, кг")
    last_density = Column(Numeric(8, 2), comment="Плотность на последнем замере, кг/м3")
    last_temperature = Column(Numeric(6, 2), comment="Температура на последнем замере, °C")
    last_water = Column(Numeric(10, 2), comment="Подтоварная вода на последнем замере")

    created_at = Column(DateTime, server_default=func.now(), comment="Дата создания")
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), comment="Дата обновления")

    provider = relationship("Provider")
    gas_station = relationship("GasStation")
    readings = relationship("TankReading", back_populates="tank", cascade="all, delete-orphan", passive_deletes=True)

    __table_args__ = (
        Index('idx_tank_template_source', 'template_id', 'source_key', unique=True),
    )


class TankReading(Base):
    """
    Замер уровнемера по резервуару
    """
    __tablename__ = "tank_readings"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    tank_id = Column(Integer, ForeignKey("tanks.id", ondelete="CASCADE"), nullable=False, comment="ID резервуара")
    measured_at = Column(DateTime, nullable=False, comment="Время замера (по часам базы Топаза)")
    volume = Column(Numeric(12, 2), comment="Объём, л")
    mass = Column(Numeric(12, 2), comment="Масса, кг")
    density = Column(Numeric(8, 2), comment="Плотность, кг/м3")
    temperature = Column(Numeric(6, 2), comment="Температура, °C")
    water = Column(Numeric(10, 2), comment="Подтоварная вода")
    source_row_id = Column(BigInteger, nullable=False, comment="ID строки в источнике")
    created_at = Column(DateTime, server_default=func.now(), comment="Дата загрузки")

    tank = relationship("Tank", back_populates="readings")

    __table_args__ = (
        Index('idx_tank_reading_source', 'tank_id', 'source_row_id', unique=True),
        Index('idx_tank_reading_time', 'tank_id', 'measured_at'),
    )


class CardLimit(Base):
    """
    Лимит топливной карты из базы Топаза с расходом в текущем периоде
    """
    __tablename__ = "card_limits"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    provider_id = Column(Integer, ForeignKey("providers.id"), nullable=False, index=True, comment="ID провайдера")
    template_id = Column(Integer, ForeignKey("provider_templates.id"), nullable=False, index=True, comment="Шаблон-источник подключения")

    source_card_id = Column(Integer, nullable=False, comment="CardID в Топазе")
    source_fuel_id = Column(Integer, nullable=False, comment="AmountID (вид топлива) в Топазе")
    card_code = Column(String(50), index=True, comment="Код карты")
    card_name = Column(String(200), index=True, comment="Наименование карты")
    card_enabled = Column(Boolean, nullable=False, default=True, comment="Карта включена в Топазе")

    source_fuel = Column(String(100), comment="Вид топлива по данным Топаза")
    fuel_type = Column(String(100), index=True, comment="Вид топлива после нормализации")

    limit_type_id = Column(Integer, comment="Тип периода лимита (sysLimitTypes)")
    limit_type_name = Column(String(100), comment="Название типа периода")
    limit_liters = Column(Numeric(12, 2), comment="Лимит, л")
    period = Column(Integer, comment="Параметр периода")

    period_start = Column(DateTime, comment="Начало текущего периода лимита")
    used_liters = Column(Numeric(12, 2), comment="Израсходовано в текущем периоде, л")
    synced_at = Column(DateTime, comment="Когда данные прочитаны из Топаза")

    created_at = Column(DateTime, server_default=func.now(), comment="Дата создания")
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), comment="Дата обновления")

    provider = relationship("Provider")

    __table_args__ = (
        Index('idx_card_limit_source', 'template_id', 'source_card_id', 'source_fuel_id', unique=True),
    )


class TopazSyncState(Base):
    """
    Состояние загрузки резервуаров и лимитов из Топаза по шаблону
    """
    __tablename__ = "topaz_sync_states"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    template_id = Column(Integer, ForeignKey("provider_templates.id"), nullable=False, unique=True, comment="Шаблон подключения")
    source_kind = Column(String(20), comment="snapshots — снимки уровнемера, sessions — замеры смен")
    last_tank_row_id = Column(BigInteger, nullable=False, default=0, server_default="0", comment="Последний загруженный ID строки замеров")
    last_run_at = Column(DateTime, comment="Последний запуск")
    source_clock = Column(DateTime, comment="Время на часах сервера Топаза в момент last_run_at")
    last_success_at = Column(DateTime, comment="Последний успешный запуск")
    last_status = Column(String(20), comment="success | failed")
    last_error = Column(Text, comment="Текст последней ошибки")
    tanks_count = Column(Integer, comment="Резервуаров в источнике")
    readings_added = Column(Integer, comment="Замеров добавлено за последний запуск")
    limits_count = Column(Integer, comment="Лимитов прочитано за последний запуск")

    created_at = Column(DateTime, server_default=func.now(), comment="Дата создания")
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), comment="Дата обновления")


class StationShare(Base):
    """
    Общая ссылка на просмотр АЗС без входа в GSM: секретный токен, набор разделов и срок действия
    """
    __tablename__ = "station_shares"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    token = Column(String(64), nullable=False, unique=True, index=True, comment="Секретный токен ссылки")

    provider_id = Column(Integer, ForeignKey("providers.id"), nullable=False, index=True, comment="Провайдер АЗС")
    azs_code = Column(String(50), nullable=False, index=True, comment="Код АЗС (как у резервуаров и транзакций)")
    note = Column(String(200), comment="Для кого ссылка — видно только в GSM")

    show_tanks = Column(Boolean, nullable=False, default=True, server_default=true(), comment="Открыты остатки в резервуарах")
    show_fills = Column(Boolean, nullable=False, default=False, server_default=false(), comment="Открыты заправки по картам")
    show_limits = Column(Boolean, nullable=False, default=False, server_default=false(), comment="Открыты лимиты карт")

    expires_at = Column(DateTime, nullable=False, comment="Срок действия (UTC)")
    revoked_at = Column(DateTime, comment="Когда отозвана (UTC)")
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, comment="Кто создал")
    created_by_name = Column(String(100), comment="Логин создателя на момент создания")
    open_count = Column(Integer, nullable=False, default=0, server_default="0", comment="Сколько раз открывали")
    last_opened_at = Column(DateTime, comment="Последнее открытие (UTC)")
    created_at = Column(DateTime, server_default=func.now(), comment="Дата создания")

    provider = relationship("Provider")
