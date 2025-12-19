"""
Сервис нормализации данных
Утилиты для приведения данных к единому формату
"""
import re
import json
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from app.models import NormalizationSettings


def normalize_fuel(fuel: Optional[str]) -> str:
    """
    Нормализация вида топлива

    Args:
        fuel: Название топлива

    Returns:
        Нормализованное название топлива

    Examples:
        >>> normalize_fuel("аи 95")
        "АИ-95"
        >>> normalize_fuel("Дизель")
        "Дизельное топливо"
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


def normalize_vehicle_name(vehicle_name: Optional[str]) -> str:
    """
    Нормализация названия транспортного средства для поиска дублей

    Удаляет лишние пробелы, приводит к единому регистру,
    нормализует госномера (удаление пробелов, дефисов)

    Args:
        vehicle_name: Исходное название ТС

    Returns:
        Нормализованное название ТС

    Examples:
        >>> normalize_vehicle_name("А 123 ВС 77")
        "А123ВС77"
        >>> normalize_vehicle_name("  КАМАЗ  5490  ")
        "КАМАЗ 5490"
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

    def normalize_license(match: re.Match) -> str:
        letters1 = match.group(1).upper()
        digits1 = match.group(2)
        letters2 = match.group(3).upper()
        digits2 = match.group(4)
        return f"{letters1}{digits1}{letters2}{digits2}"

    normalized = re.sub(license_pattern, normalize_license, normalized, flags=re.IGNORECASE)

    return normalized


def normalize_card_number(card_number: Optional[str]) -> str:
    """
    Нормализация номера топливной карты

    Удаляет пробелы, дефисы и другие разделители

    Args:
        card_number: Исходный номер карты

    Returns:
        Нормализованный номер карты

    Examples:
        >>> normalize_card_number("1234-5678-9012")
        "123456789012"
        >>> normalize_card_number("1234 5678 9012")
        "123456789012"
    """
    if not card_number:
        return ""

    # Преобразуем в строку, если передан как число
    card_number_str = str(card_number).strip() if card_number else ""

    # Удаляем все пробелы, дефисы и другие разделители
    normalized = re.sub(r'[\s\-_]+', '', card_number_str)

    return normalized


def extract_azs_number(kazs: Optional[str]) -> str:
    """
    Извлечение номера АЗС из строки

    Args:
        kazs: Строка с номером АЗС

    Returns:
        Извлеченный номер АЗС

    Examples:
        >>> extract_azs_number("АЗС №123")
        "123"
        >>> extract_azs_number("Газпром АЗС-456")
        "456"
    """
    if not kazs:
        return ""

    # Извлекаем числовую часть из строки
    match = re.search(r'\d+', str(kazs))
    return match.group(0) if match else str(kazs).strip()


def get_default_normalization_options() -> Dict[str, Any]:
    """
    Получение настроек нормализации по умолчанию
    
    Returns:
        Словарь с настройками нормализации по умолчанию
    """
    return {
        "case": "preserve",  # upper, lower, title, preserve
        "remove_special_chars": False,
        "remove_extra_spaces": True,
        "trim": True,
        "priority_license_plate": True,
        "priority_garage_number": True,
        "min_garage_number_length": 2,
        "max_garage_number_length": 10,
        "remove_chars": []
    }


def get_normalization_settings(db: Optional[Session], dictionary_type: str = "fuel_card_owner") -> Dict[str, Any]:
    """
    Получение настроек нормализации для типа справочника
    
    Args:
        db: Сессия базы данных (опционально)
        dictionary_type: Тип справочника
        
    Returns:
        Словарь с настройками нормализации
    """
    if db:
        settings = db.query(NormalizationSettings).filter(
            NormalizationSettings.dictionary_type == dictionary_type
        ).first()
        
        if settings and settings.options:
            try:
                if isinstance(settings.options, str):
                    return json.loads(settings.options)
                return settings.options
            except (json.JSONDecodeError, TypeError):
                pass
    
    # Настройки по умолчанию
    return get_default_normalization_options()


def apply_normalization_options(text: str, options: Dict[str, Any]) -> str:
    """
    Применение опций нормализации к тексту
    
    Args:
        text: Исходный текст
        options: Настройки нормализации
        
    Returns:
        Нормализованный текст
    """
    if not text:
        return text
    
    result = str(text)
    
    # Удаление указанных символов
    if options.get("remove_chars"):
        for char in options["remove_chars"]:
            result = result.replace(char, "")
    
    # Удаление спецсимволов (кроме букв, цифр и пробелов)
    if options.get("remove_special_chars", False):
        result = re.sub(r'[^\w\s]', '', result)
    
    # Удаление лишних пробелов
    if options.get("remove_extra_spaces", True):
        result = re.sub(r'\s+', ' ', result)
    
    # Обрезка пробелов в начале/конце
    if options.get("trim", True):
        result = result.strip()
    
    # Приведение к регистру
    case = options.get("case", "preserve")
    if case == "upper":
        result = result.upper()
    elif case == "lower":
        result = result.lower()
    elif case == "title":
        result = result.title()
    # preserve - оставляем как есть
    
    return result


def normalize_owner_name(
    owner_name: Optional[str],
    db: Optional[Session] = None,
    options: Optional[Dict[str, Any]] = None,
    dictionary_type: str = "fuel_card_owner"
) -> Dict[str, Optional[str]]:
    """
    Нормализация исходного наименования владельца карты
    
    Приоритет:
    1. Поиск госномера (российский формат) - если priority_license_plate = true
    2. Если только цифры - гаражный номер - если priority_garage_number = true
    3. Остальное - название компании или ФИО
    
    Args:
        owner_name: Исходное наименование владельца
        db: Сессия базы данных (опционально, для получения настроек)
        options: Настройки нормализации (опционально, если не указаны - загружаются из БД)
        dictionary_type: Тип справочника (fuel_card_owner, vehicle, gas_station, fuel_type)
        
    Returns:
        Словарь с полями:
        - normalized: нормализованное значение (госномер, гаражный номер или название)
        - license_plate: госномер (если найден)
        - garage_number: гаражный номер (если найден)
        - company_name: название компании/ФИО (если есть)
        
    Examples:
        >>> normalize_owner_name("А 123 ВС 77")
        {"normalized": "А123ВС77", "license_plate": "А123ВС77", "garage_number": None, "company_name": None}
        >>> normalize_owner_name("1234")
        {"normalized": "1234", "license_plate": None, "garage_number": "1234", "company_name": None}
        >>> normalize_owner_name("ООО Рога и Копыта")
        {"normalized": "ООО Рога и Копыта", "license_plate": None, "garage_number": None, "company_name": "ООО Рога и Копыта"}
        >>> normalize_owner_name("1234 А123ВС77")
        {"normalized": "А123ВС77", "license_plate": "А123ВС77", "garage_number": "1234", "company_name": None}
    """
    if not owner_name:
        return {
            "normalized": None,
            "license_plate": None,
            "garage_number": None,
            "company_name": None
        }
    
    # Получаем настройки нормализации
    if options is None:
        options = get_normalization_settings(db, dictionary_type)
    
    # Типы справочников, для которых доступен поиск госномера и гаражного номера
    TYPES_WITH_LICENSE_PLATE_SEARCH = ['fuel_card_owner', 'vehicle']
    can_search_license_plate = dictionary_type in TYPES_WITH_LICENSE_PLATE_SEARCH
    
    # Применяем базовую нормализацию (удаление символов, регистр и т.д.)
    owner_str = apply_normalization_options(owner_name, options)
    
    if not owner_str:
        return {
            "normalized": None,
            "license_plate": None,
            "garage_number": None,
            "company_name": None
        }
    
    result = {
        "normalized": owner_str,
        "license_plate": None,
        "garage_number": None,
        "company_name": None
    }
    
    # 1. ПРИОРИТЕТ: Ищем госномер (если включен приоритет)
    # Обычный формат: буква(ы), 3 цифры, 2-3 буквы, 2-3 цифры
    license_pattern_standard = r'([АВЕКМНОРСТУХABEKMHOPCTYXавекмнорстухabekmhopctx]{1,2})\s*(\d{3})\s*([АВЕКМНОРСТУХABEKMHOPCTYXавекмнорстухabekmhopctx]{2,3})\s*(\d{2,3})'
    # Формат трактора: 4 цифры, 2 буквы, 2 цифры
    license_pattern_tractor = r'(\d{4})\s*([АВЕКМНОРСТУХABEKMHOPCTYXавекмнорстухabekmhopctx]{2})\s*(\d{2})'
    
    # Ищем госномер в строке (если включен приоритет и тип справочника поддерживает поиск)
    if can_search_license_plate and options.get("priority_license_plate", True):
        match_standard = re.search(license_pattern_standard, owner_str, re.IGNORECASE)
        match_tractor = re.search(license_pattern_tractor, owner_str, re.IGNORECASE)
        
        if match_standard:
            # Обычный формат госномера
            letters1 = match_standard.group(1).upper()
            digits1 = match_standard.group(2)
            letters2 = match_standard.group(3).upper()
            digits2 = match_standard.group(4)
            license_plate = f"{letters1}{digits1}{letters2}{digits2}"
            result["license_plate"] = license_plate
            result["normalized"] = license_plate
            
            # Удаляем госномер из строки для дальнейшего анализа
            owner_str = re.sub(license_pattern_standard, '', owner_str, flags=re.IGNORECASE).strip()
        elif match_tractor:
            # Формат трактора
            digits1 = match_tractor.group(1)
            letters = match_tractor.group(2).upper()
            digits2 = match_tractor.group(3)
            license_plate = f"{digits1}{letters}{digits2}"
            result["license_plate"] = license_plate
            result["normalized"] = license_plate
            
            # Удаляем госномер из строки для дальнейшего анализа
            owner_str = re.sub(license_pattern_tractor, '', owner_str, flags=re.IGNORECASE).strip()
    
    # 2. Если осталась строка, проверяем на гаражный номер (только цифры) - если включен приоритет и тип поддерживает поиск
    if owner_str and can_search_license_plate:
        # Разбиваем на части для анализа
        parts = owner_str.split()
        remaining_parts = []
        
        for part in parts:
            # Убираем спецсимволы для проверки
            part_clean = re.sub(r'[^\w]', '', part)
            digits_only = re.sub(r'[^\d]', '', part_clean)
            
            # Если часть состоит только из цифр - это гаражный номер
            min_length = options.get("min_garage_number_length", 2)
            max_length = options.get("max_garage_number_length", 10)
            if (digits_only and len(digits_only) >= min_length and len(digits_only) <= max_length 
                and part_clean == digits_only and options.get("priority_garage_number", True)):
                if not result["garage_number"]:
                    result["garage_number"] = digits_only
                    if not result["license_plate"]:
                        # Если госномера нет, нормализованное значение = гаражный номер
                        result["normalized"] = digits_only
            else:
                # Сохраняем часть для дальнейшего анализа
                remaining_parts.append(part)
        
        # 3. Остальное - название компании или ФИО
        if remaining_parts:
            company_name = ' '.join(remaining_parts).strip()
            # Убираем лишние пробелы и спецсимволы в начале/конце
            company_name = apply_normalization_options(company_name, options)
            if company_name:
                result["company_name"] = company_name
                # Если нет госномера и гаражного номера, нормализованное значение = название
                if not result["license_plate"] and not result["garage_number"]:
                    result["normalized"] = company_name
    
    # Применяем финальную нормализацию к результату
    if result["normalized"]:
        result["normalized"] = apply_normalization_options(result["normalized"], options)
    if result["license_plate"]:
        result["license_plate"] = apply_normalization_options(result["license_plate"], options)
    if result["garage_number"]:
        result["garage_number"] = apply_normalization_options(result["garage_number"], options)
    if result["company_name"]:
        result["company_name"] = apply_normalization_options(result["company_name"], options)
    
    return result
