"""
Сервис для эмуляции API ППР
Предоставляет эндпоинты, идентичные API ППР, для интеграции с 1С
"""
from sqlalchemy.orm import Session
from typing import Optional, List, Dict, Any
from datetime import datetime
from decimal import Decimal
from app.repositories.transaction_repository import TransactionRepository
from app.models import Transaction, Provider, FuelCard, User
from app.logger import logger
from app.auth import verify_password, get_user_by_username


class PPRAPIService:
    """
    Сервис для эмуляции API ППР
    """
    
    def __init__(self, db: Session):
        self.transaction_repo = TransactionRepository(db)
        self.db = db
    
    def authenticate(self, username: str, password: str) -> Optional[Dict[str, Any]]:
        """
        Аутентификация пользователя
        
        Args:
            username: Имя пользователя
            password: Пароль
        
        Returns:
            Словарь с данными пользователя или None при ошибке
        """
        try:
            user = get_user_by_username(self.db, username)
            if not user:
                logger.warning(f"Пользователь не найден: {username}")
                return None
            
            if not verify_password(password, user.hashed_password):
                logger.warning(f"Неверный пароль для пользователя: {username}")
                return None
            
            if not user.is_active:
                logger.warning(f"Пользователь неактивен: {username}")
                return None
            
            logger.info(f"Успешная аутентификация пользователя: {username}")
            
            return {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "role": user.role,
                "is_active": user.is_active
            }
        except Exception as e:
            logger.error(f"Ошибка при аутентификации: {str(e)}", exc_info=True)
            return None
    
    def authenticate_by_api_key(self, api_key: str) -> Optional[Dict[str, Any]]:
        """
        Аутентификация по API ключу (как в ППР)
        
        Args:
            api_key: API ключ авторизации
        
        Returns:
            Словарь с данными провайдера или None при ошибке
        """
        try:
            # Ищем провайдера по API ключу в шаблонах
            from app.models import ProviderTemplate
            import sys
            
            # Логируем начало поиска
            logger.info(f"Поиск API ключа в шаблонах провайдеров: {api_key[:20]}...")
            print(f"\n{'='*80}", file=sys.stdout, flush=True)
            print(f"!!! PPR API: АУТЕНТИФИКАЦИЯ ПО API КЛЮЧУ !!!", file=sys.stdout, flush=True)
            print(f"API ключ (первые 20 символов): {api_key[:20]}...", file=sys.stdout, flush=True)
            
            # Ищем шаблон с таким ключом в connection_settings
            templates = self.db.query(ProviderTemplate).filter(
                ProviderTemplate.is_active == True
            ).all()
            
            print(f"Всего активных шаблонов для проверки: {len(templates)}", file=sys.stdout, flush=True)
            
            matches_found = []
            templates_checked = []
            
            for template in templates:
                provider = template.provider
                provider_name = provider.name if provider else "UNKNOWN"
                provider_id = provider.id if provider else None
                
                if template.connection_settings:
                    try:
                        import json
                        from app.utils.encryption import decrypt_connection_settings
                        
                        settings = json.loads(template.connection_settings) if isinstance(template.connection_settings, str) else template.connection_settings
                        
                        # Дешифруем настройки подключения, если они зашифрованы
                        settings = decrypt_connection_settings(settings)
                        
                        # Проверяем различные варианты названий ключа
                        # Приоритет: ppr_api_key (новое поле), затем api_key (для обратной совместимости)
                        template_key = (
                            settings.get("ppr_api_key") or  # Новое поле для PPR API ключа
                            settings.get("pprApiKey") or  # Альтернативное название
                            settings.get("api_key") or  # Для обратной совместимости (но только если это не GPN)
                            settings.get("api_token") or
                            settings.get("authorization_key") or
                            settings.get("key") or
                            settings.get("КлючАвторизации") or
                            ""
                        )
                        
                        # Для GPN провайдера api_key используется для самого API, поэтому не используем его для PPR
                        # Если это GPN и есть ppr_api_key, используем только его
                        provider_type = settings.get("provider_type", "").lower() if settings else ""
                        if provider_type in ["gpn", "gazprom-neft", "gazpromneft"]:
                            # Для GPN используем только ppr_api_key, игнорируем api_key
                            template_key = (
                                settings.get("ppr_api_key") or
                                settings.get("pprApiKey") or
                                ""
                            )
                        
                        # Логируем информацию о каждом шаблоне
                        if template_key:
                            # Логируем информацию о каждом шаблоне с ключом
                            keys_match = template_key == api_key
                            templates_checked.append({
                                "template_id": template.id,
                                "template_name": template.name,
                                "provider_id": provider_id,
                                "provider_name": provider_name,
                                "template_key_prefix": template_key[:20] if len(template_key) > 20 else template_key,
                                "template_key_length": len(template_key),
                                "api_key_prefix": api_key[:20] if len(api_key) > 20 else api_key,
                                "api_key_length": len(api_key),
                                "keys_match": keys_match
                            })
                            
                            # Логируем проверку шаблона
                            if keys_match:
                                print(f"\n✓ НАЙДЕНО СОВПАДЕНИЕ!", file=sys.stdout, flush=True)
                                print(f"  Шаблон ID: {template.id}", file=sys.stdout, flush=True)
                                print(f"  Шаблон название: {template.name}", file=sys.stdout, flush=True)
                                print(f"  Provider ID: {provider_id}", file=sys.stdout, flush=True)
                                print(f"  Provider название: {provider_name}", file=sys.stdout, flush=True)
                                print(f"  Provider код: {provider.code if provider else 'N/A'}", file=sys.stdout, flush=True)
                                print(f"  Provider активен: {provider.is_active if provider else False}", file=sys.stdout, flush=True)
                                
                                matches_found.append({
                                    "template_id": template.id,
                                    "template_name": template.name,
                                    "provider_id": provider_id,
                                    "provider_name": provider_name,
                                    "provider_code": provider.code if provider else None,
                                    "provider_active": provider.is_active if provider else False
                                })
                                
                                if provider and provider.is_active:
                                    logger.info(
                                        f"Успешная авторизация по API ключу для провайдера: {provider.name} (ID: {provider.id})",
                                        extra={
                                            "api_key_prefix": api_key[:20],
                                            "template_id": template.id,
                                            "template_name": template.name,
                                            "provider_id": provider.id,
                                            "provider_name": provider.name,
                                            "provider_code": provider.code
                                        }
                                    )
                                    print(f"\n✓ ПРОВАЙДЕР НАЙДЕН И АКТИВЕН: {provider_name} (ID: {provider_id})", file=sys.stdout, flush=True)
                                    print(f"{'='*80}\n", file=sys.stdout, flush=True)
                                    return {
                                        "provider_id": provider.id,
                                        "provider_name": provider.name,
                                        "provider_code": provider.code,
                                        "template_id": template.id,
                                        "auth_type": "api_key"
                                    }
                                else:
                                    print(f"⚠ Провайдер НЕ АКТИВЕН или не найден", file=sys.stdout, flush=True)
                    except (json.JSONDecodeError, AttributeError, TypeError) as e:
                        logger.debug(f"Ошибка при парсинге connection_settings шаблона {template.id}: {e}")
                        templates_checked.append({
                            "template_id": template.id,
                            "template_name": template.name,
                            "provider_id": provider_id,
                            "provider_name": provider_name,
                            "error": str(e),
                            "has_parse_error": True
                        })
                        continue
                else:
                    # Шаблон не имеет connection_settings
                    templates_checked.append({
                        "template_id": template.id,
                        "template_name": template.name,
                        "provider_id": provider_id,
                        "provider_name": provider_name,
                        "has_no_settings": True
                    })
            
            # Логируем все проверенные шаблоны
            if templates_checked:
                templates_with_keys = [t for t in templates_checked if t.get("template_key_length", 0) > 0]
                print(f"\n📋 Проверенные шаблоны ({len(templates_checked)} всего, {len(templates_with_keys)} с ключами):", file=sys.stdout, flush=True)
                for tpl_info in templates_checked:
                    if tpl_info.get("has_parse_error"):
                        print(f"  ⚠ ОШИБКА ПАРСИНГА - Template ID {tpl_info['template_id']} ({tpl_info['template_name']}) -> Provider ID {tpl_info['provider_id']} ({tpl_info['provider_name']})", file=sys.stdout, flush=True)
                        print(f"    Ошибка: {tpl_info.get('error', 'Unknown')}", file=sys.stdout, flush=True)
                    elif tpl_info.get("has_no_settings"):
                        print(f"  ⚠ НЕТ connection_settings - Template ID {tpl_info['template_id']} ({tpl_info['template_name']}) -> Provider ID {tpl_info['provider_id']} ({tpl_info['provider_name']})", file=sys.stdout, flush=True)
                    elif tpl_info.get("has_no_key"):
                        print(f"  ⚠ НЕТ КЛЮЧА - Template ID {tpl_info['template_id']} ({tpl_info['template_name']}) -> Provider ID {tpl_info['provider_id']} ({tpl_info['provider_name']})", file=sys.stdout, flush=True)
                    else:
                        match_status = "✓ СОВПАДЕНИЕ" if tpl_info.get("keys_match") else "✗ не совпадает"
                        print(f"  {match_status} - Template ID {tpl_info['template_id']} ({tpl_info['template_name']}) -> Provider ID {tpl_info['provider_id']} ({tpl_info['provider_name']})", file=sys.stdout, flush=True)
                        print(f"    Ключ в шаблоне: {tpl_info.get('template_key_prefix', '')}... (длина: {tpl_info.get('template_key_length', 0)})", file=sys.stdout, flush=True)
                        print(f"    Запрашиваемый ключ: {tpl_info.get('api_key_prefix', '')}... (длина: {tpl_info.get('api_key_length', 0)})", file=sys.stdout, flush=True)
            
            # Если найдено несколько совпадений, логируем их все
            if len(matches_found) > 1:
                logger.warning(
                    f"Найдено несколько шаблонов с одинаковым API ключом: {len(matches_found)}",
                    extra={
                        "api_key_prefix": api_key[:20],
                        "matches": matches_found
                    }
                )
                print(f"\n⚠ ВНИМАНИЕ: Найдено {len(matches_found)} шаблонов с одинаковым API ключом!", file=sys.stdout, flush=True)
                for match in matches_found:
                    print(f"  - Template ID {match['template_id']} ({match['template_name']}) -> Provider ID {match['provider_id']} ({match['provider_name']})", file=sys.stdout, flush=True)
            elif len(matches_found) == 0:
                logger.warning(
                    f"API ключ не найден ни в одном шаблоне: {api_key[:20]}...",
                    extra={
                        "api_key_prefix": api_key[:20],
                        "api_key_length": len(api_key),
                        "templates_checked": len(templates_checked),
                        "templates_with_keys": len([t for t in templates_checked if t.get("template_key_length", 0) > 0])
                    }
                )
                print(f"\n✗ API ключ НЕ НАЙДЕН ни в одном активном шаблоне", file=sys.stdout, flush=True)
                if templates_checked:
                    templates_with_keys = [t for t in templates_checked if t.get("template_key_length", 0) > 0]
                    print(f"  Найдено шаблонов с ключами: {len(templates_with_keys)} из {len(templates_checked)}", file=sys.stdout, flush=True)
                    if templates_with_keys:
                        print(f"  Проверьте, что ключ сохранен в шаблоне для нужного провайдера", file=sys.stdout, flush=True)
                else:
                    print(f"  НЕ НАЙДЕНО НИ ОДНОГО шаблона с API ключом!", file=sys.stdout, flush=True)
                    print(f"  Убедитесь, что API ключ сохранен в настройках шаблона провайдера", file=sys.stdout, flush=True)
            else:
                match = matches_found[0]
                if not match.get("provider_active"):
                    logger.warning(
                        f"API ключ найден, но провайдер не активен: {match['provider_name']} (ID: {match['provider_id']})",
                        extra={
                            "api_key_prefix": api_key[:20],
                            "template_id": match["template_id"],
                            "provider_id": match["provider_id"],
                            "provider_name": match["provider_name"]
                        }
                    )
                    print(f"\n✗ Провайдер найден, но НЕ АКТИВЕН: {match['provider_name']} (ID: {match['provider_id']})", file=sys.stdout, flush=True)
            
            print(f"{'='*80}\n", file=sys.stdout, flush=True)
            return None
            
        except Exception as e:
            logger.error(f"Ошибка при аутентификации по API ключу: {str(e)}", exc_info=True)
            import sys
            print(f"\n{'='*80}", file=sys.stdout, flush=True)
            print(f"!!! ОШИБКА ПРИ АУТЕНТИФИКАЦИИ ПО API КЛЮЧУ !!!", file=sys.stdout, flush=True)
            print(f"Error: {str(e)}", file=sys.stdout, flush=True)
            import traceback
            print(f"Traceback: {traceback.format_exc()}", file=sys.stdout, flush=True)
            print(f"{'='*80}\n", file=sys.stdout, flush=True)
            return None
    
    def get_transactions(
        self,
        provider_id: Optional[int] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        skip: int = 0,
        limit: int = 1000
    ) -> tuple[List[Dict[str, Any]], int]:
        """
        Получение транзакций в формате ППР
        
        Args:
            provider_id: ID провайдера
            date_from: Начальная дата периода
            date_to: Конечная дата периода
            skip: Количество записей для пропуска
            limit: Максимальное количество записей
        
        Returns:
            tuple: (список транзакций, общее количество)
        """
        # Логируем параметры запроса для диагностики
        import sys
        logger.info("PPR API Service: get_transactions", extra={
            "provider_id": provider_id,
            "date_from": str(date_from) if date_from else None,
            "date_from_type": type(date_from).__name__ if date_from else None,
            "date_to": str(date_to) if date_to else None,
            "date_to_type": type(date_to).__name__ if date_to else None,
            "skip": skip,
            "limit": limit,
            "event_type": "ppr_api",
            "event_category": "get_transactions"
        })
        
        logger.info(
            "PPR API Service: get_transactions",
            extra={
                "provider_id": provider_id,
                "date_from": date_from.isoformat() if date_from else None,
                "date_to": date_to.isoformat() if date_to else None,
                "skip": skip,
                "limit": limit
            }
        )
        
        # Получаем транзакции из репозитория
        transactions, total = self.transaction_repo.get_all(
            skip=skip,
            limit=limit,
            provider_id=provider_id,
            date_from=date_from,
            date_to=date_to,
            sort_by="transaction_date",
            sort_order="asc"
        )
        
        logger.info("PPR API Service: Результат запроса", extra={
            "transactions_count": len(transactions),
            "total": total,
            "first_transaction_id": transactions[0].id if transactions else None,
            "first_transaction_date": str(transactions[0].transaction_date) if transactions else None,
            "first_transaction_provider_id": transactions[0].provider_id if transactions else None,
            "event_type": "ppr_api",
            "event_category": "get_transactions_result"
        })
        
        # Преобразуем в формат ППР
        результат = []
        ошибки_преобразования = 0
        for transaction in transactions:
            try:
                транзакция_ппр = self._convert_transaction_to_ppr_format(transaction)
                результат.append(транзакция_ппр)
            except Exception as e:
                ошибки_преобразования += 1
                if ошибки_преобразования <= 3:  # Логируем только первые 3 ошибки
                    import sys
                    print(f"\n!!! Ошибка преобразования транзакции {transaction.id} !!!", file=sys.stdout, flush=True)
                    print(f"Error: {str(e)}", file=sys.stdout, flush=True)
                    print(f"Error type: {type(e).__name__}", file=sys.stdout, flush=True)
                    import traceback
                    print(f"Traceback: {traceback.format_exc()}", file=sys.stdout, flush=True)
                
                logger.error(
                    f"Ошибка при преобразовании транзакции {transaction.id} в формат ППР",
                    extra={
                        "transaction_id": transaction.id,
                        "error": str(e),
                        "error_type": type(e).__name__
                    },
                    exc_info=True
                )
                continue
        
        print(f"\n{'='*80}", file=sys.stdout, flush=True)
        print(f"!!! PPR API Service: Результат преобразования !!!", file=sys.stdout, flush=True)
        print(f"Исходных транзакций: {len(transactions)}", file=sys.stdout, flush=True)
        print(f"Успешно преобразовано: {len(результат)}", file=sys.stdout, flush=True)
        print(f"Ошибок преобразования: {ошибки_преобразования}", file=sys.stdout, flush=True)
        if результат:
            print(f"Первая преобразованная транзакция (ключи): {list(результат[0].keys()) if isinstance(результат[0], dict) else 'NOT DICT'}", file=sys.stdout, flush=True)
        print(f"{'='*80}\n", file=sys.stdout, flush=True)
        
        return результат, total
    
    def _get_average_price_for_product(
        self,
        provider_id: Optional[int],
        product: Optional[str],
        transaction_date: Optional[datetime]
    ) -> float:
        """
        Получает среднюю цену для данного вида топлива и провайдера
        
        Ищет транзакции с тем же провайдером и продуктом, у которых есть цена,
        и вычисляет среднюю цену за последние 90 дней.
        
        Args:
            provider_id: ID провайдера
            product: Название продукта (вид топлива)
            transaction_date: Дата транзакции (для ограничения периода поиска)
        
        Returns:
            Средняя цена за литр, или 0.0 если не найдено
        """
        if not provider_id or not product:
            return 0.0
        
        from datetime import timedelta
        from sqlalchemy import func, and_, or_
        from app.models import Transaction
        
        # Ищем транзакции за последние 90 дней с тем же провайдером и продуктом
        date_from = None
        if transaction_date:
            date_from = transaction_date - timedelta(days=90)
        
        query = self.db.query(Transaction).filter(
            Transaction.provider_id == provider_id,
            Transaction.product == product
        )
        
        if date_from:
            query = query.filter(Transaction.transaction_date >= date_from)
        
        # Ищем транзакции, у которых есть цена или сумма
        # Вычисляем цену из amount/quantity, если price отсутствует
        transactions = query.filter(
            or_(
                Transaction.price.isnot(None),
                Transaction.price_with_discount.isnot(None),
                and_(
                    Transaction.amount.isnot(None),
                    Transaction.quantity.isnot(None),
                    Transaction.quantity != 0
                )
            )
        ).limit(100).all()  # Берем последние 100 транзакций для вычисления средней цены
        
        if not transactions:
            return 0.0
        
        prices = []
        for t in transactions:
            # Приоритет: price_with_discount > price > amount/quantity
            if t.price_with_discount is not None and t.price_with_discount != 0:
                prices.append(float(t.price_with_discount))
            elif t.price is not None and t.price != 0:
                prices.append(float(t.price))
            elif t.amount is not None and t.quantity is not None and t.quantity != 0:
                try:
                    price = float(t.amount) / float(t.quantity)
                    if price > 0:
                        prices.append(price)
                except (ZeroDivisionError, TypeError):
                    continue
        
        if not prices:
            return 0.0
        
        # Вычисляем среднюю цену
        средняя_цена = sum(prices) / len(prices)
        return средняя_цена
    
    def _convert_transaction_to_ppr_format(self, transaction: Transaction) -> Dict[str, Any]:
        """
        Преобразует транзакцию в формат ППР
        
        Формат ППР для уатЗагрузкаПЦ:
        - Дата
        - Количество
        - МестоЗаправкиКод
        - МестоЗаправкиНаименование
        - НоменклатураОтчета
        - ПластиковаяКартаОтчета
        - ТСОтчета
        - Сумма
        - СтавкаНДС
        - СуммаНДС
        - Лат
        - Лон
        - Транзакция
        """
        from app.models import GasStation, Vehicle, FuelCard
        
        # Получаем данные АЗС, если есть
        gas_station_name = None
        if transaction.gas_station_id:
            gas_station = self.db.query(GasStation).filter(
                GasStation.id == transaction.gas_station_id
            ).first()
            if gas_station:
                gas_station_name = getattr(gas_station, 'name', None) or getattr(gas_station, 'original_name', None)
        
        # Формируем код места заправки
        место_заправки_код = transaction.location_code or transaction.azs_number or ""
        
        # Формируем наименование места заправки
        место_заправки_наименование = (
            gas_station_name or 
            transaction.location or 
            transaction.azs_number or 
            ""
        )
        
        # Формируем уникальный идентификатор транзакции
        транзакция_ид = f"{transaction.id}_{transaction.transaction_date.strftime('%Y%m%d%H%M%S')}"
        
        # Определяем количество (обязательное поле)
        количество = float(transaction.quantity) if transaction.quantity is not None else 0.0
        
        # Определяем сумму (приоритет: amount_with_discount > amount > вычисление из цены > средняя цена)
        сумма_float = 0.0
        
        # Проверяем amount_with_discount (используем Decimal сравнение)
        if transaction.amount_with_discount is not None:
            amount_wd = float(transaction.amount_with_discount)
            if amount_wd != 0:
                сумма_float = amount_wd
        
        # Проверяем amount
        if сумма_float == 0.0 and transaction.amount is not None:
            amount_val = float(transaction.amount)
            if amount_val != 0:
                сумма_float = amount_val
        
        # Вычисляем из цены и количества
        if сумма_float == 0.0 and количество > 0:
            if transaction.price_with_discount is not None:
                price_wd = float(transaction.price_with_discount)
                if price_wd != 0:
                    сумма_float = price_wd * количество
            
            if сумма_float == 0.0 and transaction.price is not None:
                price_val = float(transaction.price)
                if price_val != 0:
                    сумма_float = price_val * количество
            
            # Если все еще 0, вычисляем из средней цены за период для этого вида топлива
            if сумма_float == 0.0 and количество > 0:
                средняя_цена = self._get_average_price_for_product(
                    transaction.provider_id,
                    transaction.product,
                    transaction.transaction_date
                )
                if средняя_цена > 0:
                    сумма_float = средняя_цена * количество
                    if transaction.id <= 340025:
                        import sys
                        print(f"  Вычисляем из средней цены: {средняя_цена} * {количество} = {сумма_float}", file=sys.stdout, flush=True)
        
        # Если количество равно 0, но есть сумма и цена, вычисляем количество
        if количество == 0.0 and сумма_float > 0:
            if transaction.price_with_discount is not None and transaction.price_with_discount != 0:
                количество = сумма_float / float(transaction.price_with_discount)
            elif transaction.price is not None and transaction.price != 0:
                количество = сумма_float / float(transaction.price)
        
        # Получаем номер карты (из транзакции или из FuelCard)
        карта_номер = ""
        if transaction.card_number:
            # Убираем пробелы и лишние символы, но сохраняем формат
            карта_номер = str(transaction.card_number).strip()
        
        # Если карта пустая, пробуем найти в справочнике по vehicle_id
        if not карта_номер and transaction.vehicle_id:
            vehicle = self.db.query(Vehicle).filter(Vehicle.id == transaction.vehicle_id).first()
            if vehicle:
                # Ищем активную карту для этого ТС
                from app.models import FuelCardAssignment
                assignment = self.db.query(FuelCardAssignment).filter(
                    FuelCardAssignment.vehicle_id == vehicle.id,
                    FuelCardAssignment.is_active == True
                ).order_by(FuelCardAssignment.assignment_start_date.desc()).first()
                if assignment and assignment.fuel_card:
                    карта_номер = str(assignment.fuel_card.card_number).strip()
        
        # Если все еще пустая, используем пустую строку (но это не должно быть)
        if not карта_номер:
            карта_номер = ""
        
        # Получаем информацию о ТС (из транзакции или из Vehicle)
        тс_наименование = transaction.vehicle or ""
        if not тс_наименование and transaction.vehicle_id:
            vehicle = self.db.query(Vehicle).filter(
                Vehicle.id == transaction.vehicle_id
            ).first()
            if vehicle:
                тс_наименование = vehicle.original_name or vehicle.name or ""
        
        # Проверяем обязательные поля перед формированием структуры
        if количество == 0.0:
            logger.warning(
                f"Транзакция {transaction.id}: количество равно 0",
                extra={
                    "transaction_id": transaction.id,
                    "quantity": transaction.quantity,
                    "amount": transaction.amount,
                    "price": transaction.price
                }
            )
        
        if not карта_номер:
            logger.warning(
                f"Транзакция {transaction.id}: номер карты пустой",
                extra={
                    "transaction_id": transaction.id,
                    "card_number": transaction.card_number,
                    "vehicle_id": transaction.vehicle_id
                }
            )
        
        if сумма_float == 0.0:
            logger.warning(
                f"Транзакция {transaction.id}: сумма равна 0",
                extra={
                    "transaction_id": transaction.id,
                    "amount": transaction.amount,
                    "amount_with_discount": transaction.amount_with_discount,
                    "price": transaction.price,
                    "price_with_discount": transaction.price_with_discount,
                    "quantity": количество
                }
            )
        
        # Формируем структуру для ППР
        # Важно: используем русские названия полей, как ожидает модуль 1С
        структура_ппр = {
            "Дата": transaction.transaction_date.isoformat() if transaction.transaction_date else "",
            "Количество": количество,
            "МестоЗаправкиКод": место_заправки_код,
            "МестоЗаправкиНаименование": место_заправки_наименование,
            "НоменклатураОтчета": transaction.product or "",
            "ПластиковаяКартаОтчета": карта_номер,
            "ТСОтчета": тс_наименование,
            "Сумма": сумма_float,
            "СтавкаНДС": float(transaction.vat_rate) if transaction.vat_rate else None,
            "СуммаНДС": float(transaction.vat_amount) if transaction.vat_amount else 0.0,
            "Лат": None,
            "Лон": None,
            "Транзакция": транзакция_ид
        }
        
        # Логируем первые несколько транзакций для диагностики
        if transaction.id <= 340025:  # Первые несколько транзакций
            import sys
            print(f"\n{'='*80}", file=sys.stdout, flush=True)
            print(f"!!! ДИАГНОСТИКА: ПРЕОБРАЗОВАННАЯ ТРАНЗАКЦИЯ {transaction.id} !!!", file=sys.stdout, flush=True)
            print(f"Исходные данные:", file=sys.stdout, flush=True)
            print(f"  transaction.quantity: {transaction.quantity} (type: {type(transaction.quantity).__name__})", file=sys.stdout, flush=True)
            print(f"  transaction.amount: {transaction.amount} (type: {type(transaction.amount).__name__})", file=sys.stdout, flush=True)
            print(f"  transaction.amount_with_discount: {transaction.amount_with_discount} (type: {type(transaction.amount_with_discount).__name__})", file=sys.stdout, flush=True)
            print(f"  transaction.price: {transaction.price} (type: {type(transaction.price).__name__})", file=sys.stdout, flush=True)
            print(f"  transaction.card_number: '{transaction.card_number}' (type: {type(transaction.card_number).__name__})", file=sys.stdout, flush=True)
            print(f"  transaction.vehicle: '{transaction.vehicle}' (type: {type(transaction.vehicle).__name__})", file=sys.stdout, flush=True)
            print(f"  transaction.vehicle_id: {transaction.vehicle_id}", file=sys.stdout, flush=True)
            print(f"Результат преобразования:", file=sys.stdout, flush=True)
            print(f"  Количество: {количество} (type: {type(количество).__name__})", file=sys.stdout, flush=True)
            print(f"  Сумма: {сумма_float} (type: {type(сумма_float).__name__})", file=sys.stdout, flush=True)
            print(f"  ПластиковаяКартаОтчета: '{карта_номер}' (type: {type(карта_номер).__name__}, len: {len(карта_номер)})", file=sys.stdout, flush=True)
            print(f"  ТСОтчета: '{тс_наименование}' (type: {type(тс_наименование).__name__}, len: {len(тс_наименование)})", file=sys.stdout, flush=True)
            print(f"Полная структура_ппр:", file=sys.stdout, flush=True)
            for key, value in структура_ппр.items():
                print(f"  {key}: {value} (type: {type(value).__name__})", file=sys.stdout, flush=True)
            print(f"{'='*80}\n", file=sys.stdout, flush=True)
        
        return структура_ппр
    
    def _convert_transaction_to_english_format(self, transaction: Transaction) -> Dict[str, Any]:
        """
        Преобразует транзакцию в английский формат для модуля РАРУСППР
        
        ВАЖНО: В API ППР:
        - amount = количество (литры), НЕ сумма!
        - sum = сумма (цена * количество)
        - quantity отсутствует в API ППР
        
        Формат для модуля с полем transactions:
        - date: ISO format
        - cardNum: номер карты (строка)
        - TypeID: 1 = "Заправка", 0 = "Возврат"
        - fuel: вид топлива
        - amount: количество (литры) - в API ППР amount = количество!
        - sum: сумма (цена * количество)
        - price: цена за литр
        - address: адрес АЗС
        - stateNumber: государственный номер ТС
        """
        from app.models import GasStation
        
        # Определяем TypeID: 1 для "Заправка"/"Покупка", 0 для "Возврат"
        type_id = 1  # По умолчанию "Заправка"
        if transaction.operation_type:
            operation_lower = transaction.operation_type.lower()
            if "возврат" in operation_lower or "return" in operation_lower:
                type_id = 0
        
        # Форматируем дату в ISO формат
        date_str = ""
        if transaction.transaction_date:
            date_str = transaction.transaction_date.isoformat()
        
        # Форматируем номер карты как строку
        card_num = str(transaction.card_number) if transaction.card_number else ""
        
        # Получаем данные АЗС для адреса
        address = ""
        if transaction.gas_station_id:
            gas_station = self.db.query(GasStation).filter(
                GasStation.id == transaction.gas_station_id
            ).first()
            if gas_station:
                # Формируем адрес из доступных полей
                address_parts = []
                # Проверяем наличие атрибута address (может отсутствовать)
                if hasattr(gas_station, 'address') and gas_station.address:
                    address_parts.append(gas_station.address)
                elif hasattr(gas_station, 'location') and gas_station.location:
                    address_parts.append(gas_station.location)
                elif hasattr(gas_station, 'original_name') and gas_station.original_name:
                    address_parts.append(gas_station.original_name)
                if hasattr(gas_station, 'settlement') and gas_station.settlement:
                    address_parts.append(gas_station.settlement)
                if hasattr(gas_station, 'region') and gas_station.region:
                    address_parts.append(gas_station.region)
                address = ", ".join(address_parts) if address_parts else ""
        
        # Если адреса нет, используем данные из транзакции
        if not address:
            address_parts = []
            if transaction.location:
                address_parts.append(transaction.location)
            if transaction.settlement:
                address_parts.append(transaction.settlement)
            if transaction.region:
                address_parts.append(transaction.region)
            address = ", ".join(address_parts) if address_parts else ""
        
        # Получаем государственный номер из транспортного средства
        state_number = ""
        if transaction.vehicle_id:
            from app.models import Vehicle
            vehicle = self.db.query(Vehicle).filter(
                Vehicle.id == transaction.vehicle_id
            ).first()
            if vehicle:
                # Пробуем разные поля для гос. номера
                state_number = (
                    vehicle.license_plate or 
                    vehicle.garage_number or 
                    ""
                )
        
        # Если гос. номер не найден, пытаемся извлечь из поля vehicle
        if not state_number and transaction.vehicle:
            # Пытаемся найти гос. номер в строке (формат: "А123БВ 777" или "А123БВ777")
            import re
            match = re.search(r'[А-ЯA-Z]\d{3}[А-ЯA-Z]{2}\s?\d{2,3}', transaction.vehicle)
            if match:
                state_number = match.group(0).replace(" ", "")
        
        # ВАЖНО: В API ППР amount = количество (литры), а не сумма!
        # Сумма = sum = price * amount
        
        # Определяем количество (amount в API ППР)
        amount_quantity = float(transaction.quantity) if transaction.quantity is not None else 0.0
        
        # Определяем сумму (sum в API ППР)
        # Приоритет: amount_with_discount > amount > вычисление из цены * количество
        sum_value = 0.0
        
        # Логируем исходные значения для диагностики
        if transaction.id <= 340025:
            import sys
            print(f"\n!!! ДИАГНОСТИКА sum для транзакции {transaction.id} (English format) !!!", file=sys.stdout, flush=True)
            print(f"  transaction.quantity (будет amount): {transaction.quantity}", file=sys.stdout, flush=True)
            print(f"  transaction.amount_with_discount (будет sum): {transaction.amount_with_discount}", file=sys.stdout, flush=True)
            print(f"  transaction.amount (будет sum): {transaction.amount}", file=sys.stdout, flush=True)
            print(f"  transaction.price_with_discount: {transaction.price_with_discount}", file=sys.stdout, flush=True)
            print(f"  transaction.price: {transaction.price}", file=sys.stdout, flush=True)
        
        # Проверяем amount_with_discount (это сумма)
        if transaction.amount_with_discount is not None:
            sum_wd = float(transaction.amount_with_discount)
            if sum_wd != 0:
                sum_value = sum_wd
                if transaction.id <= 340025:
                    import sys
                    print(f"  Используем amount_with_discount как sum: {sum_value}", file=sys.stdout, flush=True)
        
        # Проверяем amount (это тоже сумма в нашей БД, но в API ППР amount = количество!)
        if sum_value == 0.0 and transaction.amount is not None:
            sum_val = float(transaction.amount)
            if sum_val != 0:
                sum_value = sum_val
                if transaction.id <= 340025:
                    import sys
                    print(f"  Используем transaction.amount как sum: {sum_value}", file=sys.stdout, flush=True)
        
        # Вычисляем сумму из цены и количества
        if sum_value == 0.0 and amount_quantity > 0:
            if transaction.price_with_discount is not None:
                price_wd = float(transaction.price_with_discount)
                if price_wd != 0:
                    sum_value = price_wd * amount_quantity
                    if transaction.id <= 340025:
                        import sys
                        print(f"  Вычисляем sum из price_with_discount * quantity: {price_wd} * {amount_quantity} = {sum_value}", file=sys.stdout, flush=True)
            
            if sum_value == 0.0 and transaction.price is not None:
                price_val = float(transaction.price)
                if price_val != 0:
                    sum_value = price_val * amount_quantity
                    if transaction.id <= 340025:
                        import sys
                        print(f"  Вычисляем sum из price * quantity: {price_val} * {amount_quantity} = {sum_value}", file=sys.stdout, flush=True)
            
            # Если все еще 0, вычисляем из средней цены за период для этого вида топлива
            if sum_value == 0.0 and amount_quantity > 0:
                средняя_цена = self._get_average_price_for_product(
                    transaction.provider_id,
                    transaction.product,
                    transaction.transaction_date
                )
                if средняя_цена > 0:
                    sum_value = средняя_цена * amount_quantity
                    if transaction.id <= 340025:
                        import sys
                        print(f"  Вычисляем sum из средней цены: {средняя_цена} * {amount_quantity} = {sum_value}", file=sys.stdout, flush=True)
        
        if transaction.id <= 340025:
            import sys
            print(f"  ИТОГОВЫЙ sum_value: {sum_value}", file=sys.stdout, flush=True)
            print(f"  ИТОГОВЫЙ amount_quantity (количество): {amount_quantity}", file=sys.stdout, flush=True)
            print(f"!!! КОНЕЦ ДИАГНОСТИКИ sum (English format) !!!\n", file=sys.stdout, flush=True)
        
        # Вычисляем цену, если она не указана
        price_value = 0.0
        if transaction.price_with_discount:
            price_value = float(transaction.price_with_discount)
        elif transaction.price:
            price_value = float(transaction.price)
        elif sum_value > 0 and amount_quantity > 0:
            try:
                price_value = sum_value / amount_quantity
            except (ZeroDivisionError, TypeError):
                price_value = 0.0
        
        # Получаем название ТС
        vehicle_name = transaction.vehicle or ""
        if transaction.vehicle_id:
            from app.models import Vehicle
            vehicle = self.db.query(Vehicle).filter(
                Vehicle.id == transaction.vehicle_id
            ).first()
            if vehicle:
                vehicle_name = vehicle.original_name or vehicle_name
        
        # Получаем данные АЗС для дополнительных полей
        pos_name = ""
        pos_brand = ""
        pos_town = ""
        pos_number = None
        latitude = None
        longitude = None
        
        if transaction.gas_station_id:
            gas_station = self.db.query(GasStation).filter(
                GasStation.id == transaction.gas_station_id
            ).first()
            if gas_station:
                pos_name = getattr(gas_station, 'name', None) or getattr(gas_station, 'original_name', None) or ""
                pos_brand = getattr(gas_station, 'brand', None) or ""
                pos_town = getattr(gas_station, 'settlement', None) or ""
                pos_number = getattr(gas_station, 'azs_number', None)
                if pos_number:
                    try:
                        pos_number = int(pos_number)
                    except (ValueError, TypeError):
                        pos_number = None
                latitude = getattr(gas_station, 'latitude', None)
                longitude = getattr(gas_station, 'longitude', None)
        
        # Вычисляем сумму НДС, если есть ставка НДС
        sum_nds = 0.0
        if transaction.vat_rate and transaction.vat_amount:
            sum_nds = float(transaction.vat_amount)
        elif transaction.vat_rate and sum_value > 0:
            # Вычисляем НДС из суммы (если ставка НДС = 20%, то НДС = сумма * 20 / 120)
            vat_rate = float(transaction.vat_rate)
            if vat_rate > 0:
                sum_nds = sum_value * vat_rate / (100 + vat_rate)
        
        # Формируем структуру с полными данными для модуля РАРУСППР
        # ВАЖНО: В API ППР amount = количество (литры), sum = сумма (цена * количество)
        # Поля должны соответствовать формату официального API ППР
        структура_english = {
            # Основные обязательные поля (как в официальном API ППР)
            "date": date_str,
            "cardNum": card_num,
            "TypeID": type_id,  # 1 = "Заправка"/"Дебет", 0 = "Возврат"
            "amount": amount_quantity,  # КОЛИЧЕСТВО (литры) - в API ППР amount = количество!
            "sum": sum_value,  # СУММА (цена * количество)
            "price": price_value,  # Цена за литр
            
            # Дополнительные поля для совместимости с официальным API ППР
            "serviceName": transaction.product or "",  # Вид топлива: "ДТ", "АИ-92"
            "fuel": transaction.product or "",  # Альтернативное название для serviceName
            "posAddress": address,  # Адрес АЗС
            "address": address,  # Альтернативное название для posAddress
            "carNumber": state_number,  # Гос. номер ТС
            "stateNumber": state_number,  # Альтернативное название для carNumber
            "posNumber": pos_number,  # Номер АЗС
            "posName": pos_name,  # Название АЗС
            "posBrand": pos_brand,  # Бренд АЗС
            "posTown": pos_town or transaction.settlement or "",  # Город
            "latitude": float(latitude) if latitude is not None else None,  # Широта
            "longitude": float(longitude) if longitude is not None else None,  # Долгота
            "currency": transaction.currency or "RUB",  # Валюта
            "unitName": "л",  # Единица измерения
            "sumNds": sum_nds,  # Сумма НДС
            "discount": float(transaction.discount_amount) if transaction.discount_amount else 0.0,  # Скидка
            
            # Русские названия для совместимости
            "Дата": date_str,  # Русское название для date
            "ПластиковаяКарта": card_num,  # Русское название для cardNum
            "КомуВыдана": vehicle_name,  # Кому выдана карта
            "ТС": vehicle_name,  # Транспортное средство
        }
        
        return структура_english
    
    def get_cards(
        self,
        provider_id: Optional[int] = None,
        skip: int = 0,
        limit: int = 1000
    ) -> tuple[List[Dict[str, Any]], int]:
        """
        Получение списка топливных карт в формате ППР
        
        Args:
            provider_id: ID провайдера
            skip: Количество записей для пропуска
            limit: Максимальное количество записей
        
        Returns:
            tuple: (список карт, общее количество)
        """
        # Получаем карты напрямую из БД
        query = self.db.query(FuelCard)
        if provider_id:
            query = query.filter(FuelCard.provider_id == provider_id)
        
        # Подсчитываем общее количество
        total = query.count()
        
        # Применяем пагинацию
        cards = query.offset(skip).limit(limit).all()
        
        # Преобразуем в формат ППР
        результат = []
        for card in cards:
            try:
                карта_ппр = self._convert_card_to_ppr_format(card)
                результат.append(карта_ппр)
            except Exception as e:
                logger.error(
                    f"Ошибка при преобразовании карты {card.id} в формат ППР",
                    extra={
                        "card_id": card.id,
                        "error": str(e),
                        "error_type": type(e).__name__
                    },
                    exc_info=True
                )
                continue
        
        return результат, total
    
    def _convert_card_to_ppr_format(self, card: FuelCard) -> Dict[str, Any]:
        """
        Преобразует карту в формат ППР
        
        Формат ППР для карты:
        - Идентификатор (ID карты)
        - Номер (номер карты)
        - Статус (статус карты)
        - Владелец (владелец карты)
        """
        return {
            "Идентификатор": str(card.id) if card.id else "",
            "Номер": card.card_number or "",
            "Статус": "Активна" if not card.is_blocked else "Заблокирована",
            "Владелец": card.original_owner_name or card.normalized_owner or "",
            "Провайдер": card.provider.name if card.provider else ""
        }

