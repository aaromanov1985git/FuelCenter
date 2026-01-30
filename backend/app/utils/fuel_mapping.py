"""
Утилиты для маппинга видов топлива
"""
import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)


def normalize_fuel_string(value: str) -> str:
    """
    Нормализует строку топлива для сравнения.
    
    Удаляет пробелы, дефисы и приводит к нижнему регистру.
    Также удаляет невидимые символы.
    
    Args:
        value: Исходная строка
        
    Returns:
        Нормализованная строка
    """
    if not value:
        return ""
    # Приводим к строке, удаляем пробелы, дефисы и невидимые символы
    normalized = str(value).strip().lower()
    # Удаляем все пробелы и дефисы
    normalized = normalized.replace(" ", "").replace("-", "")
    # Удаляем невидимые символы (неразрывные пробелы и т.д.)
    normalized = "".join(char for char in normalized if char.isprintable())
    return normalized


def match_fuel_type(value: str, mapping: Dict[str, str], template_id: Optional[int] = None, template_name: Optional[str] = None) -> Optional[str]:
    """
    Сопоставляет значение топлива с маппингом.
    
    Нормализует значения (lowercase, удаление пробелов и дефисов)
    для толерантного сравнения. Проверяет как прямое соответствие
    (ключ -> значение), так и обратное (если значение уже нормализовано).
    
    Args:
        value: Исходное значение топлива из данных
        mapping: Словарь маппинга {исходное_название: нормализованное_название}
        template_id: ID шаблона для логирования (опционально)
        template_name: Название шаблона для логирования (опционально)
        
    Returns:
        Нормализованное значение топлива или None, если совпадение не найдено
    """
    if not value or not mapping:
        if not value:
            logger.debug("match_fuel_type: пустое значение топлива", extra={
                "template_id": template_id,
                "template_name": template_name
            })
        if not mapping:
            logger.debug("match_fuel_type: маппинг не указан", extra={
                "template_id": template_id,
                "template_name": template_name
            })
        return None
    
    if not isinstance(mapping, dict):
        logger.warning("match_fuel_type: маппинг не является словарем", extra={
            "template_id": template_id,
            "template_name": template_name,
            "mapping_type": type(mapping).__name__
        })
        return None
    
    if len(mapping) == 0:
        logger.debug("match_fuel_type: маппинг пустой", extra={
            "template_id": template_id,
            "template_name": template_name
        })
        return None
    
    # Нормализуем исходное значение
    norm_value = normalize_fuel_string(value)
    
    if not norm_value:
        logger.debug("match_fuel_type: значение топлива пустое после нормализации", extra={
            "template_id": template_id,
            "template_name": template_name,
            "original_value": value
        })
        return None
    
    # Логируем для отладки (только первые несколько вызовов или при проблемах)
    log_debug = template_id is not None
    
    if log_debug:
        logger.debug("match_fuel_type: начало сопоставления", extra={
            "template_id": template_id,
            "template_name": template_name,
            "original_value": value,
            "normalized_value": norm_value,
            "mapping_keys": list(mapping.keys())[:10]  # Первые 10 ключей для логирования
        })
    
    # Проверяем прямое соответствие: ключ маппинга -> значение
    for source_name, target_name in mapping.items():
        if not source_name:
            continue
        
        src_norm = normalize_fuel_string(source_name)
        
        # Прямое соответствие: исходное значение совпадает с ключом маппинга
        if src_norm == norm_value:
            if log_debug:
                logger.debug("match_fuel_type: найдено прямое соответствие", extra={
                    "template_id": template_id,
                    "template_name": template_name,
                    "original_value": value,
                    "source_key": source_name,
                    "target_value": target_name,
                    "normalized_source": src_norm,
                    "normalized_value": norm_value
                })
            return target_name
        
        # Обратное соответствие: если в данных уже "нормализованное" значение
        if target_name:
            tgt_norm = normalize_fuel_string(target_name)
            if tgt_norm == norm_value:
                if log_debug:
                    logger.debug("match_fuel_type: найдено обратное соответствие", extra={
                        "template_id": template_id,
                        "template_name": template_name,
                        "original_value": value,
                        "source_key": source_name,
                        "target_value": target_name,
                        "normalized_target": tgt_norm,
                        "normalized_value": norm_value
                    })
                return target_name
    
    # Совпадение не найдено
    if log_debug:
        logger.debug("match_fuel_type: совпадение не найдено", extra={
            "template_id": template_id,
            "template_name": template_name,
            "original_value": value,
            "normalized_value": norm_value,
            "mapping_keys_count": len(mapping),
            "sample_keys": list(mapping.keys())[:5]  # Первые 5 ключей для отладки
        })
    
    return None
