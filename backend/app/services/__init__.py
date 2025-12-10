"""
Сервисы для бизнес-логики
"""
# Экспортируем функции из основного модуля services.py
# Используем importlib для загрузки файла services.py напрямую
import sys
import importlib.util
from pathlib import Path

# Получаем абсолютный путь к файлу services.py
current_dir = Path(__file__).parent
services_file = current_dir.parent / "services.py"

# Загружаем модуль services.py
spec = importlib.util.spec_from_file_location("app_services_module", services_file)
app_services_module = importlib.util.module_from_spec(spec)
sys.modules["app_services_module"] = app_services_module
spec.loader.exec_module(app_services_module)

# Экспортируем нужные функции из services.py
process_excel_file = app_services_module.process_excel_file
create_transactions = app_services_module.create_transactions
detect_provider_and_template = app_services_module.detect_provider_and_template
analyze_template_structure = app_services_module.analyze_template_structure
parse_excel_date = app_services_module.parse_excel_date
convert_to_decimal = app_services_module.convert_to_decimal
extract_azs_number = app_services_module.extract_azs_number
normalize_fuel = app_services_module.normalize_fuel
get_or_create_vehicle = app_services_module.get_or_create_vehicle
get_or_create_fuel_card = app_services_module.get_or_create_fuel_card
assign_card_to_vehicle = app_services_module.assign_card_to_vehicle

# parse_vehicle_field импортируется из validators в services.py, но не экспортируется
# Импортируем его напрямую из validators для совместимости
from app.validators import parse_vehicle_field

__all__ = [
    "process_excel_file",
    "create_transactions",
    "detect_provider_and_template",
    "analyze_template_structure",
    "parse_excel_date",
    "convert_to_decimal",
    "extract_azs_number",
    "normalize_fuel",
    "get_or_create_vehicle",
    "get_or_create_fuel_card",
    "assign_card_to_vehicle",
    "parse_vehicle_field"
]
