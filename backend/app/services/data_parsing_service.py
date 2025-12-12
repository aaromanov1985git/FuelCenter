"""
Сервис парсинга данных
Утилиты для конвертации и парсинга данных из различных источников
"""
import pandas as pd
from datetime import datetime
from decimal import Decimal
from typing import Optional


def parse_excel_date(date_value) -> Optional[datetime]:
    """
    Парсинг даты из Excel файла

    Поддерживает различные форматы:
    - Excel числовое представление
    - pandas.Timestamp
    - datetime объекты
    - Строки в форматах: DD.MM.YYYY HH:MM:SS, DD.MM.YYYY HH:MM, ISO

    Args:
        date_value: Значение даты из Excel

    Returns:
        datetime объект или None если не удалось распарсить

    Examples:
        >>> parse_excel_date(44197)  # Excel date
        datetime(2021, 1, 1, 0, 0)
        >>> parse_excel_date("01.01.2021 10:30")
        datetime(2021, 1, 1, 10, 30)
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
        except Exception:
            pass

    # Если это строка
    if isinstance(date_value, str):
        date_str = date_value.strip().replace("  ", " ")
        try:
            # Формат DD.MM.YYYY HH:mm:ss
            return datetime.strptime(date_str, "%d.%m.%Y %H:%M:%S")
        except ValueError:
            try:
                # Формат DD.MM.YYYY HH:mm
                return datetime.strptime(date_str, "%d.%m.%Y %H:%M")
            except ValueError:
                try:
                    # Стандартный формат (ISO, etc)
                    return pd.to_datetime(date_str).to_pydatetime()
                except Exception:
                    pass

    return None


def convert_to_decimal(value) -> Optional[Decimal]:
    """
    Конвертация значения в Decimal

    Поддерживает:
    - Числа (int, float)
    - Строки с запятыми и точками как разделителями
    - None и пустые строки

    Args:
        value: Значение для конвертации

    Returns:
        Decimal объект или None

    Examples:
        >>> convert_to_decimal("123,45")
        Decimal('123.45')
        >>> convert_to_decimal(100)
        Decimal('100')
        >>> convert_to_decimal("")
        None
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
    except (ValueError, TypeError, ArithmeticError):
        return None
