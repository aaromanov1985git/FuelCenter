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


class VehicleBase(BaseModel):
    """
    Базовая схема транспортного средства
    """
    original_name: str = Field(..., max_length=200, description="Исходное наименование ТС")
    garage_number: Optional[str] = Field(None, max_length=50, description="Гаражный номер")
    license_plate: Optional[str] = Field(None, max_length=20, description="Государственный номер")


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
    connection_type: Optional[str] = Field("file", max_length=50, description="Тип подключения: file, firebird, api")
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
            for key, value in data.__dict__.items():
                if not key.startswith('_'):
                    data_dict[key] = value
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
