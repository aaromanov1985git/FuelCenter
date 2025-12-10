"""
Валидаторы для проверки данных
"""
import re
from typing import Dict, Tuple, Optional


# Маппинг похожих символов кириллица/латиница
SIMILAR_CHARS = {
    'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 
    'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'У': 'Y', 'Х': 'X',
    'а': 'a', 'в': 'b', 'е': 'e', 'к': 'k', 'м': 'm', 'н': 'h',
    'о': 'o', 'р': 'p', 'с': 'c', 'т': 't', 'у': 'y', 'х': 'x'
}


def detect_mixed_alphabet(text: str) -> bool:
    """
    Обнаружение смешанного использования кириллицы и латиницы
    """
    if not text:
        return False
    
    has_cyrillic = bool(re.search(r'[А-Яа-яЁё]', text))
    has_latin = bool(re.search(r'[A-Za-z]', text))
    
    return has_cyrillic and has_latin


def validate_license_plate(plate: str) -> Tuple[bool, Optional[str]]:
    """
    Валидация государственного номера
    
    Форматы:
    - X123XX123 или X123XX12 (обычный формат: буква, 3 цифры, 2-3 буквы, 2-3 цифры)
    - 1234XX12 (трактор: 4 цифры, 2 буквы, 2 цифры)
    - 2 буквы, 3 цифры, 2-3 буквы, 2-3 цифры (старый формат)
    """
    if not plate:
        return False, "Госномер не указан"
    
    plate = plate.strip().upper()
    
    # Проверка на смешанный алфавит
    if detect_mixed_alphabet(plate):
        return False, "Обнаружено смешанное использование кириллицы и латиницы"
    
    # Паттерн для обычного российского госномера: буква, 3 цифры, 2-3 буквы, 2-3 цифры
    # Или старый формат: 2 буквы, 3 цифры, 2-3 буквы, 2-3 цифры
    pattern_standard = r'^[АВЕКМНОРСТУХABEKMHOPCTYX]{1,2}\d{3}[АВЕКМНОРСТУХABEKMHOPCTYX]{2,3}\d{2,3}$'
    
    # Паттерн для тракторов и спецтехники: 4 цифры, 2 буквы, 2 цифры
    pattern_tractor = r'^\d{4}[АВЕКМНОРСТУХABEKMHOPCTYX]{2}\d{2}$'
    
    if re.match(pattern_standard, plate) or re.match(pattern_tractor, plate):
        return True, None
    
    return False, f"Неверный формат госномера: {plate}"


def validate_garage_number(number: str) -> Tuple[bool, Optional[str]]:
    """
    Валидация гаражного номера
    """
    if not number:
        return False, "Гаражный номер не указан"
    
    number = number.strip()
    
    # Гаражный номер обычно содержит цифры и может содержать буквы
    if not re.match(r'^[А-Яа-яA-Za-z0-9\s\-_]+$', number):
        return False, f"Неверный формат гаражного номера: {number}"
    
    return True, None


def parse_vehicle_field(vehicle_str: str) -> Dict[str, Optional[str]]:
    """
    Парсинг поля "Закреплена за" для извлечения гаражного номера и госномера
    
    Форматы:
    - "1234 А123ВС77" (гаражный номер + госномер)
    - "А123ВС77" (только госномер)
    - "1234" (только гаражный номер)
    """
    if not vehicle_str:
        return {
            "garage_number": None,
            "license_plate": None,
            "original": vehicle_str
        }
    
    vehicle_str = vehicle_str.strip()
    parts = vehicle_str.split()
    
    result = {
        "garage_number": None,
        "license_plate": None,
        "original": vehicle_str
    }
    
    if len(parts) == 0:
        return result
    
    # Пытаемся определить госномер (обычно содержит буквы и цифры в определенном формате)
    # Обычный формат: буква, 3 цифры, 2-3 буквы, 2-3 цифры
    license_pattern_standard = r'^[АВЕКМНОРСТУХABEKMHOPCTYXавекмнорстухabekmhopctx]{1,2}\d{3}[АВЕКМНОРСТУХABEKMHOPCTYXавекмнорстухabekmhopctx]{2,3}\d{2,3}$'
    # Формат трактора: 4 цифры, 2 буквы, 2 цифры
    license_pattern_tractor = r'^\d{4}[АВЕКМНОРСТУХABEKMHOPCTYXавекмнорстухabekmhopctx]{2}\d{2}$'
    
    for part in parts:
        part_clean = re.sub(r'[^\w]', '', part)  # Убираем спецсимволы
        if re.match(license_pattern_standard, part_clean, re.IGNORECASE) or \
           re.match(license_pattern_tractor, part_clean, re.IGNORECASE):
            result["license_plate"] = part_clean.upper()
        else:
            # Если это не госномер, считаем гаражным номером
            if not result["garage_number"]:
                result["garage_number"] = part
    
    # Если нашли только один элемент и он не госномер - это гаражный номер
    if len(parts) == 1 and not result["license_plate"]:
        result["garage_number"] = parts[0]
    
    return result


def validate_vehicle_data(garage_number: Optional[str], license_plate: Optional[str]) -> Dict[str, any]:
    """
    Валидация данных транспортного средства
    
    Возвращает словарь с результатами валидации
    """
    errors = []
    warnings = []
    
    # Валидация госномера
    if license_plate:
        is_valid, error = validate_license_plate(license_plate)
        if not is_valid:
            errors.append(f"Госномер: {error}")
        elif detect_mixed_alphabet(license_plate):
            warnings.append("Возможна ошибка: смешанное использование кириллицы и латиницы в госномере")
    else:
        warnings.append("Госномер не указан")
    
    # Валидация гаражного номера
    if garage_number:
        is_valid, error = validate_garage_number(garage_number)
        if not is_valid:
            errors.append(f"Гаражный номер: {error}")
    else:
        warnings.append("Гаражный номер не указан")
    
    return {
        "is_valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings
    }


def validate_azs_number(azs_number: str) -> Tuple[bool, Optional[str]]:
    """
    Валидация номера АЗС
    """
    if not azs_number:
        return False, "Номер АЗС не указан"
    
    azs_number = azs_number.strip()
    
    # Номер АЗС обычно содержит цифры и может содержать буквы
    if not re.match(r'^[А-Яа-яA-Za-z0-9\s\-_]+$', azs_number):
        return False, f"Неверный формат номера АЗС: {azs_number}"
    
    return True, None


def validate_gas_station_data(
    azs_number: Optional[str] = None,
    location: Optional[str] = None,
    region: Optional[str] = None,
    settlement: Optional[str] = None
) -> Dict[str, any]:
    """
    Валидация данных автозаправочной станции
    
    Возвращает словарь с результатами валидации
    """
    errors = []
    warnings = []
    
    # Валидация номера АЗС
    if azs_number:
        is_valid, error = validate_azs_number(azs_number)
        if not is_valid:
            errors.append(f"Номер АЗС: {error}")
    else:
        warnings.append("Номер АЗС не указан")
    
    # Проверка местоположения
    if not location and not region and not settlement:
        warnings.append("Местоположение не указано")
    
    return {
        "is_valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings
    }
