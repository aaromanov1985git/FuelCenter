"""
Сервис для автоматической загрузки транзакций из Firebird и API
"""
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.models import ProviderTemplate
from app.logger import logger
from app.utils import (
    get_firebird_service,
    parse_template_json,
    parse_date_range
)
from app.services.api_provider_service import ApiProviderService
from app.services.upload_event_service import UploadEventService
from app import services as app_services


class AutoLoadService:
    """
    Сервис для автоматической загрузки транзакций из Firebird и API
    """

    def __init__(self, db: Session):
        self.db = db

    def load_all_enabled_templates(self) -> Dict[str, Any]:
        """
        Загрузка транзакций для всех шаблонов с включенной автоматической загрузкой
        
        Returns:
            Словарь с результатами загрузки:
            - total_templates: общее количество шаблонов
            - loaded_templates: количество успешно загруженных шаблонов
            - failed_templates: количество шаблонов с ошибками
            - results: список результатов по каждому шаблону
        """
        logger.info("AutoLoadService.load_all_enabled_templates ВЫЗВАН", extra={
            "event_type": "auto_load",
            "event_category": "scheduler"
        })
        
        # Получаем все активные шаблоны с включенной автозагрузкой
        templates = self.db.query(ProviderTemplate).filter(
            ProviderTemplate.is_active == True,
            ProviderTemplate.auto_load_enabled == True
        ).all()

        logger.info(f"Найдено шаблонов с автозагрузкой: {len(templates)}", extra={
            "templates_count": len(templates),
            "event_type": "auto_load",
            "event_category": "scheduler"
        })
        logger.info("Начало автоматической загрузки шаблонов", extra={
            "templates_count": len(templates),
            "event_type": "auto_load",
            "event_category": "start"
        })
        logger.info("=" * 80)

        results = []
        loaded_count = 0
        failed_count = 0

        for template in templates:
            try:
                result = self.load_template(template)
                results.append(result)
                
                if result["success"]:
                    loaded_count += 1
                    # Обновляем дату последней загрузки
                    template.last_auto_load_date = datetime.now()
                    self.db.commit()
                else:
                    failed_count += 1
                    
            except Exception as e:
                logger.error("Ошибка при автоматической загрузке шаблона", extra={
                    "template_id": template.id,
                    "template_name": template.name,
                    "error": str(e)
                }, exc_info=True)
                
                results.append({
                    "template_id": template.id,
                    "template_name": template.name,
                    "success": False,
                    "error": str(e),
                    "transactions_created": 0,
                    "transactions_skipped": 0
                })
                failed_count += 1

        logger.info("Автоматическая загрузка шаблонов завершена", extra={
            "total_templates": len(templates),
            "loaded_count": loaded_count,
            "failed_count": failed_count
        })

        return {
            "total_templates": len(templates),
            "loaded_templates": loaded_count,
            "failed_templates": failed_count,
            "results": results
        }

    def load_template(self, template: ProviderTemplate) -> Dict[str, Any]:
        """
        Загрузка транзакций для одного шаблона
        
        Args:
            template: Шаблон провайдера
            
        Returns:
            Словарь с результатом загрузки
        """
        logger.info("AutoLoadService.load_template: начало загрузки", extra={
            "template_id": template.id,
            "template_name": template.name,
            "connection_type": template.connection_type,
            "has_fuel_mapping": bool(template.fuel_type_mapping),
            "event_type": "auto_load",
            "event_category": "scheduler"
        })
        
        start_time = datetime.now()
        event_service = UploadEventService(self.db)
        status = "failed"
        message = None
        transactions_total = 0
        transactions_created = 0
        transactions_skipped = 0
        result: Dict[str, Any] = {}

        logger.info("=" * 80)
        logger.info("Автоматическая загрузка для шаблона", extra={
            "template_id": template.id,
            "template_name": template.name,
            "connection_type": template.connection_type,
            "has_fuel_mapping": bool(template.fuel_type_mapping),
            "event_type": "auto_load",
            "event_category": "template_load"
        })
        logger.info("=" * 80)

        # Вычисляем даты на основе offset
        today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        
        date_from = today + timedelta(days=template.auto_load_date_from_offset)
        date_to = today + timedelta(days=template.auto_load_date_to_offset)
        
        # Если offset = 0, используем текущее время, иначе - конец дня
        if template.auto_load_date_to_offset == 0:
            date_to = datetime.now()
        else:
            date_to = date_to.replace(hour=23, minute=59, second=59)

        logger.info("Вычислены даты для автоматической загрузки", extra={
            "template_id": template.id,
            "date_from": date_from.isoformat(),
            "date_to": date_to.isoformat(),
            "date_from_offset": template.auto_load_date_from_offset,
            "date_to_offset": template.auto_load_date_to_offset
        })

        try:
            if template.connection_type == "firebird":
                result = self._load_from_firebird(template, date_from, date_to)
            elif template.connection_type in ["api", "web"]:
                result = self._load_from_api(template, date_from, date_to)
            else:
                result = {
                    "template_id": template.id,
                    "template_name": template.name,
                    "success": False,
                    "error": f"Тип подключения '{template.connection_type}' не поддерживает автоматическую загрузку",
                    "transactions_created": 0,
                    "transactions_skipped": 0,
                    "transactions_total": 0
                }
            
            # Логируем результат перед возвратом
            logger.info("Результат автоматической загрузки", extra={
                "template_id": template.id,
                "template_name": template.name,
                "success": result.get("success", False),
                "transactions_created": result.get("transactions_created", 0),
                "transactions_total": result.get("transactions_total", 0)
            })
            
            return result
        except Exception as e:
            logger.error("Ошибка при загрузке данных для шаблона", extra={
                "template_id": template.id,
                "template_name": template.name,
                "error": str(e)
            }, exc_info=True)
            
            message = str(e)
            result = {
                "template_id": template.id,
                "template_name": template.name,
                "success": False,
                "error": str(e),
                "transactions_created": 0,
                "transactions_skipped": 0,
                "transactions_total": 0
            }
            return result
        finally:
            try:
                # Убеждаемся, что result определен
                if not result:
                    result = {}
                
                transactions_created = int(result.get("transactions_created") or 0)
                transactions_skipped = int(result.get("transactions_skipped") or 0)
                transactions_total = int(result.get("transactions_total") or (transactions_created + transactions_skipped))
                status = "success" if result.get("success") else "failed"
                message = message or result.get("message") or result.get("error") or "Неизвестная ошибка"
                
                duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
                
                # Логируем перед записью события
                logger.info("Запись события автозагрузки в журнал", extra={
                    "template_id": template.id,
                    "template_name": template.name,
                    "status": status,
                    "transactions_total": transactions_total,
                    "transactions_created": transactions_created,
                    "is_scheduled": True,
                    "source_type": "auto"
                })
                
                # Всегда логируем событие, даже если загрузка не удалась
                event = event_service.log_event(
                    source_type="auto",
                    status=status,
                    is_scheduled=True,
                    file_name=f"AutoLoad: {template.name}",
                    provider_id=template.provider_id,
                    template_id=template.id,
                    user_id=None,
                    username="system",
                    transactions_total=transactions_total,
                    transactions_created=transactions_created,
                    transactions_skipped=transactions_skipped,
                    transactions_failed=max(transactions_total - transactions_created - transactions_skipped, 0),
                    duration_ms=duration_ms,
                    message=message
                )
                
                # Проверяем, что событие действительно создано
                if event and hasattr(event, 'id'):
                    logger.info("Событие автозагрузки успешно зафиксировано в журнале", extra={
                        "event_id": event.id,
                        "template_id": template.id,
                        "status": status,
                        "transactions_created": transactions_created,
                        "is_scheduled": True
                    })
                else:
                    logger.warning("Событие автозагрузки создано, но ID не получен", extra={
                        "template_id": template.id,
                        "status": status
                    })
            except Exception as log_exc:
                # Не прерываем основной процесс из-за ошибок логирования событий
                logger.error("Не удалось зафиксировать событие автозагрузки в журнале", extra={
                    "template_id": template.id,
                    "template_name": template.name,
                    "error": str(log_exc),
                    "error_type": type(log_exc).__name__
                }, exc_info=True)

    def _load_from_firebird(
        self, 
        template: ProviderTemplate, 
        date_from: datetime, 
        date_to: datetime
    ) -> Dict[str, Any]:
        """
        Загрузка транзакций из Firebird
        
        Args:
            template: Шаблон провайдера
            date_from: Начальная дата
            date_to: Конечная дата
            
        Returns:
            Словарь с результатом загрузки
        """
        from app.services.transaction_batch_processor import TransactionBatchProcessor
        from decimal import Decimal

        # Проверяем доступность Firebird
        firebird_service_class = get_firebird_service()
        
        if not template.connection_settings:
            raise ValueError("В шаблоне не указаны настройки подключения к Firebird")

        # Парсим настройки подключения
        connection_settings = parse_template_json(template.connection_settings)
        
        # Парсим маппинг полей и видов топлива
        field_mapping = parse_template_json(template.field_mapping)
        fuel_type_mapping = None
        try:
            if template.fuel_type_mapping:
                fuel_type_mapping = parse_template_json(template.fuel_type_mapping)
                logger.info(f"Маппинг топлива загружен для шаблона {template.id}", extra={
                    "template_id": template.id,
                    "mapping_keys": list(fuel_type_mapping.keys()) if isinstance(fuel_type_mapping, dict) else None,
                    "is_dict": isinstance(fuel_type_mapping, dict),
                    "event_type": "auto_load",
                    "event_category": "fuel_mapping"
                })
                logger.info("Маппинг видов топлива (Firebird) загружен", extra={
                    "template_id": template.id,
                    "template_name": template.name,
                    "mapping_keys": list(fuel_type_mapping.keys()) if isinstance(fuel_type_mapping, dict) else None,
                    "mapping": fuel_type_mapping if isinstance(fuel_type_mapping, dict) else None,
                    "event_type": "auto_load",
                    "event_category": "fuel_mapping"
                })
            else:
                fuel_type_mapping = None
                logger.warning(f"Маппинг топлива НЕ НАЙДЕН для шаблона {template.id} (fuel_type_mapping пустой)", extra={
                    "template_id": template.id,
                    "event_type": "auto_load",
                    "event_category": "fuel_mapping"
                })
                logger.info("Маппинг видов топлива не указан для шаблона", extra={
                    "template_id": template.id,
                    "template_name": template.name,
                    "event_type": "auto_load",
                    "event_category": "fuel_mapping"
                })
        except Exception as fuel_map_err:
            logger.error(f"ОШИБКА при загрузке маппинга топлива для шаблона {template.id}", extra={
                "template_id": template.id,
                "error": str(fuel_map_err),
                "event_type": "auto_load",
                "event_category": "fuel_mapping"
            }, exc_info=True)
            logger.warning("Не удалось разобрать маппинг видов топлива", extra={
                "template_id": template.id,
                "template_name": template.name,
                "error": str(fuel_map_err),
                "event_type": "auto_load",
                "event_category": "fuel_mapping"
            })
        
        # Читаем данные из Firebird
        firebird_service = firebird_service_class(self.db)
        firebird_data = firebird_service.read_data(
            connection_settings=connection_settings,
            source_table=template.source_table,
            source_query=template.source_query,
            field_mapping=field_mapping,
            date_from=date_from,
            date_to=date_to
        )
        
        logger.info("Данные прочитаны из Firebird", extra={
            "template_id": template.id,
            "rows_count": len(firebird_data)
        })

        if not firebird_data:
            return {
                "template_id": template.id,
                "template_name": template.name,
                "success": True,
                "transactions_created": 0,
                "transactions_skipped": 0,
                "transactions_total": len(firebird_data),
                "message": "Данные не найдены за указанный период"
            }

        # Преобразуем данные в транзакции (используем ту же логику, что и в роутере)
        transactions_data = []
        warnings = []
        warning_counts = {}

        quantity_field_names = ["quantity", "qty"]
        date_field_names = ["date", "transaction_date"]

        if field_mapping:
            for sys_field, db_field in field_mapping.items():
                if sys_field.lower() in ['quantity', 'qty', 'количество']:
                    quantity_field_names.append(db_field)
                if sys_field.lower() in ['date', 'transaction_date', 'дата']:
                    date_field_names.append(db_field)

        for row_idx, row in enumerate(firebird_data):
            try:
                transaction_data = {}
                
                # Дата транзакции
                date_value = None
                for field_name in date_field_names:
                    date_value = row.get(field_name)
                    if not date_value:
                        for key, val in row.items():
                            if key.lower() == field_name.lower():
                                date_value = val
                                break
                    if date_value:
                        break
                
                if date_value:
                    if isinstance(date_value, datetime):
                        transaction_data["transaction_date"] = date_value
                    else:
                        parsed_date = app_services.parse_excel_date(date_value)
                        if parsed_date:
                            transaction_data["transaction_date"] = parsed_date
                        else:
                            continue
                else:
                    continue
                
                # Количество
                qty_value = None
                for field_name in quantity_field_names:
                    qty_value = row.get(field_name)
                    if not qty_value:
                        for key, val in row.items():
                            if key.lower() == field_name.lower():
                                qty_value = val
                                break
                    if qty_value is not None:
                        break
                
                if qty_value is not None:
                    qty_decimal = app_services.convert_to_decimal(qty_value)
                    if qty_decimal is not None:
                        if qty_decimal < 0:
                            qty_decimal = abs(qty_decimal)
                        transaction_data["quantity"] = qty_decimal
                    else:
                        continue
                else:
                    continue
                
                # Остальные поля
                transaction_data["card_number"] = str(row.get("card") or row.get("card_number") or "").strip()
                transaction_data["vehicle"] = str(row.get("user") or row.get("vehicle") or "").strip()
                kazs_value = str(row.get("kazs") or row.get("azs_number") or "").strip()
                transaction_data["azs_number"] = app_services.extract_azs_number(kazs_value)
                transaction_data["azs_original_name"] = kazs_value  # Сохраняем оригинальное название АЗС
                raw_fuel = str(row.get("fuel") or row.get("product") or "")
                # Сначала пробуем маппинг видов топлива из шаблона (толерантный к регистру и пробелам/дефисам)
                def _match_fuel(value: str, mapping: Dict[str, str]) -> Optional[str]:
                    norm = value.strip().lower().replace(" ", "").replace("-", "")
                    for source_name, target_name in mapping.items():
                        if not source_name:
                            continue
                        src_norm = source_name.strip().lower().replace(" ", "").replace("-", "")
                        # прямое соответствие: ключ -> значение
                        if src_norm == norm:
                            return target_name
                        # обратное соответствие: если в данных уже "нормализованное" значение, оставляем как есть
                        if target_name:
                            tgt_norm = str(target_name).strip().lower().replace(" ", "").replace("-", "")
                            if tgt_norm == norm:
                                return target_name
                    return None

                normalized_fuel = raw_fuel
                if raw_fuel and fuel_type_mapping:
                    mapped = _match_fuel(raw_fuel, fuel_type_mapping)
                    if mapped:
                        normalized_fuel = mapped
                        logger.debug("Маппинг применен", extra={
                            "raw_fuel": raw_fuel,
                            "normalized_fuel": normalized_fuel,
                            "template_id": template.id
                        })
                        logger.info("Маппинг топлива применен (Firebird)", extra={
                            "template_id": template.id,
                            "template_name": template.name,
                            "raw_fuel": raw_fuel,
                            "mapped_fuel": normalized_fuel,
                            "event_type": "auto_load",
                            "event_category": "fuel_mapping"
                        })
                    else:
                        logger.debug("Маппинг НЕ НАЙДЕН, используем нормализацию", extra={
                            "raw_fuel": raw_fuel,
                            "template_id": template.id
                        })
                # Если маппинг не сработал, используем стандартную нормализацию
                if normalized_fuel == raw_fuel:
                    normalized_fuel = app_services.normalize_fuel(raw_fuel)
                transaction_data["product"] = normalized_fuel
                transaction_data["operation_type"] = "Покупка"
                transaction_data["currency"] = "RUB"
                transaction_data["exchange_rate"] = Decimal("1")
                transaction_data["source_file"] = f"Firebird: {template.name}"
                transaction_data["organization"] = str(row.get("organization") or row.get("org") or "").strip()
                transaction_data["provider_id"] = template.provider_id
                
                if row.get("supplier"):
                    transaction_data["supplier"] = str(row["supplier"]).strip()
                if row.get("region"):
                    transaction_data["region"] = str(row["region"]).strip()
                if row.get("settlement"):
                    transaction_data["settlement"] = str(row["settlement"]).strip()
                if row.get("location"):
                    transaction_data["location"] = str(row["location"]).strip()
                
                transactions_data.append(transaction_data)
                
            except Exception as e:
                logger.warning("Ошибка преобразования строки данных из Firebird", extra={
                    "error": str(e),
                    "template_id": template.id
                })
                continue

        if not transactions_data:
            return {
                "template_id": template.id,
                "template_name": template.name,
                "success": True,
                "transactions_created": 0,
                "transactions_skipped": 0,
                "transactions_total": len(transactions_data),
                "warnings": warnings,
                "message": "Не удалось преобразовать данные в транзакции"
            }

        # Сохраняем транзакции
        batch_processor = TransactionBatchProcessor(self.db)
        # Используем create_transactions для получения warnings
        created_count, skipped_count, batch_warnings = batch_processor.create_transactions(transactions_data)
        
        # Объединяем предупреждения
        all_warnings = warnings + (batch_warnings if batch_warnings else [])

        # Формируем сообщение
        message = f"Успешно загружено транзакций: {created_count}"
        if skipped_count > 0:
            message += f", пропущено дубликатов: {skipped_count}"
        if all_warnings:
            warnings_text = "; ".join(all_warnings[:3])  # Показываем первые 3 предупреждения
            if len(all_warnings) > 3:
                warnings_text += f" и еще {len(all_warnings) - 3}"
            message += f". Предупреждения: {warnings_text}"

        return {
            "template_id": template.id,
            "template_name": template.name,
            "success": True,
            "transactions_created": created_count,
            "transactions_skipped": skipped_count,
            "transactions_total": len(transactions_data),
            "warnings": all_warnings if all_warnings else None,
            "message": message
        }

    def _load_from_api(
        self, 
        template: ProviderTemplate, 
        date_from: datetime, 
        date_to: datetime
    ) -> Dict[str, Any]:
        """
        Загрузка транзакций через API
        
        Args:
            template: Шаблон провайдера
            date_from: Начальная дата
            date_to: Конечная дата
            
        Returns:
            Словарь с результатом загрузки
        """
        from app.services.transaction_batch_processor import TransactionBatchProcessor
        import asyncio

        api_service = ApiProviderService(self.db)
        
        if not template.connection_settings:
            raise ValueError("В шаблоне не указаны настройки подключения к API")

        # Загружаем данные через API
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

        api_data = loop.run_until_complete(
            api_service.fetch_transactions(
                template=template,
                date_from=date_from.date() if isinstance(date_from, datetime) else date_from,
                date_to=date_to.date() if isinstance(date_to, datetime) else date_to,
                card_numbers=None
            )
        )
        
        logger.info("Данные загружены через API", extra={
            "template_id": template.id,
            "rows_count": len(api_data) if api_data else 0
        })

        if not api_data:
            return {
                "template_id": template.id,
                "template_name": template.name,
                "success": True,
                "transactions_created": 0,
                "transactions_skipped": 0,
                "transactions_total": 0,
                "message": "Данные не найдены за указанный период"
            }

        # Применяем маппинг видов топлива, если задан в шаблоне
        fuel_type_mapping = None
        try:
            if template.fuel_type_mapping:
                fuel_type_mapping = parse_template_json(template.fuel_type_mapping)
        except Exception as fuel_map_err:
            logger.warning("Не удалось разобрать маппинг видов топлива для API", extra={
                "template_id": template.id,
                "error": str(fuel_map_err)
            })

        if fuel_type_mapping:
            def _match_fuel(value: str, mapping: Dict[str, str]) -> Optional[str]:
                norm = value.strip().lower().replace(" ", "").replace("-", "")
                for source_name, target_name in mapping.items():
                    if not source_name:
                        continue
                    src_norm = source_name.strip().lower().replace(" ", "").replace("-", "")
                    # прямое соответствие: ключ -> значение
                    if src_norm == norm:
                        return target_name
                    # обратное соответствие: если в данных уже "нормализованное" значение, возвращаем его
                    if target_name:
                        tgt_norm = str(target_name).strip().lower().replace(" ", "").replace("-", "")
                        if tgt_norm == norm:
                            return target_name
                return None

            for item in api_data:
                raw_product = item.get("product") or item.get("service") or item.get("serviceName") or ""
                if not raw_product:
                    continue
                mapped = _match_fuel(str(raw_product), fuel_type_mapping)
                if mapped:
                    item["product"] = mapped
                    logger.info("Маппинг топлива применен (API)", extra={
                        "template_id": template.id,
                        "raw_product": raw_product,
                        "mapped_product": mapped
                    })
                else:
                    item["product"] = app_services.normalize_fuel(raw_product)

        # Данные из fetch_transactions уже в правильном формате системы
        # Сохраняем транзакции
        batch_processor = TransactionBatchProcessor(self.db)
        created_count, skipped_count, warnings = batch_processor.create_transactions(api_data)

        message = f"Успешно загружено транзакций: {created_count}"
        if skipped_count > 0:
            message += f", пропущено дубликатов: {skipped_count}"
        
        return {
            "template_id": template.id,
            "template_name": template.name,
            "success": True,
            "transactions_created": created_count,
            "transactions_skipped": skipped_count,
            "transactions_total": len(api_data),
            "message": message,
            "warnings": warnings if warnings else None
        }

