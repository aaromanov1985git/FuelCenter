"""
Pydantic схемы для валидации данных API
"""
from pydantic import BaseModel, Field, field_validator, model_validator
from datetime import datetime, date
from decimal import Decimal
from typing import Optional, Dict, Any
import json
import re


class TransactionBase(BaseModel):
    """
    Базовая схема транзакции
    """
    transaction_date: datetime = Field(..., description="Дата и время транзакции")
    card_number: Optional[str] = Field(None, max_length=50, description="Номер карты")
    vehicle: Optional[str] = Field(None, max_length=200, description="Закреплена за")
    azs_number: Optional[str] = Field(None, max_length=100, description="Номер АЗС")
    supplier: Optional[str] = Field(None, max_length=200, description="Поставщик")
    region: Optional[str] = Field(None, max_length=200, description="Регион")
    settlement: Optional[str] = Field(None, max_length=200, description="Населенный пункт")
    location: Optional[str] = Field(None, max_length=500, description="Местоположение")
    location_code: Optional[str] = Field(None, max_length=50, description="Код местоположения")
    product: Optional[str] = Field(None, max_length=200, description="Товар / услуга")
    operation_type: str = Field(default="Покупка", max_length=50, description="Тип операции")
    quantity: Decimal = Field(..., description="Количество")
    currency: str = Field(default="RUB", max_length=10, description="Валюта транзакции")
    exchange_rate: Decimal = Field(default=1, description="Курс конвертации")
    price: Optional[Decimal] = Field(None, description="Цена")
    price_with_discount: Optional[Decimal] = Field(None, description="Цена со скидкой")
    amount: Optional[Decimal] = Field(None, description="Сумма")
    amount_with_discount: Optional[Decimal] = Field(None, description="Сумма со скидкой")
    discount_percent: Optional[Decimal] = Field(None, description="Скидка, %")
    discount_amount: Optional[Decimal] = Field(None, description="Сумма скидки")
    vat_rate: Optional[Decimal] = Field(None, description="Ставка НДС")
    vat_amount: Optional[Decimal] = Field(None, description="Сумма НДС")
    source_file: Optional[str] = Field(None, max_length=500, description="Исходный файл")
    organization: Optional[str] = Field(None, max_length=200, description="Организация")


class TransactionCreate(TransactionBase):
    """
    Схема для создания транзакции
    """
    pass


class TransactionResponse(BaseModel):
    """
    Схема ответа с транзакцией
    """
    id: int
    transaction_date: datetime
    card_number: Optional[str] = None
    vehicle: Optional[str] = None
    vehicle_id: Optional[int] = None
    azs_number: Optional[str] = None
    supplier: Optional[str] = None
    region: Optional[str] = None
    settlement: Optional[str] = None
    location: Optional[str] = None
    location_code: Optional[str] = None
    product: Optional[str] = None
    operation_type: str = "Покупка"
    quantity: Decimal
    currency: str = "RUB"
    exchange_rate: Decimal = 1
    price: Optional[Decimal] = None
    price_with_discount: Optional[Decimal] = None
    amount: Optional[Decimal] = None
    amount_with_discount: Optional[Decimal] = None
    discount_percent: Optional[Decimal] = None
    discount_amount: Optional[Decimal] = None
    vat_rate: Optional[Decimal] = None
    vat_amount: Optional[Decimal] = None
    source_file: Optional[str] = None
    organization: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    # Дополнительные поля для отображения
    vehicle_display_name: Optional[str] = None
    vehicle_has_errors: Optional[bool] = False
    provider_id: Optional[int] = None
    provider_name: Optional[str] = None

    class Config:
        from_attributes = True


class TransactionListResponse(BaseModel):
    """
    Схема ответа со списком транзакций
    """
    total: int
    items: list[TransactionResponse]


class FileUploadResponse(BaseModel):
    """
    Схема ответа на загрузку файла
    """
    message: str
    transactions_created: int
    transactions_skipped: int = 0
    file_name: str
    validation_warnings: list[str] = Field(default_factory=list)
    require_template_selection: bool = False
    available_templates: Optional[list[dict]] = None
    detected_provider_id: Optional[int] = None
    detected_template_id: Optional[int] = None
    match_info: Optional[dict] = None


class VehicleBase(BaseModel):
    """
    Базовая схема транспортного средства
    """
    original_name: str = Field(..., max_length=200, description="Исходное наименование ТС")
    garage_number: Optional[str] = Field(None, max_length=50, description="Гаражный номер")
    license_plate: Optional[str] = Field(None, max_length=20, description="Государственный номер")
    organization_id: Optional[int] = Field(None, description="ID организации")


class VehicleCreate(VehicleBase):
    """
    Схема для создания ТС
    """
    pass


class VehicleUpdate(BaseModel):
    """
    Схема для обновления ТС
    """
    garage_number: Optional[str] = Field(None, max_length=50)
    license_plate: Optional[str] = Field(None, max_length=20)
    is_validated: Optional[str] = Field(None, max_length=10)
    organization_id: Optional[int] = Field(None, description="ID организации")
    
    @field_validator('license_plate')
    @classmethod
    def validate_license_plate(cls, v: Optional[str]) -> Optional[str]:
        """
        Валидация формата госномера
        """
        if not v:
            return v
        
        v = v.strip().upper()
        
        # Проверка на смешанный алфавит
        has_cyrillic = bool(re.search(r'[А-Яа-яЁё]', v))
        has_latin = bool(re.search(r'[A-Za-z]', v))
        if has_cyrillic and has_latin:
            raise ValueError("Обнаружено смешанное использование кириллицы и латиницы в госномере")
        
        # Паттерн для обычного российского госномера
        pattern_standard = r'^[АВЕКМНОРСТУХABEKMHOPCTYX]{1,2}\d{3}[АВЕКМНОРСТУХABEKMHOPCTYX]{2,3}\d{2,3}$'
        # Паттерн для тракторов и спецтехники
        pattern_tractor = r'^\d{4}[АВЕКМНОРСТУХABEKMHOPCTYX]{2}\d{2}$'
        
        if not (re.match(pattern_standard, v) or re.match(pattern_tractor, v)):
            raise ValueError(f"Неверный формат госномера: {v}")
        
        return v


class VehicleResponse(VehicleBase):
    """
    Схема ответа с ТС
    """
    id: int
    is_validated: str
    validation_errors: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class VehicleListResponse(BaseModel):
    """
    Схема ответа со списком ТС
    """
    total: int
    items: list[VehicleResponse]


class GasStationBase(BaseModel):
    """
    Базовая схема автозаправочной станции
    """
    provider_id: Optional[int] = Field(None, description="ID провайдера")
    original_name: str = Field(..., max_length=200, description="Исходное наименование АЗС")
    azs_number: Optional[str] = Field(None, max_length=50, description="Номер АЗС")
    location: Optional[str] = Field(None, max_length=500, description="Местоположение")
    region: Optional[str] = Field(None, max_length=200, description="Регион")
    settlement: Optional[str] = Field(None, max_length=200, description="Населенный пункт")
    latitude: Optional[float] = Field(None, description="Широта", ge=-90, le=90)
    longitude: Optional[float] = Field(None, description="Долгота", ge=-180, le=180)


class GasStationCreate(GasStationBase):
    """
    Схема для создания АЗС
    """
    pass


class GasStationUpdate(BaseModel):
    """
    Схема для обновления АЗС
    """
    provider_id: Optional[int] = Field(None, description="ID провайдера")
    original_name: Optional[str] = Field(None, max_length=200)
    azs_number: Optional[str] = Field(None, max_length=50)
    location: Optional[str] = Field(None, max_length=500)
    region: Optional[str] = Field(None, max_length=200)
    settlement: Optional[str] = Field(None, max_length=200)
    latitude: Optional[float] = Field(None, description="Широта", ge=-90, le=90)
    longitude: Optional[float] = Field(None, description="Долгота", ge=-180, le=180)
    is_validated: Optional[str] = Field(None, max_length=10)


class GasStationResponse(GasStationBase):
    """
    Схема ответа с АЗС
    """
    id: int
    is_validated: str = "pending"
    validation_errors: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class GasStationListResponse(BaseModel):
    """
    Схема ответа со списком АЗС
    """
    total: int
    items: list[GasStationResponse]


class FuelCardBase(BaseModel):
    """
    Базовая схема топливной карты
    """
    card_number: str = Field(..., max_length=50, description="Номер карты")
    provider_id: Optional[int] = Field(None, description="ID провайдера")
    vehicle_id: Optional[int] = Field(None, description="ID транспортного средства")
    assignment_start_date: Optional[date] = Field(None, description="Дата начала закрепления")
    assignment_end_date: Optional[date] = Field(None, description="Дата окончания закрепления")
    is_active_assignment: Optional[bool] = Field(True, description="Активное закрепление")
    is_blocked: Optional[bool] = Field(False, description="Карта заблокирована")


class FuelCardCreate(FuelCardBase):
    """
    Схема для создания карты
    """
    pass


class FuelCardUpdate(BaseModel):
    """
    Схема для обновления карты
    """
    provider_id: Optional[int] = None
    vehicle_id: Optional[int] = None
    assignment_start_date: Optional[date] = None
    assignment_end_date: Optional[date] = None
    is_active_assignment: Optional[bool] = None
    is_blocked: Optional[bool] = None
    
    @model_validator(mode='after')
    def validate_dates(self):
        """
        Валидация дат закрепления: end_date должна быть >= start_date
        """
        if (self.assignment_end_date and self.assignment_start_date and 
            self.assignment_end_date < self.assignment_start_date):
            raise ValueError("Дата окончания закрепления не может быть раньше даты начала")
        return self


class FuelCardResponse(FuelCardBase):
    """
    Схема ответа с картой
    """
    id: int
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class FuelCardListResponse(BaseModel):
    """
    Схема ответа со списком карт
    """
    total: int
    items: list[FuelCardResponse]


class ProviderBase(BaseModel):
    """
    Базовая схема провайдера
    """
    name: str = Field(..., max_length=100, description="Название провайдера")
    code: str = Field(..., max_length=50, description="Код провайдера")
    organization_id: Optional[int] = Field(None, description="ID организации")
    is_active: Optional[bool] = Field(True, description="Активен")


class ProviderCreate(ProviderBase):
    """
    Схема для создания провайдера
    """
    pass


class ProviderUpdate(BaseModel):
    """
    Схема для обновления провайдера
    """
    name: Optional[str] = Field(None, max_length=100)
    code: Optional[str] = Field(None, max_length=50)
    organization_id: Optional[int] = Field(None, description="ID организации")
    is_active: Optional[bool] = None


class ProviderResponse(ProviderBase):
    """
    Схема ответа с провайдером
    """
    id: int
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class ProviderListResponse(BaseModel):
    """
    Схема ответа со списком провайдеров
    """
    total: int
    items: list[ProviderResponse]


class ProviderTemplateBase(BaseModel):
    """
    Базовая схема шаблона провайдера
    """
    provider_id: int = Field(..., description="ID провайдера")
    name: str = Field(..., max_length=200, description="Название шаблона")
    description: Optional[str] = Field(None, max_length=500, description="Описание шаблона")
    connection_type: Optional[str] = Field("file", max_length=50, description="Тип подключения: file, firebird, api, web")
    connection_settings: Optional[Dict[str, Any]] = Field(None, description="Настройки подключения (для Firebird или API)")
    field_mapping: Dict[str, str] = Field(..., description="Маппинг полей шаблона")
    header_row: Optional[int] = Field(0, description="Номер строки с заголовками")
    data_start_row: Optional[int] = Field(1, description="Номер строки начала данных")
    source_table: Optional[str] = Field(None, max_length=200, description="Имя таблицы в БД Firebird")
    source_query: Optional[str] = Field(None, description="SQL запрос для получения данных из Firebird")
    fuel_type_mapping: Optional[Dict[str, str]] = Field(None, description="Маппинг видов топлива для нормализации")
    is_active: Optional[bool] = Field(True, description="Активен")
    auto_load_enabled: Optional[bool] = Field(False, description="Включена ли автоматическая загрузка")
    auto_load_schedule: Optional[str] = Field(None, max_length=100, description="Расписание автоматической загрузки (cron-выражение)")
    auto_load_date_from_offset: Optional[int] = Field(-7, description="Смещение в днях для начальной даты загрузки")
    auto_load_date_to_offset: Optional[int] = Field(-1, description="Смещение в днях для конечной даты загрузки")


class ProviderTemplateCreate(ProviderTemplateBase):
    """
    Схема для создания шаблона
    """
    pass


class ProviderTemplateUpdate(BaseModel):
    """
    Схема для обновления шаблона
    """
    name: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = Field(None, max_length=500)
    connection_type: Optional[str] = Field(None, max_length=50)
    connection_settings: Optional[Dict[str, Any]] = None
    field_mapping: Optional[Dict[str, str]] = None
    header_row: Optional[int] = None
    data_start_row: Optional[int] = None
    source_table: Optional[str] = Field(None, max_length=200)
    source_query: Optional[str] = None
    fuel_type_mapping: Optional[Dict[str, str]] = None
    is_active: Optional[bool] = None
    auto_load_enabled: Optional[bool] = None
    auto_load_schedule: Optional[str] = Field(None, max_length=100)
    auto_load_date_from_offset: Optional[int] = None
    auto_load_date_to_offset: Optional[int] = None


class ProviderTemplateResponse(ProviderTemplateBase):
    """
    Схема ответа с шаблоном
    """
    id: int
    created_at: datetime
    updated_at: Optional[datetime]
    last_auto_load_date: Optional[datetime] = None

    @model_validator(mode='before')
    @classmethod
    def parse_json_fields(cls, data: Any) -> Any:
        """
        Преобразование JSON строк в словари для полей field_mapping и connection_settings
        Обрабатывает как объекты SQLAlchemy, так и словари
        """
        # Если это объект SQLAlchemy, преобразуем в словарь
        if hasattr(data, '__dict__'):
            data_dict = {}
            # Используем __dict__ для получения всех атрибутов
            for key, value in data.__dict__.items():
                if not key.startswith('_'):
                    data_dict[key] = value
            # Также проверяем, есть ли у объекта метод для получения всех колонок
            # Это нужно для случаев, когда некоторые поля не загружены в __dict__
            if hasattr(data, '__table__'):
                from sqlalchemy import inspect
                mapper = inspect(data.__class__)
                for column in mapper.columns:
                    col_name = column.key
                    if col_name not in data_dict and hasattr(data, col_name):
                        data_dict[col_name] = getattr(data, col_name)
            data = data_dict
        
        if isinstance(data, dict):
            # Преобразуем field_mapping из JSON строки в словарь
            field_mapping_value = data.get('field_mapping')
            if field_mapping_value is None:
                data['field_mapping'] = {}
            elif isinstance(field_mapping_value, str) and field_mapping_value.strip():
                try:
                    data['field_mapping'] = json.loads(field_mapping_value)
                except (json.JSONDecodeError, TypeError):
                    data['field_mapping'] = {}
            elif not isinstance(field_mapping_value, dict):
                data['field_mapping'] = {}
            
            # Преобразуем connection_settings из JSON строки в словарь
            connection_settings_value = data.get('connection_settings')
            if connection_settings_value is None:
                data['connection_settings'] = None
            elif isinstance(connection_settings_value, str) and connection_settings_value.strip():
                try:
                    parsed_settings = json.loads(connection_settings_value)
                    # Расшифровываем пароль для использования (но не возвращаем в API)
                    from app.utils.encryption import decrypt_connection_settings
                    parsed_settings = decrypt_connection_settings(parsed_settings)
                    # Скрываем пароль в ответе (не возвращаем в API)
                    if isinstance(parsed_settings, dict) and 'password' in parsed_settings:
                        parsed_settings = {k: v for k, v in parsed_settings.items() if k != 'password'}
                    data['connection_settings'] = parsed_settings
                except (json.JSONDecodeError, TypeError):
                    data['connection_settings'] = None
            elif isinstance(connection_settings_value, dict):
                # Расшифровываем пароль для использования (но не возвращаем в API)
                from app.utils.encryption import decrypt_connection_settings
                parsed_settings = decrypt_connection_settings(connection_settings_value.copy())
                # Скрываем пароль в ответе (не возвращаем в API)
                if 'password' in parsed_settings:
                    parsed_settings = {k: v for k, v in parsed_settings.items() if k != 'password'}
                data['connection_settings'] = parsed_settings
            
            # Преобразуем fuel_type_mapping из JSON строки в словарь
            fuel_type_mapping_value = data.get('fuel_type_mapping')
            if fuel_type_mapping_value is None:
                data['fuel_type_mapping'] = None
            elif isinstance(fuel_type_mapping_value, str) and fuel_type_mapping_value.strip():
                try:
                    data['fuel_type_mapping'] = json.loads(fuel_type_mapping_value)
                except (json.JSONDecodeError, TypeError):
                    data['fuel_type_mapping'] = None
            elif not isinstance(fuel_type_mapping_value, dict):
                data['fuel_type_mapping'] = None
            
            # Устанавливаем дефолтные значения для новых полей, если они отсутствуют
            if 'connection_type' not in data or data.get('connection_type') is None:
                data['connection_type'] = "file"
            
            if 'source_table' not in data:
                data['source_table'] = None
            
            if 'source_query' not in data:
                data['source_query'] = None
        
        return data

    class Config:
        from_attributes = True


class ProviderTemplateListResponse(BaseModel):
    """
    Схема ответа со списком шаблонов
    """
    total: int
    items: list[ProviderTemplateResponse]


class CardAssignmentRequest(BaseModel):
    """
    Схема для закрепления карты за ТС
    """
    card_id: int = Field(..., description="ID карты")
    vehicle_id: int = Field(..., description="ID транспортного средства")
    start_date: date = Field(..., description="Дата начала закрепления")
    end_date: Optional[date] = Field(None, description="Дата окончания закрепления")
    check_overlap: Optional[bool] = Field(True, description="Проверять пересечения")
    
    @model_validator(mode='after')
    def validate_dates(self):
        """
        Валидация дат закрепления: end_date должна быть >= start_date
        """
        if self.end_date and self.start_date and self.end_date < self.start_date:
            raise ValueError("Дата окончания закрепления не может быть раньше даты начала")
        return self


class CardAssignmentResponse(BaseModel):
    """
    Схема ответа на закрепление карты
    """
    success: bool
    message: str
    overlaps: Optional[list[Dict[str, Any]]] = None


class UploadPeriodLockBase(BaseModel):
    """
    Базовая схема закрытия периода загрузки
    """
    lock_date: date = Field(..., description="Дата закрытия периода загрузки")


class UploadPeriodLockCreate(UploadPeriodLockBase):
    """
    Схема для установки даты закрытия периода
    """
    
    @field_validator('lock_date')
    @classmethod
    def validate_lock_date(cls, v: date) -> date:
        """
        Валидация даты закрытия периода: не может быть в будущем
        """
        from datetime import date as date_today
        today = date_today.today()
        
        if v > today:
            raise ValueError(f"Дата закрытия периода не может быть в будущем. Текущая дата: {today.strftime('%d.%m.%Y')}")
        
        return v


class UploadPeriodLockResponse(UploadPeriodLockBase):
    """
    Схема ответа с датой закрытия периода
    """
    id: int
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class MergeRequest(BaseModel):
    """
    Схема запроса на слияние записей
    """
    target_id: int = Field(..., description="ID целевой записи (останется после слияния)")


class MergeResponse(BaseModel):
    """
    Схема ответа на слияние записей
    """
    success: bool
    message: str
    transactions_updated: Optional[int] = None
    cards_updated: Optional[int] = None


# ==================== Схемы аутентификации ====================

class UserBase(BaseModel):
    """
    Базовая схема пользователя
    """
    username: str = Field(..., min_length=3, max_length=100, description="Имя пользователя")
    email: str = Field(..., description="Email адрес")


class UserCreate(UserBase):
    """
    Схема для создания пользователя
    """
    password: str = Field(..., min_length=8, description="Пароль (минимум 8 символов)")
    role: Optional[str] = Field(default="user", description="Роль пользователя")


class UserUpdate(BaseModel):
    """
    Схема для обновления пользователя
    """
    email: Optional[str] = Field(None, description="Email адрес")
    password: Optional[str] = Field(None, min_length=8, description="Пароль")
    role: Optional[str] = Field(None, description="Роль пользователя")
    is_active: Optional[bool] = Field(None, description="Активен")


class UserResponse(UserBase):
    """
    Схема ответа с данными пользователя
    """
    id: int
    role: str
    is_active: bool
    is_superuser: bool
    created_at: datetime
    last_login: Optional[datetime] = None
    organization_ids: Optional[list[int]] = Field(default_factory=list, description="ID организаций, к которым у пользователя есть доступ")

    class Config:
        from_attributes = True


class UserListResponse(BaseModel):
    """
    Список пользователей с общим количеством
    """
    total: int
    items: list[UserResponse]


class Token(BaseModel):
    """
    Схема токена доступа
    """
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class TokenData(BaseModel):
    """
    Данные из токена
    """
    username: Optional[str] = None
    user_id: Optional[int] = None
    role: Optional[str] = None


class LoginRequest(BaseModel):
    """
    Схема запроса на вход
    """
    username: str = Field(..., description="Имя пользователя")
    password: str = Field(..., description="Пароль")


class UploadEventResponse(BaseModel):
    """
    Событие загрузки (ручной или регламентной)
    """
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    source_type: str
    status: str
    is_scheduled: bool
    file_name: Optional[str] = None
    provider_id: Optional[int] = None
    provider_name: Optional[str] = None
    template_id: Optional[int] = None
    template_name: Optional[str] = None
    user_id: Optional[int] = None
    username: Optional[str] = None
    transactions_total: int = 0
    transactions_created: int = 0
    transactions_skipped: int = 0
    transactions_failed: int = 0
    duration_ms: Optional[int] = None
    message: Optional[str] = None

    class Config:
        from_attributes = True


class UploadEventStats(BaseModel):
    """
    Агрегированная статистика по событиям загрузок
    """
    total_events: int = 0
    total_records: int = 0
    total_created: int = 0
    total_skipped: int = 0
    total_failed: int = 0
    failed_events: int = 0
    scheduled_events: int = 0


class UploadEventListResponse(BaseModel):
    """
    Ответ списка событий загрузок с пагинацией
    """
    total: int
    items: list[UploadEventResponse]
    stats: UploadEventStats


# ==================== Схемы организаций ====================

class OrganizationBase(BaseModel):
    """
    Базовая схема организации
    """
    name: str = Field(..., max_length=200, description="Название организации")
    code: str = Field(..., max_length=50, description="Код организации")
    description: Optional[str] = Field(None, description="Описание организации")
    
    # Стандартные поля организации
    inn: Optional[str] = Field(None, max_length=20, description="ИНН")
    kpp: Optional[str] = Field(None, max_length=20, description="КПП")
    ogrn: Optional[str] = Field(None, max_length=20, description="ОГРН")
    legal_address: Optional[str] = Field(None, max_length=500, description="Юридический адрес")
    actual_address: Optional[str] = Field(None, max_length=500, description="Фактический адрес")
    phone: Optional[str] = Field(None, max_length=50, description="Телефон")
    email: Optional[str] = Field(None, max_length=255, description="Email")
    website: Optional[str] = Field(None, max_length=255, description="Веб-сайт")
    contact_person: Optional[str] = Field(None, max_length=200, description="Контактное лицо")
    contact_phone: Optional[str] = Field(None, max_length=50, description="Контактный телефон")
    bank_name: Optional[str] = Field(None, max_length=200, description="Название банка")
    bank_account: Optional[str] = Field(None, max_length=50, description="Расчетный счет")
    bank_bik: Optional[str] = Field(None, max_length=20, description="БИК банка")
    bank_correspondent_account: Optional[str] = Field(None, max_length=50, description="Корреспондентский счет")
    
    is_active: Optional[bool] = Field(True, description="Активна")


class OrganizationCreate(OrganizationBase):
    """
    Схема для создания организации
    """
    pass


class OrganizationUpdate(BaseModel):
    """
    Схема для обновления организации
    """
    name: Optional[str] = Field(None, max_length=200)
    code: Optional[str] = Field(None, max_length=50)
    description: Optional[str] = None
    inn: Optional[str] = Field(None, max_length=20)
    kpp: Optional[str] = Field(None, max_length=20)
    ogrn: Optional[str] = Field(None, max_length=20)
    legal_address: Optional[str] = Field(None, max_length=500)
    actual_address: Optional[str] = Field(None, max_length=500)
    phone: Optional[str] = Field(None, max_length=50)
    email: Optional[str] = Field(None, max_length=255)
    website: Optional[str] = Field(None, max_length=255)
    contact_person: Optional[str] = Field(None, max_length=200)
    contact_phone: Optional[str] = Field(None, max_length=50)
    bank_name: Optional[str] = Field(None, max_length=200)
    bank_account: Optional[str] = Field(None, max_length=50)
    bank_bik: Optional[str] = Field(None, max_length=20)
    bank_correspondent_account: Optional[str] = Field(None, max_length=50)
    is_active: Optional[bool] = None


class OrganizationResponse(OrganizationBase):
    """
    Схема ответа с организацией
    """
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class OrganizationListResponse(BaseModel):
    """
    Схема ответа со списком организаций
    """
    total: int
    items: list[OrganizationResponse]


class UserOrganizationAssign(BaseModel):
    """
    Схема для назначения организаций пользователю
    """
    user_id: int = Field(..., description="ID пользователя")
    organization_ids: list[int] = Field(..., description="Список ID организаций")


class OrganizationUserResponse(BaseModel):
    """
    Схема ответа с пользователями организации
    """
    id: int
    username: str
    email: str
    role: str
    is_active: bool

    class Config:
        from_attributes = True


# ==================== Схемы для логирования ====================

class SystemLogResponse(BaseModel):
    """
    Схема ответа с системным логом
    """
    id: int
    level: str
    message: str
    module: Optional[str] = None
    function: Optional[str] = None
    line_number: Optional[int] = None
    event_type: Optional[str] = None
    event_category: Optional[str] = None
    extra_data: Optional[str] = None
    exception_type: Optional[str] = None
    exception_message: Optional[str] = None
    stack_trace: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class SystemLogListResponse(BaseModel):
    """
    Схема ответа со списком системных логов
    """
    total: int
    items: list[SystemLogResponse]


class UserActionLogResponse(BaseModel):
    """
    Схема ответа с логом действия пользователя
    """
    id: int
    user_id: Optional[int] = None
    username: Optional[str] = None
    action_type: str
    action_category: Optional[str] = None
    action_description: str
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    request_data: Optional[str] = None
    response_data: Optional[str] = None
    changes: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    request_method: Optional[str] = None
    request_path: Optional[str] = None
    status: str
    error_message: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class UserActionLogListResponse(BaseModel):
    """
    Схема ответа со списком логов действий пользователей
    """
    total: int
    items: list[UserActionLogResponse]
