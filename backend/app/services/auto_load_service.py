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
        # Получаем все активные шаблоны с включенной автозагрузкой
        templates = self.db.query(ProviderTemplate).filter(
            ProviderTemplate.is_active == True,
            ProviderTemplate.auto_load_enabled == True
        ).all()

        logger.info("Начало автоматической загрузки шаблонов", extra={
            "templates_count": len(templates)
        })

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
        logger.info("Автоматическая загрузка для шаблона", extra={
            "template_id": template.id,
            "template_name": template.name,
            "connection_type": template.connection_type
        })

        # Вычисляем даты на основе offset
        today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        
        date_from = today + timedelta(days=template.auto_load_date_from_offset)
        date_to = today + timedelta(days=template.auto_load_date_to_offset)
        
        # Для date_to устанавливаем конец дня
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
                return self._load_from_firebird(template, date_from, date_to)
            elif template.connection_type == "api":
                return self._load_from_api(template, date_from, date_to)
            else:
                return {
                    "template_id": template.id,
                    "template_name": template.name,
                    "success": False,
                    "error": f"Тип подключения '{template.connection_type}' не поддерживает автоматическую загрузку",
                    "transactions_created": 0,
                    "transactions_skipped": 0
                }
        except Exception as e:
            logger.error("Ошибка при загрузке данных для шаблона", extra={
                "template_id": template.id,
                "template_name": template.name,
                "error": str(e)
            }, exc_info=True)
            
            return {
                "template_id": template.id,
                "template_name": template.name,
                "success": False,
                "error": str(e),
                "transactions_created": 0,
                "transactions_skipped": 0
            }

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
        from app import services as app_services
        from decimal import Decimal

        # Проверяем доступность Firebird
        firebird_service_class = get_firebird_service()
        
        if not template.connection_settings:
            raise ValueError("В шаблоне не указаны настройки подключения к Firebird")

        # Парсим настройки подключения
        connection_settings = parse_template_json(template.connection_settings)
        
        # Парсим маппинг полей
        field_mapping = parse_template_json(template.field_mapping)
        
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
                transaction_data["azs_number"] = app_services.extract_azs_number(str(row.get("kazs") or row.get("azs_number") or ""))
                transaction_data["product"] = app_services.normalize_fuel(str(row.get("fuel") or row.get("product") or ""))
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
                "warnings": warnings,
                "message": "Не удалось преобразовать данные в транзакции"
            }

        # Сохраняем транзакции
        batch_processor = TransactionBatchProcessor(self.db)
        created_count, skipped_count = batch_processor.process_transactions_batch(
            transactions_data,
            provider_id=template.provider_id
        )

        return {
            "template_id": template.id,
            "template_name": template.name,
            "success": True,
            "transactions_created": created_count,
            "transactions_skipped": skipped_count,
            "warnings": warnings if warnings else None
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
            api_service.load_transactions(
                template=template,
                date_from=date_from,
                date_to=date_to,
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
                "message": "Данные не найдены за указанный период"
            }

        # Преобразуем данные в транзакции (используем логику из transactions.py)
        # Для API данные уже должны быть в правильном формате
        transactions_data = []
        
        for item in api_data:
            transaction_data = {
                "transaction_date": item.get("transaction_date"),
                "card_number": str(item.get("card_number", "")).strip(),
                "vehicle": str(item.get("vehicle", "")).strip(),
                "azs_number": str(item.get("azs_number", "")).strip(),
                "product": str(item.get("product", "")).strip(),
                "quantity": item.get("quantity"),
                "operation_type": item.get("operation_type", "Покупка"),
                "currency": item.get("currency", "RUB"),
                "exchange_rate": item.get("exchange_rate", 1),
                "provider_id": template.provider_id,
                "source_file": f"API: {template.name}"
            }
            
            if item.get("supplier"):
                transaction_data["supplier"] = str(item["supplier"]).strip()
            if item.get("region"):
                transaction_data["region"] = str(item["region"]).strip()
            if item.get("settlement"):
                transaction_data["settlement"] = str(item["settlement"]).strip()
            if item.get("location"):
                transaction_data["location"] = str(item["location"]).strip()
            if item.get("organization"):
                transaction_data["organization"] = str(item["organization"]).strip()
            
            transactions_data.append(transaction_data)

        if not transactions_data:
            return {
                "template_id": template.id,
                "template_name": template.name,
                "success": True,
                "transactions_created": 0,
                "transactions_skipped": 0,
                "message": "Не удалось преобразовать данные в транзакции"
            }

        # Сохраняем транзакции
        batch_processor = TransactionBatchProcessor(self.db)
        created_count, skipped_count = batch_processor.process_transactions_batch(
            transactions_data,
            provider_id=template.provider_id
        )

        return {
            "template_id": template.id,
            "template_name": template.name,
            "success": True,
            "transactions_created": created_count,
            "transactions_skipped": skipped_count
        }

