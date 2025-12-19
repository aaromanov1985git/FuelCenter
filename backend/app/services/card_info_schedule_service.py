"""
Сервис для выполнения регламента получения информации по картам
"""
import json
import asyncio
from datetime import datetime
from typing import Dict, List, Optional, Any
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from app.models import FuelCard, ProviderTemplate, CardInfoSchedule
from app.services.api_provider_service import ApiProviderService
from app.services.normalization_service import normalize_owner_name
from app.logger import logger


class CardInfoScheduleService:
    """
    Сервис для выполнения регламента получения информации по картам
    """
    
    def __init__(self, db: Session):
        self.db = db
    
    async def execute_schedule(self, schedule: CardInfoSchedule) -> Dict[str, Any]:
        """
        Выполнить регламент получения информации по картам
        
        Args:
            schedule: Регламент для выполнения
            
        Returns:
            Словарь с результатами выполнения
        """
        logger.info(f"Начало выполнения регламента получения информации по картам: {schedule.name}", extra={
            "schedule_id": schedule.id,
            "schedule_name": schedule.name,
            "event_type": "card_info_schedule",
            "event_category": "execution"
        })
        
        # Проверяем, что регламент активен
        if not schedule.is_active:
            logger.warning(f"Регламент неактивен: {schedule.name}", extra={
                "schedule_id": schedule.id
            })
            return {
                "status": "error",
                "cards_processed": 0,
                "cards_updated": 0,
                "cards_failed": 0,
                "error_message": "Регламент неактивен"
            }
        
        # Получаем шаблон провайдера
        template = self.db.query(ProviderTemplate).filter(
            ProviderTemplate.id == schedule.provider_template_id
        ).first()
        
        if not template:
            error_msg = f"Шаблон провайдера не найден: {schedule.provider_template_id}"
            logger.error(error_msg, extra={"schedule_id": schedule.id})
            return {
                "status": "error",
                "cards_processed": 0,
                "cards_updated": 0,
                "cards_failed": 0,
                "error_message": error_msg
            }
        
        # Проверяем тип подключения
        if template.connection_type != "web":
            error_msg = f"Шаблон провайдера должен иметь тип подключения 'web', получен: {template.connection_type}"
            logger.error(error_msg, extra={"schedule_id": schedule.id, "template_id": template.id})
            return {
                "status": "error",
                "cards_processed": 0,
                "cards_updated": 0,
                "cards_failed": 0,
                "error_message": error_msg
            }
        
        # Парсим фильтр карт
        filter_options = self._parse_filter_options(schedule.filter_options)
        
        # Получаем список карт для обработки
        cards = self._get_cards_for_processing(template.provider_id, filter_options)
        
        if not cards:
            logger.info(f"Не найдено карт для обработки по регламенту: {schedule.name}", extra={
                "schedule_id": schedule.id
            })
            return {
                "status": "success",
                "cards_processed": 0,
                "cards_updated": 0,
                "cards_failed": 0,
                "error_message": None
            }
        
        logger.info(f"Найдено карт для обработки: {len(cards)}", extra={
            "schedule_id": schedule.id,
            "cards_count": len(cards)
        })
        
        # Создаем сервис и адаптер
        try:
            api_service = ApiProviderService(self.db)
            adapter = api_service.create_adapter(template)
        except Exception as e:
            error_msg = f"Ошибка создания адаптера Web API: {str(e)}"
            logger.error(error_msg, extra={"schedule_id": schedule.id}, exc_info=True)
            return {
                "status": "error",
                "cards_processed": 0,
                "cards_updated": 0,
                "cards_failed": 0,
                "error_message": error_msg
            }
        
        # Обрабатываем карты
        cards_processed = 0
        cards_updated = 0
        cards_failed = 0
        errors = []
        
        async with adapter:
            for card in cards:
                try:
                    cards_processed += 1
                    
                    # Получаем информацию по карте
                    card_info = await adapter.get_card_info(
                        card_number=card.card_number,
                        flags=schedule.flags or 23
                    )
                    
                    if not card_info:
                        cards_failed += 1
                        errors.append(f"Карта {card.card_number}: не получена информация")
                        continue
                    
                    # Обновляем карту, если включено автообновление
                    if schedule.auto_update:
                        updated = self._update_card_from_info(card, card_info)
                        if updated:
                            cards_updated += 1
                    
                except Exception as e:
                    cards_failed += 1
                    error_msg = f"Карта {card.card_number}: {str(e)}"
                    errors.append(error_msg)
                    logger.error(f"Ошибка обработки карты {card.card_number}", extra={
                        "schedule_id": schedule.id,
                        "card_id": card.id,
                        "card_number": card.card_number,
                        "error": str(e)
                    }, exc_info=True)
        
        # Определяем статус результата
        if cards_failed == 0:
            status = "success"
        elif cards_updated > 0:
            status = "partial"
        else:
            status = "error"
        
        result = {
            "status": status,
            "cards_processed": cards_processed,
            "cards_updated": cards_updated,
            "cards_failed": cards_failed,
            "error_message": "; ".join(errors[:5]) if errors else None  # Первые 5 ошибок
        }
        
        # Сохраняем результат в регламент
        schedule.last_run_date = datetime.utcnow()
        schedule.last_run_result = json.dumps(result, ensure_ascii=False)
        self.db.commit()
        
        logger.info(f"Завершено выполнение регламента: {schedule.name}", extra={
            "schedule_id": schedule.id,
            "status": status,
            "cards_processed": cards_processed,
            "cards_updated": cards_updated,
            "cards_failed": cards_failed
        })
        
        return result
    
    def _parse_filter_options(self, filter_options_str: Optional[str]) -> Dict[str, Any]:
        """
        Парсинг опций фильтрации из JSON строки
        
        Args:
            filter_options_str: JSON строка с опциями фильтрации
            
        Returns:
            Словарь с опциями фильтрации
        """
        if not filter_options_str:
            return {}
        
        try:
            if isinstance(filter_options_str, str):
                return json.loads(filter_options_str)
            return filter_options_str
        except (json.JSONDecodeError, TypeError):
            logger.warning(f"Ошибка парсинга filter_options: {filter_options_str}")
            return {}
    
    def _get_cards_for_processing(self, provider_id: int, filter_options: Dict[str, Any]) -> List[FuelCard]:
        """
        Получить список карт для обработки по фильтру
        
        Args:
            provider_id: ID провайдера (из шаблона)
            filter_options: Опции фильтрации (provider_ids игнорируется, так как провайдер уже определен шаблоном)
            
        Returns:
            Список карт для обработки
        """
        # Провайдер определяется шаблоном, поэтому всегда фильтруем по provider_id из шаблона
        query = self.db.query(FuelCard).filter(FuelCard.provider_id == provider_id)
        
        # Фильтр по конкретным номерам карт
        if filter_options.get("card_numbers"):
            query = query.filter(FuelCard.card_number.in_(filter_options["card_numbers"]))
        
        # Фильтр по привязке к ТС
        if filter_options.get("only_with_vehicle"):
            query = query.filter(FuelCard.vehicle_id.isnot(None))
        
        # Фильтр по статусу блокировки
        if filter_options.get("only_blocked") is not None:
            if filter_options["only_blocked"]:
                query = query.filter(FuelCard.is_blocked == True)
            else:
                query = query.filter(FuelCard.is_blocked == False)
        
        # Фильтр по активному закреплению
        if filter_options.get("only_active"):
            query = query.filter(FuelCard.is_active_assignment == True)
        
        return query.all()
    
    def _update_card_from_info(self, card: FuelCard, card_info: Dict[str, Any]) -> bool:
        """
        Обновить карту данными из API
        
        Args:
            card: Карта для обновления
            card_info: Данные из API
            
        Returns:
            True, если карта была обновлена
        """
        updated = False
        
        # PersonName -> original_owner_name с нормализацией
        if card_info.get('person_name'):
            if card.original_owner_name != card_info['person_name']:
                card.original_owner_name = card_info['person_name']
                updated = True
            
            # Нормализуем и сохраняем в normalized_owner
            normalized_data = normalize_owner_name(card_info['person_name'], db=self.db, dictionary_type="fuel_card_owner")
            if normalized_data.get('normalized'):
                if card.normalized_owner != normalized_data['normalized']:
                    card.normalized_owner = normalized_data['normalized']
                    updated = True
        
        # State -> is_blocked (0 = работает, 1/2/4 = заблокирована)
        if 'state' in card_info:
            new_is_blocked = card_info['state'] != 0
            if card.is_blocked != new_is_blocked:
                card.is_blocked = new_is_blocked
                updated = True
        
        if updated:
            self.db.commit()
            self.db.refresh(card)
        
        return updated
