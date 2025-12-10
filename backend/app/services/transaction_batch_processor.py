"""
Сервис для батчевой обработки транзакций
Оптимизирует создание транзакций в БД через bulk операции
"""
import re
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from typing import List, Dict, Tuple, Set, Optional, Optional
from datetime import datetime
from app.models import Transaction, Vehicle, FuelCard
# Импортируем функции из основного модуля services (не из папки services/)
from app import services as app_services
from app.logger import logger


class TransactionBatchProcessor:
    """
    Процессор для батчевой обработки транзакций
    Оптимизирует проверку дубликатов и создание записей
    """
    
    # Размер батча для обработки
    BATCH_SIZE = 500
    
    def __init__(self, db: Session):
        self.db = db
    
    def create_transactions(
        self,
        transactions: List[Dict]
    ) -> Tuple[int, int, List[str]]:
        """
        Создание транзакций в БД с батчевой проверкой дубликатов
        
        Args:
            transactions: Список словарей с данными транзакций
        
        Returns:
            Tuple: (создано, пропущено, предупреждения)
        """
        if not transactions:
            return 0, 0, []
        
        # Преобразуем номер карты в строку для всех транзакций заранее
        for trans_data in transactions:
            card_number = trans_data.get("card_number")
            if card_number is not None:
                trans_data["card_number"] = str(card_number).strip() if card_number else None
        
        created_count = 0
        skipped_count = 0
        warnings = []
        
        # Обрабатываем транзакции батчами
        total_batches = (len(transactions) + self.BATCH_SIZE - 1) // self.BATCH_SIZE
        logger.info(f"Начало обработки {len(transactions)} транзакций в {total_batches} батчах")
        
        for i in range(0, len(transactions), self.BATCH_SIZE):
            batch_num = i // self.BATCH_SIZE + 1
            batch = transactions[i:i + self.BATCH_SIZE]
            
            logger.info(f"Обработка батча {batch_num}/{total_batches} ({len(batch)} транзакций)")
            batch_created, batch_skipped, batch_warnings = self._process_batch(batch)
            
            created_count += batch_created
            skipped_count += batch_skipped
            warnings.extend(batch_warnings)
            
            logger.info(
                f"Батч {batch_num}/{total_batches} обработан",
                extra={
                    "batch_num": batch_num,
                    "total_batches": total_batches,
                    "batch_size": len(batch),
                    "items_created": batch_created,
                    "items_skipped": batch_skipped,
                    "total_created": created_count,
                    "total_skipped": skipped_count
                }
            )
        
        return created_count, skipped_count, warnings
    
    def _process_batch(
        self,
        batch: List[Dict]
    ) -> Tuple[int, int, List[str]]:
        """
        Обработка одного батча транзакций
        """
        # Батчевая проверка дубликатов
        existing_transactions = self._check_duplicates_batch(batch)
        
        # Фильтруем существующие транзакции
        new_transactions = []
        skipped_count = 0
        
        for trans_data in batch:
            # Проверяем, является ли транзакция дубликатом
            if self._is_duplicate(trans_data, existing_transactions):
                skipped_count += 1
                continue
            
            new_transactions.append(trans_data)
        
        if not new_transactions:
            return 0, skipped_count, []
        
        # Обрабатываем справочники и создаем транзакции
        created_count = 0
        warnings = []
        
        # Батчевая обработка справочников (собираем предупреждения)
        vehicles_map = self._process_vehicles_batch(new_transactions, warnings)
        cards_map = self._process_cards_batch(new_transactions, vehicles_map, warnings)
        
        # Создаем транзакции
        for trans_data in new_transactions:
            vehicle_name = trans_data.get("vehicle")
            vehicle_id = None
            
            if vehicle_name:
                vehicle_data = app_services.parse_vehicle_field(vehicle_name)
                vehicle_key = vehicle_data["original"]
                vehicle_id = vehicles_map.get(vehicle_key)
            
            card_number = trans_data.get("card_number")
            if card_number:
                # Преобразуем номер карты в строку, если он передан как число
                card_number = str(card_number).strip() if card_number else None
                trans_data["card_number"] = card_number
                card_id = cards_map.get(card_number)
                # Обновляем vehicle_id в карте, если нужно
                if card_id and vehicle_id:
                    card = self.db.query(FuelCard).filter(FuelCard.id == card_id).first()
                    if card and not card.vehicle_id:
                        card.vehicle_id = vehicle_id
                        self.db.flush()
            
            trans_data["vehicle_id"] = vehicle_id
            
            # Удаляем поля, которых нет в модели Transaction
            # Оставляем только те поля, которые есть в модели
            transaction_fields = {
                "transaction_date", "card_number", "vehicle", "vehicle_id", "azs_number",
                "provider_id", "supplier", "region", "settlement", "location", "location_code",
                "product", "operation_type", "quantity", "currency", "exchange_rate",
                "price", "price_with_discount", "amount", "amount_with_discount",
                "discount_percent", "discount_amount", "vat_rate", "vat_amount",
                "source_file", "organization"
            }
            
            # Фильтруем только допустимые поля
            filtered_trans_data = {k: v for k, v in trans_data.items() if k in transaction_fields}
            
            # Проверяем обязательные поля
            if not filtered_trans_data.get("transaction_date"):
                warnings.append("Пропущена транзакция: отсутствует дата")
                continue
            if not filtered_trans_data.get("quantity"):
                warnings.append("Пропущена транзакция: отсутствует количество")
                continue
            
            try:
                db_transaction = Transaction(**filtered_trans_data)
                self.db.add(db_transaction)
                created_count += 1
            except Exception as e:
                logger.error(
                    "Ошибка при создании транзакции",
                    extra={
                        "trans_data_keys": list(trans_data.keys()),
                        "filtered_keys": list(filtered_trans_data.keys()),
                        "error": str(e),
                        "error_type": type(e).__name__
                    },
                    exc_info=True
                )
                warnings.append(f"Ошибка при создании транзакции: {str(e)}")
                continue
        
        # Коммитим батч
        self.db.commit()
        
        return created_count, skipped_count, warnings
    
    def _check_duplicates_batch(self, batch: List[Dict]) -> List[Transaction]:
        """
        Батчевая проверка дубликатов для списка транзакций
        """
        if not batch:
            return []
        
        # Формируем условия для поиска дубликатов
        conditions = []
        
        for trans_data in batch:
            date = trans_data.get("transaction_date")
            quantity = trans_data.get("quantity")
            card_number = trans_data.get("card_number")
            azs_number = trans_data.get("azs_number")
            product = trans_data.get("product")
            
            if not date or not quantity:
                continue
            
            # Преобразуем номер карты в строку, если он передан как число
            if card_number:
                card_number = str(card_number).strip() if card_number else None
            
            # Формируем условие для этой транзакции
            condition = and_(
                Transaction.transaction_date == date,
                Transaction.quantity == quantity
            )
            
            if card_number:
                condition = and_(condition, Transaction.card_number == card_number)
            else:
                condition = and_(condition, Transaction.card_number.is_(None))
            
            if azs_number:
                condition = and_(condition, Transaction.azs_number == azs_number)
            else:
                condition = and_(condition, Transaction.azs_number.is_(None))
            
            if product:
                condition = and_(condition, Transaction.product == product)
            else:
                condition = and_(condition, Transaction.product.is_(None))
            
            conditions.append(condition)
        
        if not conditions:
            return []
        
        # Объединяем условия через OR
        combined_condition = or_(*conditions)
        
        # Выполняем один запрос для всех транзакций
        existing = self.db.query(Transaction).filter(combined_condition).all()
        
        return existing
    
    def _is_duplicate(self, trans_data: Dict, existing_transactions: List[Transaction]) -> bool:
        """
        Проверка, является ли транзакция дубликатом
        """
        date = trans_data.get("transaction_date")
        quantity = trans_data.get("quantity")
        card_number = trans_data.get("card_number")
        azs_number = trans_data.get("azs_number")
        product = trans_data.get("product")
        
        # Преобразуем номер карты в строку, если он передан как число
        if card_number:
            card_number = str(card_number).strip() if card_number else None
        
        for existing in existing_transactions:
            if (existing.transaction_date == date and
                existing.quantity == quantity and
                (existing.card_number == card_number if card_number else existing.card_number is None) and
                (existing.azs_number == azs_number if azs_number else existing.azs_number is None) and
                (existing.product == product if product else existing.product is None)):
                return True
        
        return False
    
    def _process_vehicles_batch(
        self, 
        transactions: List[Dict],
        warnings: List[str]
    ) -> Dict[str, int]:
        """
        Батчевая обработка транспортных средств
        Возвращает словарь {original_name: vehicle_id}
        Собирает предупреждения о возможных дублях
        """
        vehicles_map = {}
        
        # Собираем все уникальные названия ТС
        vehicle_names = set()
        for trans_data in transactions:
            vehicle_name = trans_data.get("vehicle")
            if vehicle_name:
                vehicle_data = app_services.parse_vehicle_field(vehicle_name)
                vehicle_names.add(vehicle_data["original"])
        
        if not vehicle_names:
            return vehicles_map
        
        # Загружаем существующие ТС одним запросом
        existing_vehicles = self.db.query(Vehicle).filter(
            Vehicle.original_name.in_(vehicle_names)
        ).all()
        
        for vehicle in existing_vehicles:
            vehicles_map[vehicle.original_name] = vehicle.id
        
        # Создаем новые ТС для тех, которых нет
        missing_names = vehicle_names - set(vehicles_map.keys())
        
        for vehicle_name in missing_names:
            # Находим первую транзакцию с этим ТС для получения данных
            for trans_data in transactions:
                if trans_data.get("vehicle"):
                    vehicle_data = app_services.parse_vehicle_field(trans_data["vehicle"])
                    if vehicle_data["original"] == vehicle_name:
                        vehicle, vehicle_warnings = app_services.get_or_create_vehicle(
                            self.db,
                            original_name=vehicle_data["original"],
                            garage_number=vehicle_data.get("garage_number"),
                            license_plate=vehicle_data.get("license_plate")
                        )
                        vehicles_map[vehicle_name] = vehicle.id
                        # Собираем предупреждения
                        warnings.extend(vehicle_warnings)
                        break
        
        return vehicles_map
    
    def _process_cards_batch(
        self,
        transactions: List[Dict],
        vehicles_map: Dict[str, int],
        warnings: List[str]
    ) -> Dict[str, int]:
        """
        Батчевая обработка топливных карт
        Возвращает словарь {card_number: card_id}
        Собирает предупреждения о возможных дублях
        """
        cards_map = {}
        card_numbers = set()
        
        # Собираем все уникальные номера карт
        for trans_data in transactions:
            card_number = trans_data.get("card_number")
            if card_number:
                # Преобразуем номер карты в строку, если он передан как число
                card_number = str(card_number).strip() if card_number else None
                if card_number:
                    card_numbers.add(card_number)
        
        if not card_numbers:
            return cards_map
        
        # Загружаем существующие карты одним запросом
        existing_cards = self.db.query(FuelCard).filter(
            FuelCard.card_number.in_(card_numbers)
        ).all()
        
        for card in existing_cards:
            # Нормализуем номер карты из БД для использования как ключа
            card_number_normalized = str(card.card_number).strip() if card.card_number else None
            if card_number_normalized:
                cards_map[card_number_normalized] = card.id
                # Также добавляем оригинальный формат для обратной совместимости
                if card.card_number != card_number_normalized:
                    cards_map[card.card_number] = card.id
        
        # Создаем новые карты для тех, которых нет
        missing_numbers = card_numbers - set(cards_map.keys())
        
        for card_number in missing_numbers:
            # Находим первую транзакцию с этой картой
            for trans_data in transactions:
                trans_card_number = trans_data.get("card_number")
                # Преобразуем номер карты в строку для сравнения
                if trans_card_number:
                    trans_card_number = str(trans_card_number).strip()
                else:
                    trans_card_number = None
                
                # Сравниваем нормализованные номера карт
                if trans_card_number and str(card_number).strip() == trans_card_number:
                    provider_id = trans_data.get("provider_id")
                    vehicle_name = trans_data.get("vehicle")
                    vehicle_id = None
                    
                    if vehicle_name:
                        vehicle_data = app_services.parse_vehicle_field(vehicle_name)
                        vehicle_id = vehicles_map.get(vehicle_data["original"])
                    
                    # Преобразуем номер карты в строку перед передачей
                    card_number_str = str(card_number).strip() if card_number else None
                    if not card_number_str:
                        continue
                    
                    try:
                        card, card_warnings = app_services.get_or_create_fuel_card(
                            self.db,
                            card_number_str,
                            provider_id,
                            vehicle_id
                        )
                        # Используем card_number_str как ключ для согласованности
                        cards_map[card_number_str] = card.id
                        # Также добавляем оригинальный card_number для обратной совместимости
                        if card_number != card_number_str:
                            cards_map[card_number] = card.id
                        # Собираем предупреждения
                        warnings.extend(card_warnings)
                        break
                    except Exception as e:
                        error_msg = str(e)
                        # Если ошибка содержит номер карты в кавычках, извлекаем его для более понятного сообщения
                        card_in_error = re.search(r"'(\d+)'", error_msg)
                        if card_in_error:
                            found_card = card_in_error.group(1)
                            if found_card != card_number_str:
                                warnings.append(
                                    f"Ошибка при обработке карты {card_number_str}: "
                                    f"обнаружен конфликт с картой '{found_card}'. "
                                    f"Карта будет пропущена при создании транзакций."
                                )
                            else:
                                warnings.append(f"Ошибка при обработке карты {card_number_str}: {error_msg}")
                        else:
                            warnings.append(f"Ошибка при обработке карты {card_number_str}: {error_msg}")
                        
                        logger.error(
                            "Ошибка при создании/получении карты",
                            extra={
                                "card_number": card_number_str,
                                "card_number_original": card_number,
                                "error": error_msg,
                                "error_type": type(e).__name__
                            },
                            exc_info=True
                        )
                        # Продолжаем обработку других карт
                        continue
        
        return cards_map
    
    def process_transactions_batch(
        self,
        transactions: List[Dict],
        provider_id: Optional[int] = None
    ) -> Tuple[int, int]:
        """
        Обработка транзакций батчами (алиас для create_transactions для совместимости)
        
        Args:
            transactions: Список словарей с данными транзакций
            provider_id: ID провайдера (используется для установки provider_id в транзакциях)
        
        Returns:
            Tuple: (создано, пропущено)
        """
        # Устанавливаем provider_id для всех транзакций, если указан
        if provider_id:
            for trans_data in transactions:
                if 'provider_id' not in trans_data or trans_data['provider_id'] is None:
                    trans_data['provider_id'] = provider_id
        
        # Преобразуем номер карты в строку, если он передан как число
        for trans_data in transactions:
            card_number = trans_data.get("card_number")
            if card_number is not None:
                # Преобразуем в строку и удаляем пробелы
                trans_data["card_number"] = str(card_number).strip() if card_number else None
        
        created_count, skipped_count, warnings = self.create_transactions(transactions)
        
        return created_count, skipped_count
