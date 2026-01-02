"""
Pydantic схемы для валидации данных API
"""
from pydantic import BaseModel, Field, field_validator, model_validator
from datetime import datetime, date
from decimal import Decimal
from typing import Optional, Dict, Any, List
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
    gas_station_name: Optional[str] = None

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
    name: Optional[str] = Field(None, max_length=200, description="Наименование АЗС (редактируемое)")
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
    name: Optional[str] = Field(None, max_length=200, description="Наименование АЗС (редактируемое)")
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


class FuelTypeBase(BaseModel):
    """
    Базовая схема вида топлива
    """
    original_name: str = Field(..., max_length=200, description="Исходное наименование вида топлива")
    normalized_name: Optional[str] = Field(None, max_length=200, description="Нормализованное наименование вида топлива (редактируемое)")


class FuelTypeCreate(FuelTypeBase):
    """
    Схема для создания вида топлива
    """
    pass


class FuelTypeUpdate(BaseModel):
    """
    Схема для обновления вида топлива
    """
    original_name: Optional[str] = Field(None, max_length=200)
    normalized_name: Optional[str] = Field(None, max_length=200, description="Нормализованное наименование вида топлива (редактируемое)")
    is_validated: Optional[str] = Field(None, max_length=10)


class FuelTypeResponse(FuelTypeBase):
    """
    Схема ответа с видом топлива
    """
    id: int
    is_validated: str = "pending"
    validation_errors: Optional[str] = None
    transactions_count: Optional[int] = Field(None, description="Количество транзакций с этим видом топлива")
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class FuelTypeListResponse(BaseModel):
    """
    Схема ответа со списком видов топлива
    """
    total: int
    items: list[FuelTypeResponse]


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
    original_owner_name: Optional[str] = Field(None, max_length=200, description="Исходное наименование Владельца")
    normalized_owner: Optional[str] = Field(None, max_length=200, description="Нормализованный владелец")


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
    original_owner_name: Optional[str] = Field(None, max_length=200, description="Исходное наименование Владельца")
    normalized_owner: Optional[str] = Field(None, max_length=200, description="Нормализованный владелец")
    
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


class CardInfoResponse(BaseModel):
    """
    Схема ответа с информацией по карте из Web API
    """
    card_number: Optional[str] = None
    cod_a: Optional[str] = None
    cod_own: Optional[str] = None
    application_type: Optional[int] = None
    application_type_name: Optional[str] = None
    application_key: Optional[str] = None
    balance: Optional[float] = None
    bonus_program: Optional[int] = None
    state: Optional[int] = None
    state_name: Optional[str] = None
    person_name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    patronymic: Optional[str] = None
    birth_date: Optional[str] = None
    phone_number: Optional[str] = None
    sex: Optional[str] = None


class NormalizeOwnerRequest(BaseModel):
    """
    Схема запроса на нормализацию владельца
    """
    owner_name: str = Field(..., description="Исходное наименование владельца")


class NormalizeOwnerResponse(BaseModel):
    """
    Схема ответа с нормализованными данными владельца
    """
    normalized: Optional[str] = None
    license_plate: Optional[str] = None
    garage_number: Optional[str] = None
    company_name: Optional[str] = None


class NormalizationOptions(BaseModel):
    """
    Опции нормализации
    """
    case: Optional[str] = Field("preserve", description="Регистр: upper, lower, title, preserve")
    remove_special_chars: Optional[bool] = Field(False, description="Удалять спецсимволы")
    remove_extra_spaces: Optional[bool] = Field(True, description="Удалять лишние пробелы")
    trim: Optional[bool] = Field(True, description="Обрезать пробелы в начале/конце")
    priority_license_plate: Optional[bool] = Field(True, description="Приоритет госномера")
    priority_garage_number: Optional[bool] = Field(True, description="Приоритет гаражного номера")
    min_garage_number_length: Optional[int] = Field(2, description="Минимальная длина гаражного номера")
    max_garage_number_length: Optional[int] = Field(10, description="Максимальная длина гаражного номера")
    remove_chars: Optional[list[str]] = Field(default_factory=list, description="Список символов для удаления")


class NormalizationSettingsBase(BaseModel):
    """
    Базовая схема настроек нормализации
    """
    dictionary_type: str = Field(..., description="Тип справочника: fuel_card_owner, vehicle, gas_station, fuel_type")
    options: NormalizationOptions = Field(..., description="Опции нормализации")


class NormalizationSettingsCreate(NormalizationSettingsBase):
    """
    Схема для создания настроек нормализации
    """
    pass


class NormalizationSettingsUpdate(BaseModel):
    """
    Схема для обновления настроек нормализации
    """
    options: Optional[NormalizationOptions] = Field(None, description="Опции нормализации")


class NormalizationSettingsResponse(NormalizationSettingsBase):
    """
    Схема ответа с настройками нормализации
    """
    id: int
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class NormalizationSettingsListResponse(BaseModel):
    """
    Схема ответа со списком настроек нормализации
    """
    total: int
    items: list[NormalizationSettingsResponse]


class CardInfoScheduleFilterOptions(BaseModel):
    """
    Опции фильтрации карт для регламента
    
    Примечание: provider_ids не используется, так как провайдер определяется выбранным шаблоном провайдера
    """
    card_numbers: Optional[list[str]] = Field(default_factory=list, description="Конкретные номера карт (если пусто - все карты провайдера)")
    only_with_vehicle: Optional[bool] = Field(False, description="Только карты, привязанные к ТС")
    only_blocked: Optional[bool] = Field(False, description="Только заблокированные карты")
    only_active: Optional[bool] = Field(False, description="Только активные карты")


class CardInfoScheduleBase(BaseModel):
    """
    Базовая схема регламента получения информации по картам
    """
    name: str = Field(..., max_length=200, description="Название регламента")
    description: Optional[str] = Field(None, max_length=500, description="Описание")
    provider_template_id: int = Field(..., description="ID шаблона провайдера с типом 'web'")
    schedule: str = Field(..., max_length=100, description="Расписание (cron-выражение или daily/hourly/weekly)")
    filter_options: Optional[CardInfoScheduleFilterOptions] = Field(default_factory=CardInfoScheduleFilterOptions, description="Фильтр карт")
    auto_update: Optional[bool] = Field(True, description="Автоматически обновлять карты")
    flags: Optional[int] = Field(23, description="Флаги реквизитов для запроса (1+2+4+16=ФИО+телефон)")
    is_active: Optional[bool] = Field(True, description="Активен")


class CardInfoScheduleCreate(CardInfoScheduleBase):
    """
    Схема для создания регламента
    """
    pass


class CardInfoScheduleUpdate(BaseModel):
    """
    Схема для обновления регламента
    """
    name: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = Field(None, max_length=500)
    provider_template_id: Optional[int] = None
    schedule: Optional[str] = Field(None, max_length=100)
    filter_options: Optional[CardInfoScheduleFilterOptions] = None
    auto_update: Optional[bool] = None
    flags: Optional[int] = None
    is_active: Optional[bool] = None


class CardInfoScheduleRunResult(BaseModel):
    """
    Результат выполнения регламента
    """
    status: str = Field(..., description="success, error, partial")
    cards_processed: int = Field(0, description="Количество обработанных карт")
    cards_updated: int = Field(0, description="Количество обновленных карт")
    cards_failed: int = Field(0, description="Количество карт с ошибками")
    error_message: Optional[str] = Field(None, description="Сообщение об ошибке")


class CardInfoScheduleResponse(CardInfoScheduleBase):
    """
    Схема ответа с регламентом
    """
    id: int
    last_run_date: Optional[datetime] = None
    last_run_result: Optional[CardInfoScheduleRunResult] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CardInfoScheduleListResponse(BaseModel):
    """
    Схема ответа со списком регламентов
    """
    total: int
    items: list[CardInfoScheduleResponse]


class CardInfoRequest(BaseModel):
    """
    Схема запроса информации по карте
    """
    card_number: str = Field(..., description="Номер карты")
    flags: Optional[int] = Field(23, description="Битовая маска реквизитов (1=FirstName, 2=LastName, 4=Patronymic, 8=BirthDate, 16=PhoneNumber, 32=Sex)")
    provider_template_id: Optional[int] = Field(None, description="ID шаблона провайдера с настройками Web API")
    update_card: Optional[bool] = Field(True, description="Автоматически обновить топливную карту данными из API")


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
                    # Скрываем чувствительные данные в ответе (не возвращаем в API)
                    # НЕ скрываем api_key - это ключ для нашего PPR API, а не внешний пароль
                    if isinstance(parsed_settings, dict):
                        sensitive_fields = ['password', 'api_token', 'api_secret', 
                                          'xml_api_key', 'xml_api_signature', 'xml_api_salt', 
                                          'certificate', 'secret', 'token']
                        parsed_settings = {k: v for k, v in parsed_settings.items() 
                                         if k not in sensitive_fields}
                    data['connection_settings'] = parsed_settings
                except (json.JSONDecodeError, TypeError):
                    data['connection_settings'] = None
            elif isinstance(connection_settings_value, dict):
                # Расшифровываем чувствительные данные для использования (но не возвращаем в API)
                from app.utils.encryption import decrypt_connection_settings
                parsed_settings = decrypt_connection_settings(connection_settings_value.copy())
                # Скрываем чувствительные данные в ответе (не возвращаем в API)
                # НЕ скрываем api_key - это ключ для нашего PPR API, а не внешний пароль
                sensitive_fields = ['password', 'api_token', 'api_secret', 
                                  'xml_api_key', 'xml_api_signature', 'xml_api_salt', 
                                  'certificate', 'secret', 'token']
                parsed_settings = {k: v for k, v in parsed_settings.items() 
                                 if k not in sensitive_fields}
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


# ==================== Схемы для анализа топливных карт ====================

class VehicleRefuelBase(BaseModel):
    """
    Базовая схема заправки ТС
    """
    vehicle_id: int = Field(..., description="ID транспортного средства")
    refuel_date: datetime = Field(..., description="Дата и время заправки")
    fuel_type: Optional[str] = Field(None, max_length=200, description="Тип топлива")
    quantity: Decimal = Field(..., description="Количество заправленного топлива (литры)")
    fuel_level_before: Optional[Decimal] = Field(None, description="Уровень топлива до заправки")
    fuel_level_after: Optional[Decimal] = Field(None, description="Уровень топлива после заправки")
    odometer_reading: Optional[Decimal] = Field(None, description="Показания одометра")
    source_system: str = Field(..., max_length=100, description="Источник данных")
    source_id: Optional[str] = Field(None, max_length=200, description="ID записи в системе-источнике")
    latitude: Optional[Decimal] = Field(None, description="Широта места заправки")
    longitude: Optional[Decimal] = Field(None, description="Долгота места заправки")
    location_accuracy: Optional[Decimal] = Field(None, description="Точность определения местоположения (метры)")


class VehicleRefuelCreate(VehicleRefuelBase):
    """
    Схема для создания заправки ТС
    """
    pass


class VehicleRefuelResponse(VehicleRefuelBase):
    """
    Схема ответа с заправкой ТС
    """
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class VehicleLocationBase(BaseModel):
    """
    Базовая схема местоположения ТС
    """
    vehicle_id: int = Field(..., description="ID транспортного средства")
    timestamp: datetime = Field(..., description="Дата и время фиксации местоположения")
    latitude: Decimal = Field(..., description="Широта")
    longitude: Decimal = Field(..., description="Долгота")
    speed: Optional[Decimal] = Field(None, description="Скорость движения (км/ч)")
    heading: Optional[Decimal] = Field(None, description="Направление движения (градусы)")
    accuracy: Optional[Decimal] = Field(None, description="Точность определения местоположения (метры)")
    source: str = Field(default="GLONASS", max_length=100, description="Источник данных")


class VehicleLocationCreate(VehicleLocationBase):
    """
    Схема для создания местоположения ТС
    """
    pass


class VehicleLocationResponse(VehicleLocationBase):
    """
    Схема ответа с местоположением ТС
    """
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class FuelCardAnalysisResultResponse(BaseModel):
    """
    Схема ответа с результатом анализа
    """
    id: int
    transaction_id: int
    refuel_id: Optional[int] = None
    fuel_card_id: Optional[int] = None
    vehicle_id: Optional[int] = None
    analysis_date: datetime
    match_status: str
    match_confidence: Optional[Decimal] = None
    distance_to_azs: Optional[Decimal] = None
    time_difference: Optional[int] = None
    quantity_difference: Optional[Decimal] = None
    analysis_details: Optional[str] = None
    is_anomaly: bool
    anomaly_type: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class FuelCardAnalysisResultListResponse(BaseModel):
    """
    Схема ответа со списком результатов анализа
    """
    total: int
    items: list[FuelCardAnalysisResultResponse]


class AnalyzePeriodRequest(BaseModel):
    """
    Схема запроса для массового анализа
    """
    date_from: datetime = Field(..., description="Начальная дата периода")
    date_to: datetime = Field(..., description="Конечная дата периода")
    card_ids: Optional[List[int]] = Field(None, description="Список ID карт для фильтрации")
    vehicle_ids: Optional[List[int]] = Field(None, description="Список ID ТС для фильтрации")
    organization_ids: Optional[List[int]] = Field(None, description="Список ID организаций для фильтрации")
    time_window_minutes: Optional[int] = Field(None, description="Временное окно в минутах")
    quantity_tolerance_percent: Optional[float] = Field(None, description="Допустимое отклонение количества в %")
    azs_radius_meters: Optional[int] = Field(None, description="Радиус АЗС в метрах")


class AnalyzePeriodResponse(BaseModel):
    """
    Схема ответа для массового анализа
    """
    statistics: Dict[str, Any] = Field(..., description="Статистика анализа")
    errors: List[Dict[str, Any]] = Field(default_factory=list, description="Ошибки при анализе")


class AnomalyStatsResponse(BaseModel):
    """
    Схема ответа со статистикой по аномалиям
    """
    total_anomalies: int
    by_type: Dict[str, int] = Field(default_factory=dict, description="Количество аномалий по типам")
    by_status: Dict[str, int] = Field(default_factory=dict, description="Количество аномалий по статусам")
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None


class BulkRefuelsUploadRequest(BaseModel):
    """
    Схема запроса для массовой загрузки заправок
    """
    refuels: List[VehicleRefuelCreate] = Field(..., description="Список заправок для загрузки")


class BulkLocationsUploadRequest(BaseModel):
    """
    Схема запроса для массовой загрузки местоположений
    """
    locations: List[VehicleLocationCreate] = Field(..., description="Список местоположений для загрузки")


class BulkUploadResponse(BaseModel):
    """
    Схема ответа для массовой загрузки
    """
    created: int = Field(..., description="Количество созданных записей")
    errors: List[Dict[str, Any]] = Field(default_factory=list, description="Ошибки при загрузке")


# ==================== Схемы для уведомлений ====================

class NotificationCategories(BaseModel):
    """
    Настройки категорий уведомлений
    """
    upload_events: Optional[bool] = Field(True, description="Уведомления о загрузках")
    errors: Optional[bool] = Field(True, description="Уведомления об ошибках")
    system: Optional[bool] = Field(False, description="Системные уведомления")
    transactions: Optional[bool] = Field(False, description="Уведомления о транзакциях")


class NotificationSettingsBase(BaseModel):
    """
    Базовая схема настроек уведомлений
    """
    email_enabled: Optional[bool] = Field(True, description="Включены ли уведомления по email")
    telegram_enabled: Optional[bool] = Field(False, description="Включены ли уведомления в Telegram")
    push_enabled: Optional[bool] = Field(True, description="Включены ли push-уведомления")
    in_app_enabled: Optional[bool] = Field(True, description="Включены ли уведомления в системе")
    telegram_chat_id: Optional[str] = Field(None, max_length=100, description="ID чата Telegram")
    telegram_username: Optional[str] = Field(None, max_length=100, description="Имя пользователя Telegram")
    push_subscription: Optional[Dict[str, Any]] = Field(None, description="Данные подписки на push-уведомления")
    categories: Optional[Dict[str, bool]] = Field(None, description="Настройки категорий уведомлений (как словарь)")


class NotificationSettingsCreate(NotificationSettingsBase):
    """
    Схема для создания настроек уведомлений
    """
    pass


class NotificationSettingsUpdate(NotificationSettingsBase):
    """
    Схема для обновления настроек уведомлений
    """
    pass


class NotificationSettingsResponse(NotificationSettingsBase):
    """
    Схема ответа с настройками уведомлений
    """
    id: int
    user_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class NotificationBase(BaseModel):
    """
    Базовая схема уведомления
    """
    title: str = Field(..., max_length=200, description="Заголовок уведомления")
    message: str = Field(..., description="Текст уведомления")
    category: Optional[str] = Field("system", max_length=100, description="Категория уведомления")
    type: Optional[str] = Field("info", max_length=50, description="Тип уведомления: info, success, warning, error")
    entity_type: Optional[str] = Field(None, max_length=100, description="Тип связанной сущности")
    entity_id: Optional[int] = Field(None, description="ID связанной сущности")


class NotificationCreate(NotificationBase):
    """
    Схема для создания уведомления
    """
    user_id: Optional[int] = Field(None, description="ID пользователя (если не указан, отправляется текущему пользователю)")
    channels: Optional[List[str]] = Field(None, description="Каналы для отправки: email, telegram, push, in_app (если не указано, используются настройки пользователя)")
    force: bool = Field(False, description="Если True, игнорирует настройки пользователя и отправляет через все указанные каналы")


class NotificationResponse(NotificationBase):
    """
    Схема ответа с уведомлением
    """
    id: int
    user_id: int
    is_read: bool
    read_at: Optional[datetime] = None
    delivery_status: Optional[Dict[str, str]] = None
    created_at: datetime

    class Config:
        from_attributes = True


class NotificationListResponse(BaseModel):
    """
    Схема ответа со списком уведомлений
    """
    total: int
    items: List[NotificationResponse]
    unread_count: int = Field(0, description="Количество непрочитанных уведомлений")


class NotificationMarkReadRequest(BaseModel):
    """
    Схема запроса на отметку уведомлений как прочитанных
    """
    notification_ids: Optional[List[int]] = Field(None, description="Список ID уведомлений (если не указан, помечаются все как прочитанные)")


class NotificationMarkReadResponse(BaseModel):
    """
    Схема ответа на отметку уведомлений как прочитанных
    """
    marked_count: int = Field(..., description="Количество помеченных уведомлений")


class PushSubscriptionRequest(BaseModel):
    """
    Схема запроса на регистрацию подписки на push-уведомления
    """
    subscription: Dict[str, Any] = Field(..., description="Данные подписки на push-уведомления")