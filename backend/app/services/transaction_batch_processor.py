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
from app.services.gas_station_service import GasStationService
from app.services.fuel_type_service import FuelTypeService
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
    
    # Значения валют, которые не являются видами топлива и должны быть отфильтрованы
    INVALID_CURRENCY_VALUES = {"рубли", "rub", "rubles", "ruble", "₽", "р.", "руб", "рублей"}
    
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
        
        # Нормализуем данные для всех транзакций заранее
        for trans_data in transactions:
            # Нормализуем номер карты
            card_number = trans_data.get("card_number")
            if card_number is not None:
                trans_data["card_number"] = str(card_number).strip() if card_number else None
            
            # Нормализуем номер АЗС
            azs_number = trans_data.get("azs_number")
            if azs_number is not None:
                azs_number_normalized = str(azs_number).strip() if azs_number else None
                trans_data["azs_number"] = azs_number_normalized
            
            # Нормализуем продукт (убираем пробелы в начале/конце)
            product = trans_data.get("product")
            if product is not None:
                product_normalized = str(product).strip() if product else None
                trans_data["product"] = product_normalized
        
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
        gas_stations_map = self._process_gas_stations_batch(new_transactions, warnings)
        # Регистрируем виды топлива автоматически
        self._process_fuel_types_batch(new_transactions, warnings)
        
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
            
            # Получаем gas_station_id из карты
            # Приоритет у номера АЗС, а не у original_name
            # Это важно, чтобы транзакции с одним номером АЗС, но разными original_name связывались с одной АЗС
            gas_station_id = None
            azs_number = trans_data.get("azs_number")
            # azs_number уже нормализован в начале create_transactions
            
            # Сначала ищем по номеру АЗС (приоритет)
            if azs_number:
                gas_station_id = gas_stations_map.get(azs_number)
            
            # Fallback: если не нашли по номеру, ищем по original_name
            if not gas_station_id:
                azs_original_name = trans_data.get("azs_original_name")
                if azs_original_name:
                    # Нормализуем оригинальное название (убираем пробелы в начале/конце)
                    azs_original_name_normalized = str(azs_original_name).strip() if azs_original_name else None
                    if azs_original_name_normalized:
                        # Используем оригинальное название как ключ
                        gas_station_id = gas_stations_map.get(azs_original_name_normalized)
            
            trans_data["gas_station_id"] = gas_station_id
            
            # Удаляем поля, которых нет в модели Transaction
            # Оставляем только те поля, которые есть в модели
            transaction_fields = {
                "transaction_date", "card_number", "vehicle", "vehicle_id", "azs_number", "gas_station_id",
                "provider_id", "supplier", "region", "settlement", "location", "location_code",
                "product", "operation_type", "quantity", "currency", "exchange_rate",
                "price", "price_with_discount", "amount", "amount_with_discount",
                "discount_percent", "discount_amount", "vat_rate", "vat_amount",
                "source_file", "organization"
            }
            
            # Фильтруем только допустимые поля
            filtered_trans_data = {k: v for k, v in trans_data.items() if k in transaction_fields}
            
            # Логируем значение product перед сохранением (только первые несколько для отладки)
            if created_count < 5 and filtered_trans_data.get("product"):
                import sys
                product_value = filtered_trans_data.get("product")
                logger.debug("Сохраняем product в БД", extra={"product_value": product_value})
                logger.info("Сохраняем product в БД", extra={
                    "product": product_value,
                    "transaction_date": str(filtered_trans_data.get("transaction_date")),
                    "event_type": "transaction_creation",
                    "event_category": "fuel_mapping"
                })
            
            # Проверяем обязательные поля
            if not filtered_trans_data.get("transaction_date"):
                warnings.append("Пропущена транзакция: отсутствует дата")
                continue
            if not filtered_trans_data.get("quantity"):
                warnings.append("Пропущена транзакция: отсутствует количество")
                continue
            
            # Фильтруем транзакции, где product является валютой (не валидный вид топлива)
            product = filtered_trans_data.get("product")
            if product:
                product_lower = str(product).strip().lower()
                if product_lower in self.INVALID_CURRENCY_VALUES:
                    warnings.append(f"Пропущена транзакция: product='{product}' является валютой, а не видом топлива")
                    skipped_count += 1
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
            
            # Нормализуем данные для проверки дубликатов
            # (данные уже должны быть нормализованы в create_transactions, но на всякий случай)
            if card_number:
                card_number = str(card_number).strip() if card_number else None
            
            if azs_number:
                azs_number = str(azs_number).strip() if azs_number else None
            
            if product:
                product = str(product).strip() if product else None
            
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
        
        # Нормализуем данные для проверки дубликатов
        # (данные уже должны быть нормализованы в create_transactions, но на всякий случай)
        if card_number:
            card_number = str(card_number).strip() if card_number else None
        
        if azs_number:
            azs_number = str(azs_number).strip() if azs_number else None
        
        if product:
            product = str(product).strip() if product else None
        
        for existing in existing_transactions:
            # Нормализуем значения из БД для сравнения
            existing_card = str(existing.card_number).strip() if existing.card_number else None
            existing_azs = str(existing.azs_number).strip() if existing.azs_number else None
            existing_product = str(existing.product).strip() if existing.product else None
            
            if (existing.transaction_date == date and
                existing.quantity == quantity and
                (existing_card == card_number if card_number else existing_card is None) and
                (existing_azs == azs_number if azs_number else existing_azs is None) and
                (existing_product == product if product else existing_product is None)):
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
    
    def _process_gas_stations_batch(
        self,
        transactions: List[Dict],
        warnings: List[str]
    ) -> Dict[str, int]:
        """
        Батчевая обработка автозаправочных станций
        Возвращает словарь {original_name: gas_station_id}
        Собирает предупреждения о возможных дублях
        """
        gas_stations_map = {}
        gas_station_service = GasStationService(self.db)
        
        # Собираем все уникальные номера АЗС (приоритет номеру АЗС, а не original_name)
        # Это важно, чтобы для одного номера АЗС не создавались разные записи
        azs_numbers_set = set()
        azs_number_to_original_names = {}  # Словарь: номер АЗС -> список original_name
        
        for trans_data in transactions:
            azs_number = trans_data.get("azs_number")
            azs_original_name = trans_data.get("azs_original_name")
            
            # Приоритет у номера АЗС
            if azs_number and str(azs_number).strip():
                azs_num_normalized = str(azs_number).strip()
                azs_numbers_set.add(azs_num_normalized)
                # Сохраняем связь номера с original_name
                if azs_num_normalized not in azs_number_to_original_names:
                    azs_number_to_original_names[azs_num_normalized] = []
                if azs_original_name and str(azs_original_name).strip():
                    original_name_normalized = str(azs_original_name).strip()
                    if original_name_normalized not in azs_number_to_original_names[azs_num_normalized]:
                        azs_number_to_original_names[azs_num_normalized].append(original_name_normalized)
            # Если номера нет, но есть original_name, используем его
            elif azs_original_name and str(azs_original_name).strip():
                original_name_normalized = str(azs_original_name).strip()
                azs_numbers_set.add(original_name_normalized)
                # Пытаемся извлечь номер из original_name для группировки
                # Это важно для случаев типа "контроллер КАЗС10 АИ-92", где номер "10" извлекается из названия
                extracted_num = app_services.extract_azs_number(original_name_normalized)
                if extracted_num and extracted_num.strip() and extracted_num != original_name_normalized:
                    # Если номер извлечен и отличается от original_name, добавляем его в группировку
                    extracted_num_normalized = extracted_num.strip()
                    if extracted_num_normalized not in azs_number_to_original_names:
                        azs_number_to_original_names[extracted_num_normalized] = []
                    if original_name_normalized not in azs_number_to_original_names[extracted_num_normalized]:
                        azs_number_to_original_names[extracted_num_normalized].append(original_name_normalized)
                    # НЕ добавляем извлеченный номер в azs_numbers_set
                    # Это позволит обработать original_name отдельно, а не группировать по номеру
                    # Вместо этого обработаем original_name напрямую
            # Если и номер отсутствует, но есть location или settlement, создаем АЗС по адресу
            elif trans_data.get("location") or trans_data.get("settlement"):
                location_name = trans_data.get("location") or trans_data.get("settlement") or "Неизвестная АЗС"
                azs_numbers_set.add(location_name.strip())
        
        if not azs_numbers_set:
            return gas_stations_map
        
            # Обрабатываем каждую АЗС
        # Сначала обрабатываем все original_name (не по номеру), чтобы они обрабатывались независимо
        processed_keys = set()
        for azs_key in azs_numbers_set:
            # Пропускаем номера АЗС - они будут обработаны отдельно через original_name
            if azs_key in azs_number_to_original_names:
                # Это номер АЗС - обрабатываем каждый original_name из списка отдельно
                azs_number = azs_key
                original_names = azs_number_to_original_names[azs_key]
                
                for original_name_item in original_names:
                    if original_name_item in processed_keys:
                        continue  # Уже обработано
                    
                    processed_keys.add(original_name_item)
                    gas_station_name = original_name_item
                    # Обрабатываем этот original_name с номером АЗС
                    self._process_single_gas_station(
                        gas_stations_map, gas_station_service, warnings,
                        azs_key=original_name_item,
                        azs_number=azs_number,
                        gas_station_name=gas_station_name,
                        azs_number_to_original_names=azs_number_to_original_names,
                        transactions=transactions
                    )
                continue  # Пропускаем обработку самого номера
            
            # Это original_name или location (когда номера нет)
            if azs_key in processed_keys:
                continue
            processed_keys.add(azs_key)
            
            gas_station_name = azs_key
            # Пытаемся извлечь номер из названия
            extracted_number = app_services.extract_azs_number(azs_key)
            # Если извлеченный номер отличается от исходной строки, используем его
            # (иначе это означает, что номера нет, и extracted_number равен azs_key)
            if extracted_number and extracted_number.strip() and extracted_number != azs_key:
                azs_number = extracted_number.strip()
            else:
                azs_number = None
            
            # Обрабатываем этот original_name
            self._process_single_gas_station(
                gas_stations_map, gas_station_service, warnings,
                azs_key=azs_key,
                azs_number=azs_number,
                gas_station_name=gas_station_name,
                azs_number_to_original_names=azs_number_to_original_names,
                transactions=transactions
            )
        
        return gas_stations_map
    
    def _process_single_gas_station(
        self,
        gas_stations_map: Dict[str, int],
        gas_station_service,
        warnings: List[str],
        azs_key: str,
        azs_number: Optional[str],
        gas_station_name: str,
        azs_number_to_original_names: Dict[str, List[str]],
        transactions: List[Dict]
    ) -> None:
        """
        Обработка одной АЗС
        """
        # Находим первую транзакцию с этой АЗС для получения данных
        location = None
        region = None
        settlement = None
        latitude = None
        longitude = None
        provider_id = None
        
        for trans_data in transactions:
            trans_azs_num = trans_data.get("azs_number")
            trans_azs_original = trans_data.get("azs_original_name", "").strip()
            
            # Проверяем совпадение по original_name (приоритет)
            matches = False
            if gas_station_name and trans_azs_original == gas_station_name:
                matches = True
            # Также проверяем по номеру АЗС
            elif azs_number and trans_azs_num and str(trans_azs_num).strip() == azs_number:
                matches = True
            # Также проверяем по azs_key
            elif trans_azs_original == azs_key:
                matches = True
            
            if matches:
                # Берем данные из транзакции, если они есть
                if trans_data.get("location"):
                    location = trans_data.get("location")
                if trans_data.get("region"):
                    region = trans_data.get("region")
                if trans_data.get("settlement"):
                    settlement = trans_data.get("settlement")
                if trans_data.get("azs_latitude"):
                    latitude = trans_data.get("azs_latitude")
                if trans_data.get("azs_longitude"):
                    longitude = trans_data.get("azs_longitude")
                if trans_data.get("provider_id"):
                    provider_id = trans_data.get("provider_id")
                # Если номер АЗС не был установлен, но есть в транзакции, устанавливаем его
                if not azs_number and trans_azs_num:
                    azs_number = str(trans_azs_num).strip()
                break
        
        # Если region, settlement или location не найдены в первой транзакции, ищем в других транзакциях с этой АЗС
        if not region or not settlement or not location:
            for trans_data in transactions:
                trans_azs_num = trans_data.get("azs_number")
                trans_azs_original = trans_data.get("azs_original_name", "").strip()
                
                # Проверяем совпадение по original_name (приоритет)
                matches = False
                if gas_station_name and trans_azs_original == gas_station_name:
                    matches = True
                elif azs_number and trans_azs_num and str(trans_azs_num).strip() == azs_number:
                    matches = True
                elif trans_azs_original == azs_key:
                    matches = True
                
                if matches:
                    # Используем данные из транзакции, если они более полные
                    if not region and trans_data.get("region"):
                        region = trans_data.get("region")
                    if not settlement and trans_data.get("settlement"):
                        settlement = trans_data.get("settlement")
                    if not location and trans_data.get("location"):
                        location = trans_data.get("location")
                    if not provider_id and trans_data.get("provider_id"):
                        provider_id = trans_data.get("provider_id")
                    # Если все данные найдены, можно прервать поиск
                    if region and settlement and location and provider_id:
                        break
        
        # Если provider_id все еще не найден, ищем в других транзакциях с этой АЗС
        if not provider_id:
            for trans_data in transactions:
                trans_azs_num = trans_data.get("azs_number")
                trans_azs_original = trans_data.get("azs_original_name", "").strip()
                
                # Проверяем совпадение по original_name (приоритет)
                matches = False
                if gas_station_name and trans_azs_original == gas_station_name:
                    matches = True
                elif azs_number and trans_azs_num and str(trans_azs_num).strip() == azs_number:
                    matches = True
                elif trans_azs_original == azs_key:
                    matches = True
                
                if matches and trans_data.get("provider_id"):
                    provider_id = trans_data.get("provider_id")
                    break
        
        # Убеждаемся, что gas_station_name установлен (не должен быть None)
        if not gas_station_name:
            gas_station_name = azs_key or "Неизвестная АЗС"
        
        try:
            # Логируем данные перед созданием/обновлением АЗС
            logger.debug("Создание/обновление АЗС", extra={
                "gas_station_name": gas_station_name,
                "azs_number": azs_number,
                "azs_key": azs_key,
                "region": region,
                "settlement": settlement,
                "location": location,
                "latitude": latitude,
                "longitude": longitude,
                "provider_id": provider_id
            })
            
            gas_station, gas_station_warnings = gas_station_service.get_or_create_gas_station(
                original_name=gas_station_name,
                azs_number=azs_number if azs_number and azs_number.strip() else None,
                location=location,
                region=region,
                settlement=settlement,
                latitude=latitude,
                longitude=longitude,
                provider_id=provider_id
            )
            
            # Логируем результат
            logger.info("АЗС создана/обновлена", extra={
                "gas_station_id": gas_station.id,
                "gas_station_name": gas_station.original_name,
                "region": gas_station.region,
                "settlement": gas_station.settlement,
                "location": gas_station.location,
                "azs_number": gas_station.azs_number
            })
            # Добавляем в карту по original_name (для обратной совместимости)
            gas_stations_map[gas_station_name] = gas_station.id
            # Также добавляем все original_name из списка, если они есть
            # Это важно, чтобы транзакции с разными original_name, но одним номером АЗС связывались правильно
            if azs_number and azs_number in azs_number_to_original_names:
                for orig_name in azs_number_to_original_names[azs_number]:
                    gas_stations_map[orig_name] = gas_station.id
                    logger.debug("Добавлен original_name в gas_stations_map", extra={
                        "original_name": orig_name,
                        "gas_station_id": gas_station.id,
                        "azs_number": azs_number
                    })
            # Также добавляем по azs_key, если это original_name (когда номера нет или номер извлечен из названия)
            # Это важно для случаев, когда из "контроллер КАЗС10 АИ-92" извлекается "10"
            if azs_key not in gas_stations_map:
                gas_stations_map[azs_key] = gas_station.id
                logger.debug("Добавлен azs_key в gas_stations_map", extra={
                    "azs_key": azs_key,
                    "gas_station_id": gas_station.id,
                    "azs_number": azs_number
                })
            # Также добавляем original_name из самой АЗС (если она была найдена, а не создана)
            if gas_station.original_name and gas_station.original_name not in gas_stations_map:
                gas_stations_map[gas_station.original_name] = gas_station.id
            
            # Также добавляем номер АЗС как ключ (приоритет номеру АЗС)
            # Используем номер из самой АЗС, если он есть, иначе из транзакции
            azs_num_to_add = gas_station.azs_number or azs_number
            if azs_num_to_add:
                # Нормализуем номер АЗС (убираем пробелы, приводим к строке)
                azs_num_normalized = str(azs_num_to_add).strip()
                if azs_num_normalized:
                    gas_stations_map[azs_num_normalized] = gas_station.id
                    # Также добавляем без нормализации для обратной совместимости
                    if azs_num_normalized != str(azs_num_to_add):
                        gas_stations_map[str(azs_num_to_add)] = gas_station.id
            # Собираем предупреждения
            warnings.extend(gas_station_warnings)
        except Exception as e:
            error_msg = str(e)
            warnings.append(f"Ошибка при обработке АЗС '{gas_station_name}': {error_msg}")
            logger.error(
                "Ошибка при создании/получении АЗС",
                extra={
                    "gas_station_name": gas_station_name,
                    "azs_number": azs_number,
                    "error": error_msg,
                    "error_type": type(e).__name__
                },
                exc_info=True
            )
            # Продолжаем обработку других АЗС
            return
    
    def _process_fuel_types_batch(
        self,
        transactions: List[Dict],
        warnings: List[str]
    ) -> None:
        """
        Батчевая обработка видов топлива
        Автоматически регистрирует виды топлива в справочнике
        """
        fuel_type_service = FuelTypeService(self.db)
        
        # Собираем все уникальные значения product (исключая валюты)
        fuel_types = set()
        for trans_data in transactions:
            product = trans_data.get("product")
            if product and str(product).strip():
                product_normalized = str(product).strip()
                product_lower = product_normalized.lower()
                # Пропускаем валюты (не валидные виды топлива)
                if product_lower not in self.INVALID_CURRENCY_VALUES:
                    fuel_types.add(product_normalized)
        
        if not fuel_types:
            return
        
        # Регистрируем каждый вид топлива
        for fuel_type_name in fuel_types:
            try:
                # Используем название из транзакции как original_name
                # normalized_name будет равен original_name (можно будет отредактировать вручную позже)
                fuel_type, fuel_type_warnings = fuel_type_service.get_or_create_fuel_type(
                    original_name=fuel_type_name,
                    normalized_name=fuel_type_name
                )
                # Собираем предупреждения (если есть)
                warnings.extend(fuel_type_warnings)
                
                logger.debug(
                    "Вид топлива зарегистрирован/найден",
                    extra={
                        "fuel_type_id": fuel_type.id,
                        "original_name": fuel_type.original_name,
                        "normalized_name": fuel_type.normalized_name,
                        "event_type": "fuel_type_registration",
                        "event_category": "auto_registration"
                    }
                )
            except Exception as e:
                error_msg = str(e)
                warnings.append(f"Ошибка при регистрации вида топлива '{fuel_type_name}': {error_msg}")
                logger.error(
                    "Ошибка при регистрации вида топлива",
                    extra={
                        "fuel_type_name": fuel_type_name,
                        "error": error_msg,
                        "error_type": type(e).__name__,
                        "event_type": "fuel_type_registration",
                        "event_category": "error"
                    },
                    exc_info=True
                )
                # Продолжаем обработку других видов топлива
                continue
    
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
        
        # Нормализуем данные для всех транзакций
        # (create_transactions тоже нормализует, но нормализуем здесь для согласованности)
        for trans_data in transactions:
            # Нормализуем номер карты
            card_number = trans_data.get("card_number")
            if card_number is not None:
                trans_data["card_number"] = str(card_number).strip() if card_number else None
            
            # Нормализуем номер АЗС
            azs_number = trans_data.get("azs_number")
            if azs_number is not None:
                trans_data["azs_number"] = str(azs_number).strip() if azs_number else None
            
            # Нормализуем продукт
            product = trans_data.get("product")
            if product is not None:
                trans_data["product"] = str(product).strip() if product else None
        
        created_count, skipped_count, warnings = self.create_transactions(transactions)
        
        return created_count, skipped_count
