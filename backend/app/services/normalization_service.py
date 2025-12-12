"""
Сервис нормализации данных
Утилиты для приведения данных к единому формату
"""
import re
from typing import Optional


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
