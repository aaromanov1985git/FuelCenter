"""
Сервисы для обработки бизнес-логики
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
from app.models import Transaction, Vehicle, FuelCard, Provider, ProviderTemplate
from app.schemas import TransactionCreate
from app.validators import (
    parse_vehicle_field, 
    validate_vehicle_data, 
    detect_mixed_alphabet
)


def normalize_fuel(fuel: str) -> str:
    """
    Нормализация вида топлива
    """
    if not fuel:
        return ""
    
    fuel_str = str(fuel).strip()
    fuel_lower = fuel_str.lower().replace(' ', '').replace('-', '')
    
    # Бензин
    if 'аи95' in fuel_lower or 'ai95' in fuel_lower:
        return "АИ-95"
    if 'аи92' in fuel_lower or 'ai92' in fuel_lower:
        return "АИ-92"
    if 'аи98' in fuel_lower or 'ai98' in fuel_lower:
        return "АИ-98"
    
    # Дизель
    if 'дт' in fuel_lower or 'диз' in fuel_lower or 'diesel' in fuel_lower:
        return "Дизельное топливо"
    
    # Газ
    if 'газ' in fuel_lower or 'cng' in fuel_lower or 'lng' in fuel_lower or 'метан' in fuel_lower or 'пропан' in fuel_lower:
        return "Газ"
    
    return fuel_str


def normalize_vehicle_name(vehicle_name: str) -> str:
    """
    Нормализация названия транспортного средства для поиска дублей
    
    Удаляет лишние пробелы, приводит к единому регистру,
    нормализует госномера (удаление пробелов, дефисов)
    """
    if not vehicle_name:
        return ""
    
    # Приводим к строке и удаляем лишние пробелы
    normalized = str(vehicle_name).strip()
    
    # Удаляем множественные пробелы
    normalized = re.sub(r'\s+', ' ', normalized)
    
    # Нормализуем госномер: удаляем пробелы и дефисы из номеров
    # Паттерн для госномера: буквы, цифры, буквы, цифры
    # Пример: "А 123 ВС 77" -> "А123ВС77"
    license_pattern = r'([АВЕКМНОРСТУХABEKMHOPCTYXавекмнорстухabekmhopctx]{1,2})\s*(\d{3,4})\s*([АВЕКМНОРСТУХABEKMHOPCTYXавекмнорстухabekmhopctx]{2,3})\s*(\d{2,3})'
    
    def normalize_license(match):
        letters1 = match.group(1).upper()
        digits1 = match.group(2)
        letters2 = match.group(3).upper()
        digits2 = match.group(4)
        return f"{letters1}{digits1}{letters2}{digits2}"
    
    normalized = re.sub(license_pattern, normalize_license, normalized, flags=re.IGNORECASE)
    
    return normalized


def normalize_card_number(card_number: str) -> str:
    """
    Нормализация номера топливной карты
    
    Удаляет пробелы, дефисы и другие разделители
    """
    if not card_number:
        return ""
    
    # Преобразуем в строку, если передан как число
    card_number_str = str(card_number).strip() if card_number else ""
    
    # Удаляем все пробелы, дефисы и другие разделители
    normalized = re.sub(r'[\s\-_]+', '', card_number_str)
    
    return normalized


def find_similar_vehicles(
    db: Session,
    vehicle_name: str,
    threshold: int = 85
) -> List[Tuple[Vehicle, int]]:
    """
    Поиск похожих транспортных средств с использованием fuzzy matching
    
    Args:
        db: Сессия БД
        vehicle_name: Название ТС для поиска
        threshold: Порог схожести (0-100), по умолчанию 85
    
    Returns:
        Список кортежей (Vehicle, score) отсортированный по убыванию score
    """
    if not vehicle_name:
        return []
    
    normalized_name = normalize_vehicle_name(vehicle_name)
    
    # Получаем все ТС из БД
    all_vehicles = db.query(Vehicle).all()
    
    if not all_vehicles:
        return []
    
    # Создаем словарь для быстрого доступа
    vehicle_dict = {v.id: v for v in all_vehicles}
    
    # Используем rapidfuzz для поиска похожих
    # process.extract работает со словарями {key: value}, где value - строка для сравнения
    # Создаем словарь {vehicle_id: normalize_vehicle_name(...)} для поиска
    choices = {v.id: normalize_vehicle_name(v.original_name) for v in all_vehicles}
    
    # Ищем похожие записи
    # process.extract возвращает список кортежей (matched_key, score, index)
    # где matched_key - это ключ из словаря choices (vehicle_id)
    results = process.extract(
        normalized_name,
        choices,
        scorer=fuzz.ratio,
        limit=5
    )
    
    # Фильтруем по порогу и возвращаем Vehicle объекты
    # results содержит (vehicle_id, score, index)
    similar = []
    for vehicle_id, score, _ in results:
        if score >= threshold and vehicle_id in vehicle_dict:
            similar.append((vehicle_dict[vehicle_id], score))
    
    return similar


def find_similar_cards(
    db: Session,
    card_number: str,
    threshold: int = 90
) -> List[Tuple[FuelCard, int]]:
    """
    Поиск похожих топливных карт с использованием fuzzy matching
    
    Args:
        db: Сессия БД
        card_number: Номер карты для поиска
        threshold: Порог схожести (0-100), по умолчанию 90
    
    Returns:
        Список кортежей (FuelCard, score) отсортированный по убыванию score
    """
    if not card_number:
        return []
    
    normalized_number = normalize_card_number(card_number)
    
    # Получаем все карты из БД
    all_cards = db.query(FuelCard).all()
    
    if not all_cards:
        return []
    
    # Создаем словарь для быстрого доступа
    card_dict = {c.id: c for c in all_cards}
    
    # Используем rapidfuzz для поиска похожих
    choices = {c.id: normalize_card_number(c.card_number) for c in all_cards}
    
    # Ищем похожие записи
    results = process.extract(
        normalized_number,
        choices,
        scorer=fuzz.ratio,
        limit=5
    )
    
    # Фильтруем по порогу и возвращаем FuelCard объекты
    similar = [
        (card_dict[card_id], score)
        for card_id, score, _ in results
        if score >= threshold
    ]
    
    return similar


def extract_azs_number(kazs: str) -> str:
    """
    Извлечение номера АЗС из строки КАЗС
    """
    if not kazs:
        return ""
    
    kazs_str = str(kazs).strip()
    import re
    match = re.search(r"КАЗС(\d+)", kazs_str, re.IGNORECASE)
    return f"АЗС №{match.group(1)}" if match else kazs_str


def parse_excel_date(date_value) -> datetime:
    """
    Парсинг даты из Excel файла
    """
    if not date_value:
        return None
    
    # Если это уже datetime объект
    if isinstance(date_value, datetime):
        return date_value
    
    # Если это pandas Timestamp
    if isinstance(date_value, pd.Timestamp):
        return date_value.to_pydatetime()
    
    # Если это число (Excel дата)
    if isinstance(date_value, (int, float)):
        try:
            return pd.to_datetime(date_value, origin="1899-12-30", unit="D").to_pydatetime()
        except:
            pass
    
    # Если это строка
    if isinstance(date_value, str):
        date_str = date_value.strip().replace("  ", " ")
        try:
            # Формат DD.MM.YYYY HH:mm:ss
            return datetime.strptime(date_str, "%d.%m.%Y %H:%M:%S")
        except:
            try:
                # Формат DD.MM.YYYY HH:mm
                return datetime.strptime(date_str, "%d.%m.%Y %H:%M")
            except:
                try:
                    # Стандартный формат
                    return pd.to_datetime(date_str).to_pydatetime()
                except:
                    pass
    
    return None


def convert_to_decimal(value) -> Decimal:
    """
    Конвертация значения в Decimal
    """
    if value is None or value == "":
        return None
    
    try:
        if isinstance(value, (int, float)):
            return Decimal(str(value))
        if isinstance(value, str):
            cleaned = value.replace(",", ".").strip()
            return Decimal(cleaned) if cleaned else None
        return Decimal(str(value))
    except:
        return None


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


def get_or_create_vehicle(
    db: Session, 
    original_name: str, 
    garage_number: Optional[str] = None, 
    license_plate: Optional[str] = None
) -> Tuple[Vehicle, List[str]]:
    """
    Получить или создать транспортное средство в справочнике
    Использует нормализацию для поиска дублей и fuzzy matching для похожих записей
    Возвращает ТС и список предупреждений
    """
    warnings = []
    
    # Нормализуем название для поиска
    normalized_name = normalize_vehicle_name(original_name)
    
    # Сначала ищем по точному совпадению исходного названия
    vehicle = db.query(Vehicle).filter(Vehicle.original_name == original_name).first()
    
    # Если не найдено, ищем по нормализованному названию
    if not vehicle:
        all_vehicles = db.query(Vehicle).all()
        for v in all_vehicles:
            if normalize_vehicle_name(v.original_name) == normalized_name:
                vehicle = v
                break
    
    # Если все еще не найдено, проверяем на похожие записи
    if not vehicle:
        similar_vehicles = find_similar_vehicles(db, original_name, threshold=85)
        if similar_vehicles:
            # Берем самую похожую запись, если схожесть >= 95%
            best_match, score = similar_vehicles[0]
            if score >= 95:
                vehicle = best_match
                warnings.append(
                    f"ТС '{original_name}' объединено с существующим '{best_match.original_name}' "
                    f"(схожесть: {score}%)"
                )
            elif score >= 85:
                # Предупреждаем о возможном дубле
                warnings.append(
                    f"Возможный дубль ТС: найдена похожая запись '{best_match.original_name}' "
                    f"(схожесть: {score}%). Проверьте вручную."
                )
    
    if not vehicle:
        # Создаем новое ТС
        vehicle = Vehicle(
            original_name=original_name,
            garage_number=garage_number,
            license_plate=license_plate,
            is_validated="pending"
        )
        db.add(vehicle)
        db.flush()
    else:
        # Обновляем данные, если они были пустыми
        updated = False
        if not vehicle.garage_number and garage_number:
            vehicle.garage_number = garage_number
            updated = True
        if not vehicle.license_plate and license_plate:
            vehicle.license_plate = license_plate
            updated = True
        
        if updated:
            db.flush()
    
    # Валидация данных
    validation_result = validate_vehicle_data(vehicle.garage_number, vehicle.license_plate)
    
    if validation_result["errors"]:
        vehicle.is_validated = "invalid"
        vehicle.validation_errors = "; ".join(validation_result["errors"])
        warnings.extend([f"ТС '{original_name}': {err}" for err in validation_result["errors"]])
    elif validation_result["warnings"]:
        vehicle.is_validated = "pending"
        warnings.extend([f"ТС '{original_name}': {warn}" for warn in validation_result["warnings"]])
    else:
        vehicle.is_validated = "valid"
        vehicle.validation_errors = None
    
    return vehicle, warnings


def get_or_create_fuel_card(
    db: Session, 
    card_number: str, 
    provider_id: Optional[int] = None,
    vehicle_id: Optional[int] = None
) -> Tuple[FuelCard, List[str]]:
    """
    Получить или создать топливную карту в справочнике
    Использует нормализацию для поиска дублей и fuzzy matching для похожих записей
    Возвращает карту и список предупреждений
    """
    warnings = []
    
    # Преобразуем номер карты в строку, если он передан как число
    if card_number is not None:
        card_number = str(card_number).strip() if card_number else None
    else:
        card_number = None
    
    if not card_number:
        raise ValueError("Номер карты не может быть пустым")
    
    # Убеждаемся, что card_number - строка
    card_number = str(card_number).strip()
    
    # Нормализуем номер карты для поиска
    normalized_number = normalize_card_number(card_number)
    
    # Сначала ищем по точному совпадению номера карты
    card = db.query(FuelCard).filter(FuelCard.card_number == card_number).first()
    
    # Если не найдено, ищем по нормализованному номеру
    if not card:
        all_cards = db.query(FuelCard).all()
        for c in all_cards:
            if c.card_number and normalize_card_number(c.card_number) == normalized_number:
                card = c
                break
    
    # Если все еще не найдено, проверяем на похожие записи
    if not card:
        similar_cards = find_similar_cards(db, card_number, threshold=90)
        if similar_cards:
            # Берем самую похожую запись, если схожесть >= 98%
            best_match, score = similar_cards[0]
            if score >= 98:
                card = best_match
                warnings.append(
                    f"Карта '{card_number}' объединена с существующей '{best_match.card_number}' "
                    f"(схожесть: {score}%)"
                )
            elif score >= 90:
                # Предупреждаем о возможном дубле
                warnings.append(
                    f"Возможный дубль карты: найдена похожая запись '{best_match.card_number}' "
                    f"(схожесть: {score}%). Проверьте вручную."
                )
    
    if not card:
        try:
            card = FuelCard(
                card_number=card_number, 
                provider_id=provider_id,
                vehicle_id=vehicle_id
            )
            db.add(card)
            db.flush()
        except IntegrityError as e:
            # Если возникла ошибка уникальности, значит карта уже существует
            # Откатываем транзакцию и ищем существующую карту
            db.rollback()
            
            # Пытаемся найти карту по номеру (возможно, была создана в другой транзакции)
            card = db.query(FuelCard).filter(FuelCard.card_number == card_number).first()
            
            if not card:
                # Если не нашли по точному совпадению, пробуем найти по нормализованному номеру
                all_cards = db.query(FuelCard).all()
                for c in all_cards:
                    if c.card_number and normalize_card_number(c.card_number) == normalized_number:
                        card = c
                        warnings.append(
                            f"Карта '{card_number}' объединена с существующей '{c.card_number}' "
                            f"(найдена по нормализованному номеру)"
                        )
                        break
                
                # Если все еще не нашли, пробуем найти похожую карту
                if not card:
                    similar_cards = find_similar_cards(db, card_number, threshold=95)
                    if similar_cards:
                        best_match, score = similar_cards[0]
                        if score >= 95:
                            card = best_match
                            warnings.append(
                                f"Карта '{card_number}' объединена с существующей '{best_match.card_number}' "
                                f"(схожесть: {score}%, обнаружена при обработке конфликта уникальности)"
                            )
            
            # Если карта все еще не найдена, это критическая ошибка
            if not card:
                raise ValueError(
                    f"Не удалось создать карту '{card_number}' из-за конфликта уникальности, "
                    f"но существующая карта не найдена. Ошибка БД: {str(e)}"
                )
    else:
        # Обновляем данные, если они были пустыми
        updated = False
        if provider_id and not card.provider_id:
            card.provider_id = provider_id
            updated = True
        if vehicle_id and not card.vehicle_id:
            card.vehicle_id = vehicle_id
            updated = True
        
        if updated:
            db.flush()
    
    return card, warnings


def check_card_overlap(
    db: Session,
    card_id: int,
    vehicle_id: int,
    start_date: date,
    end_date: Optional[date] = None
) -> Tuple[bool, List[Dict[str, Any]]]:
    """
    Проверка пересечений закрепления карты за ТС
    
    Возвращает: (есть_пересечения, список_пересечений)
    """
    if end_date is None:
        end_date = date(2099, 12, 31)  # Бессрочное закрепление
    
    # Ищем активные закрепления этой карты за другими ТС в указанном периоде
    overlaps = db.query(FuelCard).filter(
        FuelCard.id == card_id,
        FuelCard.is_active_assignment == True,
        FuelCard.vehicle_id.isnot(None),
        FuelCard.vehicle_id != vehicle_id,
        or_(
            # Пересечение: начало нового периода внутри существующего
            and_(
                FuelCard.assignment_start_date <= start_date,
                or_(
                    FuelCard.assignment_end_date.is_(None),
                    FuelCard.assignment_end_date >= start_date
                )
            ),
            # Пересечение: конец нового периода внутри существующего
            and_(
                FuelCard.assignment_start_date <= end_date,
                or_(
                    FuelCard.assignment_end_date.is_(None),
                    FuelCard.assignment_end_date >= end_date
                )
            ),
            # Пересечение: новый период полностью содержит существующий
            and_(
                FuelCard.assignment_start_date >= start_date,
                or_(
                    FuelCard.assignment_end_date.is_(None),
                    FuelCard.assignment_end_date <= end_date
                )
            )
        )
    ).all()
    
    if overlaps:
        overlap_list = []
        for overlap in overlaps:
            vehicle = db.query(Vehicle).filter(Vehicle.id == overlap.vehicle_id).first()
            overlap_list.append({
                "card_id": overlap.id,
                "vehicle_id": overlap.vehicle_id,
                "vehicle_name": vehicle.original_name if vehicle else "Неизвестно",
                "start_date": overlap.assignment_start_date.isoformat() if overlap.assignment_start_date else None,
                "end_date": overlap.assignment_end_date.isoformat() if overlap.assignment_end_date else None
            })
        return True, overlap_list
    
    return False, []


def assign_card_to_vehicle(
    db: Session,
    card_id: int,
    vehicle_id: int,
    start_date: date,
    end_date: Optional[date] = None,
    check_overlap: bool = True
) -> Tuple[bool, str, Optional[List[Dict[str, Any]]]]:
    """
    Закрепление карты за ТС с проверкой пересечений
    
    Возвращает: (успех, сообщение, список_пересечений)
    """
    card = db.query(FuelCard).filter(FuelCard.id == card_id).first()
    if not card:
        return False, "Карта не найдена", None
    
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id).first()
    if not vehicle:
        return False, "Транспортное средство не найдено", None
    
    # Проверка пересечений
    if check_overlap:
        has_overlap, overlaps = check_card_overlap(db, card_id, vehicle_id, start_date, end_date)
        if has_overlap:
            return False, "Обнаружены пересечения с другими закреплениями", overlaps
    
    # Деактивируем предыдущие активные закрепления этой карты
    db.query(FuelCard).filter(
        FuelCard.id == card_id,
        FuelCard.is_active_assignment == True
    ).update({"is_active_assignment": False})
    
    # Создаем новое закрепление (или обновляем существующее)
    card.vehicle_id = vehicle_id
    card.assignment_start_date = start_date
    card.assignment_end_date = end_date
    card.is_active_assignment = True
    
    db.commit()
    
    return True, "Карта успешно закреплена за ТС", None


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
        
        # Создаем новую транзакцию с vehicle_id
        trans_data["vehicle_id"] = vehicle_id
        db_transaction = Transaction(**trans_data)
        db.add(db_transaction)
        created_count += 1
    
    db.commit()
    return created_count, skipped_count, warnings

