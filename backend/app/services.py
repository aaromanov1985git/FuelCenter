"""
Сервисы для обработки бизнес-логики (Legacy)
DEPRECATED: Этот файл постепенно мигрируется в специализированные сервисы

Используйте вместо этого:
- app.services.normalization_service - для нормализации данных
- app.services.fuzzy_matching_service - для нечёткого поиска
"""
import pandas as pd
import json
import re
from datetime import datetime, date
from decimal import Decimal
from typing import List, Dict, Tuple, Optional, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from sqlalchemy.exc import IntegrityError
from rapidfuzz import fuzz, process
from app.models import Transaction, Vehicle, FuelCard, Provider, ProviderTemplate, GasStation
from app.schemas import TransactionCreate
from app.validators import (
    parse_vehicle_field,
    validate_vehicle_data,
    detect_mixed_alphabet,
    validate_gas_station_data
)

# Импортируем из новых сервисов для обратной совместимости
from app.services.normalization_service import (
    normalize_fuel as _normalize_fuel,
    normalize_vehicle_name as _normalize_vehicle_name,
    normalize_card_number as _normalize_card_number,
    extract_azs_number as _extract_azs_number
)
from app.services.fuzzy_matching_service import (
    find_similar_vehicles as _find_similar_vehicles,
    find_similar_cards as _find_similar_cards
)
from app.services.data_parsing_service import (
    parse_excel_date as _parse_excel_date,
    convert_to_decimal as _convert_to_decimal
)
from app.services.fuel_card_service import (
    get_or_create_fuel_card as _get_or_create_fuel_card
)
from app.services.entity_management_service import (
    check_card_overlap as _check_card_overlap,
    assign_card_to_vehicle as _assign_card_to_vehicle
)


# DEPRECATED: Используйте app.services.normalization_service.normalize_fuel
def normalize_fuel(fuel: str) -> str:
    """DEPRECATED: Используйте app.services.normalization_service.normalize_fuel"""
    return _normalize_fuel(fuel)


# DEPRECATED: Используйте app.services.normalization_service.normalize_vehicle_name
def normalize_vehicle_name(vehicle_name: str) -> str:
    """DEPRECATED: Используйте app.services.normalization_service.normalize_vehicle_name"""
    return _normalize_vehicle_name(vehicle_name)


# DEPRECATED: Используйте app.services.normalization_service.normalize_card_number
def normalize_card_number(card_number: str) -> str:
    """DEPRECATED: Используйте app.services.normalization_service.normalize_card_number"""
    return _normalize_card_number(card_number)


# DEPRECATED: Используйте app.services.fuzzy_matching_service.find_similar_vehicles
def find_similar_vehicles(
    db: Session,
    vehicle_name: str,
    threshold: int = 85
) -> List[Tuple[Vehicle, int]]:
    """DEPRECATED: Используйте app.services.fuzzy_matching_service.find_similar_vehicles"""
    return _find_similar_vehicles(db, vehicle_name, threshold)


# DEPRECATED: Используйте app.services.fuzzy_matching_service.find_similar_cards
def find_similar_cards(
    db: Session,
    card_number: str,
    threshold: int = 90
) -> List[Tuple[FuelCard, int]]:
    """DEPRECATED: Используйте app.services.fuzzy_matching_service.find_similar_cards"""
    return _find_similar_cards(db, card_number, threshold)


# DEPRECATED: Используйте app.services.normalization_service.extract_azs_number
def extract_azs_number(kazs: str) -> str:
    """DEPRECATED: Используйте app.services.normalization_service.extract_azs_number"""
    return _extract_azs_number(kazs)


# DEPRECATED: Используйте app.services.data_parsing_service.parse_excel_date
def parse_excel_date(date_value) -> datetime:
    """DEPRECATED: Используйте app.services.data_parsing_service.parse_excel_date"""
    return _parse_excel_date(date_value)


# DEPRECATED: Используйте app.services.data_parsing_service.convert_to_decimal
def convert_to_decimal(value) -> Decimal:
    """DEPRECATED: Используйте app.services.data_parsing_service.convert_to_decimal"""
    return _convert_to_decimal(value)


def analyze_template_structure(file_path: str) -> Dict[str, Any]:
    """
    Автоматический анализ структуры Excel файла для определения маппинга полей
    
    Возвращает словарь с найденными полями и их позициями
    """
    try:
        df = pd.read_excel(file_path, header=None, engine="openpyxl")
    except Exception as e:
        raise ValueError(f"Ошибка чтения Excel файла: {str(e)}")
    
    # Ищем строку с заголовками - более агрессивный поиск
    header_row = -1
    header_keywords = [
        "организация", "пользователь", "казс", "номер карты", "карта", 
        "дата", "кол-во", "количество", "вид топлива", "топливо", "товар",
        "закреплена", "тс", "азс", "литры"
    ]
    
    best_match_score = 0
    best_match_row = -1
    
    # Проверяем первые 30 строк
    for i in range(min(len(df), 30)):
        row_values = [str(cell).strip() for cell in df.iloc[i].values if pd.notna(cell)]
        row_str = " ".join(row_values).lower()
        
        # Подсчитываем количество найденных ключевых слов
        found_keywords = [kw for kw in header_keywords if kw.lower() in row_str]
        score = len(found_keywords)
        
        # Дополнительные бонусы за важные поля
        if any(kw in row_str for kw in ["дата", "кол-во", "количество", "вид топлива", "топливо"]):
            score += 2
        
        if score > best_match_score:
            best_match_score = score
            best_match_row = i
    
    # Если нашли хорошее совпадение (минимум 3 ключевых слова)
    if best_match_score >= 3:
        header_row = best_match_row
    else:
        # Fallback: ищем первую строку с несколькими непустыми ячейками
        for i in range(min(len(df), 10)):
            non_empty_count = sum(1 for cell in df.iloc[i].values if pd.notna(cell) and str(cell).strip())
            if non_empty_count >= 5:
                header_row = i
                break
    
    if header_row == -1:
        raise ValueError("Не найдена строка с заголовками")
    
    # Определяем индексы колонок
    header_row_data = []
    for cell in df.iloc[header_row].values:
        if pd.notna(cell):
            header_row_data.append(str(cell).strip())
        else:
            header_row_data.append("")
    
    header_row_data_lower = [cell.lower() for cell in header_row_data]
    
    # Расширенный маппинг полей с множественными вариантами
    field_mapping = {}
    
    # Расширенные ключевые слова для каждого поля (в порядке приоритета)
    field_keywords = {
        "user": [
            "пользователь", "тс", "закреплена за", "закреплена", "транспортное средство",
            "автомобиль", "машина", "водитель", "ф.и.о.", "фио"
        ],
        "card": [
            "номер карты", "карты", "карта", "№ карты", "номер топливной карты",
            "топливная карта", "карта номер", "card", "card number"
        ],
        "kazs": [
            "казс", "азс", "номер азс", "азс номер", "№ азс", "станция",
            "заправочная станция", "gas station", "азс/казс"
        ],
        "date": [
            "дата", "дата и время", "дата/время", "дата время", "время",
            "дата транзакции", "дата операции", "date", "datetime", "дата/время"
        ],
        "quantity": [
            "кол-во", "количество", "литры", "литр", "объем", "объём",
            "литров", "л.", "л", "quantity", "qty", "объем топлива"
        ],
        "fuel": [
            "вид топлива", "топливо", "товар", "марка топлива", "тип топлива",
            "наименование", "наименование товара", "product", "fuel", "fuel type",
            "товар/услуга", "товар услуга"
        ],
        "organization": [
            "организация", "орг", "организация получатель", "получатель",
            "компания", "юридическое лицо", "organization", "org", "company"
        ]
    }
    
    # Функция для нормализации текста для сравнения
    def normalize_text(text):
        """Нормализация текста для более точного сравнения"""
        if not text:
            return ""
        text = text.lower().strip()
        # Убираем лишние символы
        text = text.replace("№", "номер").replace("/", " ").replace("-", " ")
        # Убираем множественные пробелы
        text = re.sub(r'\s+', ' ', text)
        return text.strip()
    
    # Ищем соответствия для каждого поля
    for field_name, keywords in field_keywords.items():
        best_match = None
        best_match_score = 0
        
        for i, cell in enumerate(header_row_data):
            if not cell:
                continue
                
            cell_normalized = normalize_text(cell)
            
            # Проверяем точное совпадение
            for keyword in keywords:
                keyword_normalized = normalize_text(keyword)
                
                # Точное совпадение
                if keyword_normalized == cell_normalized:
                    best_match = header_row_data[i]
                    best_match_score = 100
                    break
                
                # Частичное совпадение (ключевое слово содержится в ячейке)
                if keyword_normalized in cell_normalized or cell_normalized in keyword_normalized:
                    score = len(keyword_normalized) / len(cell_normalized) * 50
                    if score > best_match_score:
                        best_match_score = score
                        best_match = header_row_data[i]
                
                # Поиск по отдельным словам
                keyword_words = keyword_normalized.split()
                cell_words = cell_normalized.split()
                matching_words = sum(1 for kw in keyword_words if kw in cell_words)
                if matching_words > 0:
                    score = matching_words / len(keyword_words) * 30
                    if score > best_match_score:
                        best_match_score = score
                        best_match = header_row_data[i]
            
            if best_match_score >= 100:
                break
        
        if best_match:
            field_mapping[field_name] = best_match
    
    return {
        "header_row": header_row,
        "data_start_row": header_row + 1,
        "field_mapping": field_mapping,
        "columns": header_row_data
    }


def detect_provider_and_template(
    file_path: str,
    db: Session
) -> Tuple[Optional[int], Optional[int], Dict[str, Any]]:
    """
    Автоматическое определение провайдера и шаблона на основе структуры файла
    
    Возвращает:
    - provider_id: ID найденного провайдера или None
    - template_id: ID найденного шаблона или None
    - match_info: информация о совпадении (score, matched_fields, etc.)
    """
    try:
        # Анализируем структуру файла
        file_analysis = analyze_template_structure(file_path)
        file_columns = [col.lower().strip() for col in file_analysis["columns"]]
        file_field_mapping = file_analysis["field_mapping"]
    except Exception as e:
        # В случае ошибки анализа используем провайдера по умолчанию
        default_provider = db.query(Provider).filter(Provider.code == "RP-GAZPROM").first()
        if default_provider:
            return default_provider.id, None, {
                "score": 0,
                "matched_fields": [],
                "provider_name": default_provider.name,
                "template_name": None,
                "file_columns": [],
                "template_columns": [],
                "auto_detected": False,
                "error": str(e)
            }
        return None, None, {
            "score": 0,
            "matched_fields": [],
            "provider_name": None,
            "template_name": None,
            "file_columns": [],
            "template_columns": [],
            "error": str(e)
        }
    
    # Получаем все активные провайдеры
    providers = db.query(Provider).filter(Provider.is_active == True).all()
    
    best_match_score = 0
    best_provider_id = None
    best_template_id = None
    best_match_info = {
        "score": 0,
        "matched_fields": [],
        "provider_name": None,
        "template_name": None
    }
    
    # Проверяем каждый провайдер и его шаблоны
    for provider in providers:
        templates = db.query(ProviderTemplate).filter(
            ProviderTemplate.provider_id == provider.id,
            ProviderTemplate.is_active == True
        ).all()
        
        for template in templates:
            try:
                template_mapping = json.loads(template.field_mapping) if isinstance(template.field_mapping, str) else template.field_mapping
            except:
                continue
            
            # Подсчитываем совпадения полей
            matched_fields = []
            match_score = 0
            
            # Проверяем каждое поле шаблона
            for field_name, template_column in template_mapping.items():
                template_col_lower = str(template_column).lower().strip()
                
                # Проверяем точное совпадение
                if template_col_lower in file_columns:
                    matched_fields.append(field_name)
                    match_score += 10
                else:
                    # Проверяем частичное совпадение
                    for file_col in file_columns:
                        if template_col_lower in file_col or file_col in template_col_lower:
                            matched_fields.append(field_name)
                            match_score += 5
                            break
                
                # Дополнительные бонусы за важные поля
                if field_name in ["date", "quantity", "fuel"]:
                    if field_name in matched_fields:
                        match_score += 5
            
            # Бонус за совпадение header_row и data_start_row
            if template.header_row == file_analysis["header_row"]:
                match_score += 2
            
            # Если это лучшее совпадение
            if match_score > best_match_score:
                best_match_score = match_score
                best_provider_id = provider.id
                best_template_id = template.id
                best_match_info = {
                    "score": match_score,
                    "matched_fields": matched_fields,
                    "provider_name": provider.name,
                    "template_name": template.name,
                    "file_columns": file_columns,
                    "template_columns": list(template_mapping.values())
                }
        
        # Если нет шаблонов у провайдера, но есть базовое совпадение по названию провайдера в файле
        if not templates:
            # Проверяем, упоминается ли название провайдера в файле
            file_text = " ".join(file_columns).lower()
            provider_name_lower = provider.name.lower()
            if provider_name_lower in file_text or provider.code.lower() in file_text:
                if best_match_score < 5:  # Только если нет лучших совпадений
                    best_match_score = 5
                    best_provider_id = provider.id
                    best_template_id = None
                    best_match_info = {
                        "score": 5,
                        "matched_fields": [],
                        "provider_name": provider.name,
                        "template_name": None,
                        "file_columns": file_columns,
                        "template_columns": []
                    }
    
    # Если найдено хорошее совпадение (минимум 30 баллов), возвращаем его
    if best_match_score >= 30:
        return best_provider_id, best_template_id, best_match_info
    
    # Если совпадение слабое, но есть провайдер "РП-газпром" по умолчанию
    default_provider = db.query(Provider).filter(Provider.code == "RP-GAZPROM").first()
    if default_provider:
        return default_provider.id, None, {
            "score": 0,
            "matched_fields": [],
            "provider_name": default_provider.name,
            "template_name": None,
            "file_columns": file_columns,
            "template_columns": [],
            "auto_detected": False
        }
    
    return None, None, best_match_info


def process_excel_file(
    file_path: str, 
    file_name: str, 
    provider_id: Optional[int] = None,
    template_id: Optional[int] = None,
    db: Optional[Session] = None
) -> List[Dict]:
    """
    Обработка Excel файла и конвертация в список транзакций
    Использует шаблон провайдера, если указан
    """
    try:
        # Читаем Excel файл
        df = pd.read_excel(file_path, header=None, engine="openpyxl")
    except Exception as e:
        raise ValueError(f"Ошибка чтения Excel файла: {str(e)}")
    
    # Если указан шаблон, используем его
    field_mapping = {}
    header_row = -1
    data_start_row = 1
    
    if template_id and db:
        template = db.query(ProviderTemplate).filter(
            ProviderTemplate.id == template_id,
            ProviderTemplate.is_active == True
        ).first()
        
        if template:
            try:
                field_mapping = json.loads(template.field_mapping) if isinstance(template.field_mapping, str) else template.field_mapping
                header_row = template.header_row
                data_start_row = template.data_start_row
            except:
                pass
    
    # Если шаблон не найден или не указан, используем автоматический анализ
    if not field_mapping:
        analysis = analyze_template_structure(file_path)
        field_mapping = analysis["field_mapping"]
        header_row = analysis["header_row"]
        data_start_row = analysis["data_start_row"]
    
    # Определяем индексы колонок по маппингу
    header_row_data = [str(cell).lower().strip() for cell in df.iloc[header_row].values]
    
    def get_column_index(field_name: str) -> int:
        """Получить индекс колонки по имени поля из маппинга"""
        if field_name in field_mapping:
            mapping_value = field_mapping[field_name].lower()
            for i, cell in enumerate(header_row_data):
                if mapping_value in cell or cell in mapping_value:
                    return i
        
        # Fallback: поиск по ключевым словам
        keywords_map = {
            "user": ["пользователь", "тс", "закреплена за"],
            "card": ["номер карты", "карты", "карта"],
            "kazs": ["казс", "азс", "номер азс"],
            "date": ["дата", "дата и время"],
            "quantity": ["кол-во", "количество", "литры"],
            "fuel": ["вид топлива", "топливо", "товар"],
            "organization": ["организация", "орг"]
        }
        
        if field_name in keywords_map:
            keywords = keywords_map[field_name]
            for i, cell in enumerate(header_row_data):
                if any(kw.lower() in cell for kw in keywords):
                    return i
        
        return -1
    
    org_idx = get_column_index("organization")
    user_idx = get_column_index("user")
    card_idx = get_column_index("card")
    kazs_idx = get_column_index("kazs")
    date_idx = get_column_index("date")
    qty_idx = get_column_index("quantity")
    fuel_idx = get_column_index("fuel")
    
    if date_idx == -1 or qty_idx == -1 or fuel_idx == -1:
        raise ValueError("Не найдены обязательные колонки: Дата, Кол-во, Вид топлива")
    
    # Обрабатываем данные
    transactions = []
    
    for i in range(data_start_row, len(df)):
        row = df.iloc[i].values
        
        # Пропускаем пустые строки
        if len(row) == 0 or pd.isna(row[date_idx]):
            continue
        
        # Получаем значения
        date_value = parse_excel_date(row[date_idx])
        if not date_value:
            continue
        
        qty_value = convert_to_decimal(row[qty_idx])
        if not qty_value:
            continue
        
        user = str(row[user_idx]).strip() if user_idx >= 0 and not pd.isna(row[user_idx]) else ""
        card = str(row[card_idx]).strip() if card_idx >= 0 and not pd.isna(row[card_idx]) else ""
        kazs = str(row[kazs_idx]).strip() if kazs_idx >= 0 and not pd.isna(row[kazs_idx]) else ""
        fuel = str(row[fuel_idx]).strip() if fuel_idx >= 0 and not pd.isna(row[fuel_idx]) else ""
        org = str(row[org_idx]).strip() if org_idx >= 0 and not pd.isna(row[org_idx]) else ""
        
        transaction_data = {
            "transaction_date": date_value,
            "card_number": card,
            "vehicle": user,
            "azs_number": extract_azs_number(kazs),
            "azs_original_name": kazs,  # Сохраняем оригинальное название АЗС для создания записи в справочнике
            "product": normalize_fuel(fuel),
            "operation_type": "Покупка",
            "quantity": qty_value,
            "currency": "RUB",
            "exchange_rate": Decimal("1"),
            "source_file": file_name,
            "organization": org,
            "provider_id": provider_id
        }
        
        transactions.append(transaction_data)
    
    return transactions


# DEPRECATED: Используйте VehicleService.get_or_create_vehicle
def get_or_create_vehicle(
    db: Session,
    original_name: str,
    garage_number: Optional[str] = None,
    license_plate: Optional[str] = None
) -> Tuple[Vehicle, List[str]]:
    """DEPRECATED: Используйте VehicleService.get_or_create_vehicle"""
    from app.services.vehicle_service import VehicleService
    vehicle_service = VehicleService(db)
    return vehicle_service.get_or_create_vehicle(original_name, garage_number, license_plate)


# DEPRECATED: Используйте GasStationService.get_or_create_gas_station
def get_or_create_gas_station(
    db: Session,
    original_name: str,
    azs_number: Optional[str] = None,
    location: Optional[str] = None,
    region: Optional[str] = None,
    settlement: Optional[str] = None,
    provider_id: Optional[int] = None
) -> Tuple[GasStation, List[str]]:
    """DEPRECATED: Используйте GasStationService.get_or_create_gas_station"""
    from app.services.gas_station_service import GasStationService
    gas_station_service = GasStationService(db)
    return gas_station_service.get_or_create_gas_station(
        original_name, azs_number, location, region, settlement, provider_id=provider_id
    )


# DEPRECATED: Используйте app.services.fuel_card_service.get_or_create_fuel_card
def get_or_create_fuel_card(
    db: Session,
    card_number: str,
    provider_id: Optional[int] = None,
    vehicle_id: Optional[int] = None
) -> Tuple[FuelCard, List[str]]:
    """DEPRECATED: Используйте app.services.fuel_card_service.get_or_create_fuel_card"""
    return _get_or_create_fuel_card(db, card_number, provider_id, vehicle_id)


# DEPRECATED: Используйте app.services.entity_management_service.check_card_overlap
def check_card_overlap(
    db: Session,
    card_id: int,
    vehicle_id: int,
    start_date: date,
    end_date: Optional[date] = None
) -> Tuple[bool, List[Dict[str, Any]]]:
    """DEPRECATED: Используйте app.services.entity_management_service.check_card_overlap"""
    return _check_card_overlap(db, card_id, vehicle_id, start_date, end_date)


# DEPRECATED: Используйте app.services.entity_management_service.assign_card_to_vehicle
def assign_card_to_vehicle(
    db: Session,
    card_id: int,
    vehicle_id: int,
    start_date: date,
    end_date: Optional[date] = None,
    check_overlap: bool = True
) -> Tuple[bool, str, Optional[List[Dict[str, Any]]]]:
    """DEPRECATED: Используйте app.services.entity_management_service.assign_card_to_vehicle"""
    return _assign_card_to_vehicle(db, card_id, vehicle_id, start_date, end_date, check_overlap)


def create_transactions(db: Session, transactions: List[Dict]) -> Tuple[int, int, List[str]]:
    """
    Создание транзакций в БД с проверкой на дубликаты и заполнением справочников
    Возвращает: (создано, пропущено, предупреждения)
    """
    created_count = 0
    skipped_count = 0
    warnings = []
    
    for trans_data in transactions:
        # Проверяем, существует ли уже такая транзакция
        # Дубликат определяется по комбинации: дата, карта, АЗС, количество, товар
        query = db.query(Transaction).filter(
            Transaction.transaction_date == trans_data["transaction_date"],
            Transaction.quantity == trans_data["quantity"]
        )
        
        # Добавляем фильтры только если значения не пустые
        card_number = trans_data.get("card_number")
        if card_number:
            query = query.filter(Transaction.card_number == card_number)
        else:
            query = query.filter(Transaction.card_number.is_(None))
        
        azs_number = trans_data.get("azs_number")
        if azs_number:
            query = query.filter(Transaction.azs_number == azs_number)
        else:
            query = query.filter(Transaction.azs_number.is_(None))
        
        product = trans_data.get("product")
        if product:
            query = query.filter(Transaction.product == product)
        else:
            query = query.filter(Transaction.product.is_(None))
        
        existing = query.first()
        
        if existing:
            # Транзакция уже существует, пропускаем
            skipped_count += 1
            continue
        
        # Обработка справочников
        vehicle_name = trans_data.get("vehicle")
        vehicle_id = None
        
        if vehicle_name:
            # Парсим поле "Закреплена за"
            vehicle_data = parse_vehicle_field(vehicle_name)
            
            # Получаем или создаем ТС
            vehicle, vehicle_warnings = get_or_create_vehicle(
                db,
                original_name=vehicle_data["original"],
                garage_number=vehicle_data.get("garage_number"),
                license_plate=vehicle_data.get("license_plate")
            )
            vehicle_id = vehicle.id
            warnings.extend(vehicle_warnings)
        
        # Получаем или создаем топливную карту
        provider_id = trans_data.get("provider_id")
        if card_number:
            _, card_warnings = get_or_create_fuel_card(db, card_number, provider_id, vehicle_id)
            warnings.extend(card_warnings)
        
        # Обработка справочника АЗС
        gas_station_id = None
        azs_number = trans_data.get("azs_number")
        if azs_number:
            # Формируем исходное наименование АЗС из доступных данных
            azs_name_parts = []
            if azs_number:
                azs_name_parts.append(str(azs_number))
            if trans_data.get("location"):
                azs_name_parts.append(trans_data.get("location"))
            elif trans_data.get("settlement"):
                azs_name_parts.append(trans_data.get("settlement"))
            elif trans_data.get("region"):
                azs_name_parts.append(trans_data.get("region"))
            
            original_azs_name = " ".join(azs_name_parts) if azs_name_parts else str(azs_number)
            
            # Получаем или создаем АЗС
            gas_station, azs_warnings = get_or_create_gas_station(
                db,
                original_name=original_azs_name,
                azs_number=azs_number,
                location=trans_data.get("location"),
                region=trans_data.get("region"),
                settlement=trans_data.get("settlement"),
                provider_id=trans_data.get("provider_id")
            )
            gas_station_id = gas_station.id
            warnings.extend(azs_warnings)
        
        # Создаем новую транзакцию с vehicle_id и gas_station_id
        trans_data["vehicle_id"] = vehicle_id
        trans_data["gas_station_id"] = gas_station_id
        db_transaction = Transaction(**trans_data)
        db.add(db_transaction)
        created_count += 1
    
    db.commit()
    return created_count, skipped_count, warnings

