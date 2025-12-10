"""
Сервис для работы с API провайдеров (PetrolPlus и другие)
"""
from datetime import datetime, timezone, date
from decimal import Decimal
from typing import Optional, List, Dict, Any
import httpx
from sqlalchemy.orm import Session
from app.logger import logger
from app.models import Provider, ProviderTemplate


class PetrolPlusAdapter:
    """
    Адаптер для работы с API провайдера PetrolPlus
    """
    
    def __init__(self, base_url: str, api_token: str, currency: str = "RUB"):
        """
        Инициализация адаптера PetrolPlus
        
        Args:
            base_url: Базовый URL API (например, "https://online.petrolplus.ru/api")
            api_token: Токен авторизации
            currency: Валюта по умолчанию
        """
        self.base_url = base_url.rstrip('/')
        self.api_token = api_token
        self.currency = currency
        self.client = httpx.AsyncClient(timeout=30.0)
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.client.aclose()
    
    def _auth_headers(self) -> Dict[str, str]:
        """Формирование заголовков авторизации"""
        return {
            "Authorization": self.api_token,
            "Accept": "application/json",
        }
    
    async def _get_json(
        self,
        path: str,
        params: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Выполнение GET запроса к API
        
        Args:
            path: Путь API endpoint
            params: Параметры запроса
            
        Returns:
            Ответ API в виде словаря
            
        Raises:
            httpx.HTTPError: при ошибке HTTP запроса
        """
        headers = self._auth_headers()
        query = {"format": "json"}
        if params:
            query.update({k: v for k, v in params.items() if v is not None})
        
        url = f"{self.base_url}{path}"
        
        try:
            response = await self.client.get(url, headers=headers, params=query)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            logger.error(f"Ошибка HTTP при запросе к API: {e.response.status_code}", extra={
                "url": url,
                "status_code": e.response.status_code,
                "response_text": e.response.text[:500]
            })
            raise
        except httpx.RequestError as e:
            logger.error(f"Ошибка запроса к API: {str(e)}", extra={"url": url})
            raise
    
    async def list_cards(self) -> List[Dict[str, Any]]:
        """
        Получение списка топливных карт
        
        Returns:
            Список карт
        """
        payload = await self._get_json("/public-api/v2/cards")
        return payload.get("cards") or []
    
    async def fetch_card_transactions(
        self,
        card_number: str,
        date_from: date,
        date_to: date
    ) -> List[Dict[str, Any]]:
        """
        Получение транзакций по карте за период
        
        Args:
            card_number: Номер карты
            date_from: Начальная дата периода
            date_to: Конечная дата периода
            
        Returns:
            Список транзакций
        """
        params = {
            "dateFrom": date_from.strftime("%Y-%m-%d"),
            "dateTo": date_to.strftime("%Y-%m-%d"),
        }
        
        payload = await self._get_json(
            f"/public-api/v2/cards/{card_number}/transactions",
            params=params
        )
        
        return payload.get("transactions") or []
    
    async def healthcheck(self) -> Dict[str, Any]:
        """
        Проверка доступности API
        
        Returns:
            Результат проверки
        """
        try:
            await self._get_json("/public-api/v2/cards", params={"limit": 1})
            return {"status": "ok", "checked_at": datetime.now(timezone.utc)}
        except Exception as e:
            return {
                "status": "error",
                "checked_at": datetime.now(timezone.utc),
                "error": str(e)
            }
    
    async def get_transaction_fields(self) -> List[str]:
        """
        Получение списка полей из примера транзакции API
        
        Returns:
            Список имен полей из API ответа
        """
        try:
            # Получаем список карт
            cards = await self.list_cards()
            if not cards:
                logger.warning("Список карт пуст при получении полей из API")
                return []
            
            logger.debug(f"Найдено карт: {len(cards)}", extra={"cards_count": len(cards)})
            
            # Пробуем найти карту с данными
            transactions = None
            card_number = None
            
            # Пробуем получить транзакции с нескольких карт
            for card_item in cards[:5]:  # Пробуем максимум 5 карт
                card_num = str(card_item.get("cardNum") or card_item.get("card_number") or "")
                if not card_num:
                    continue
                
                try:
                    # Получаем транзакции за последние 90 дней (больше шансов найти данные)
                    from datetime import timedelta
                    date_to = date.today()
                    date_from = date_to - timedelta(days=90)
                    
                    card_transactions = await self.fetch_card_transactions(
                        card_num,
                        date_from,
                        date_to
                    )
                    
                    if card_transactions and len(card_transactions) > 0:
                        transactions = card_transactions
                        card_number = card_num
                        logger.debug(f"Найдены транзакции для карты {card_num}: {len(transactions)}", extra={
                            "card_number": card_num,
                            "transactions_count": len(transactions)
                        })
                        break
                except Exception as card_error:
                    logger.debug(f"Ошибка при получении транзакций для карты {card_num}: {str(card_error)}", extra={
                        "card_number": card_num,
                        "error": str(card_error)
                    })
                    continue
            
            if not transactions:
                logger.warning("Не найдено транзакций ни для одной карты, пытаемся получить поля из структуры карты", extra={
                    "checked_cards": min(len(cards), 5)
                })
                # Если транзакций нет, используем структуру карты
                if cards:
                    card_fields = set()
                    for card_item in cards[:3]:  # Проверяем первые 3 карты
                        if isinstance(card_item, dict):
                            card_fields.update(card_item.keys())
                    
                    if card_fields:
                        fields_list = sorted(list(card_fields))
                        logger.info(f"Получено полей из структуры карт: {len(fields_list)}", extra={
                            "fields_count": len(fields_list),
                            "sample_fields": list(fields_list)[:10]
                        })
                        return fields_list
                
                # Если ничего не найдено, возвращаем стандартные поля на основе документации PetrolPlus API
                logger.warning("Не удалось получить поля из API, возвращаем стандартные поля PetrolPlus")
                standard_fields = [
                    "idTrans", "idtrans",
                    "date", "dateReg", "dateRec",
                    "cardNum", "card_number",
                    "sum", "amount",
                    "serviceName", "product",
                    "posName", "posBrand", "azsNumber",
                    "posAddress", "address", "fullAddress", "posFullAddress",
                    "posTown", "settlement",
                    "posStreet", "posHouse",
                    "posLatitude", "posLat", "latitude", "lat",
                    "posLongitude", "posLon", "longitude", "lon",
                    "currency",
                    "supplier", "region"
                ]
                return standard_fields
            
            # Извлекаем все уникальные ключи из всех транзакций (для полноты картины)
            all_fields = set()
            for trans in transactions[:10]:  # Проверяем первые 10 транзакций
                if isinstance(trans, dict):
                    all_fields.update(trans.keys())
            
            fields_list = sorted(list(all_fields))
            
            logger.info(f"Получено полей из API: {len(fields_list)}", extra={
                "fields_count": len(fields_list),
                "card_number": card_number,
                "sample_fields": fields_list[:10]
            })
            
            return fields_list
            
        except Exception as e:
            logger.error(f"Ошибка при получении полей из API: {str(e)}", extra={"error": str(e)}, exc_info=True)
            return []


class ApiProviderService:
    """
    Сервис для работы с API провайдерами
    """
    
    def __init__(self, db: Session):
        self.db = db
    
    def create_adapter(self, template: ProviderTemplate) -> Optional[PetrolPlusAdapter]:
        """
        Создание адаптера для работы с API на основе шаблона
        
        Args:
            template: Шаблон провайдера с типом подключения "api"
            
        Returns:
            Адаптер API или None, если не удалось создать
        """
        if template.connection_type != "api":
            raise ValueError(f"Шаблон имеет тип подключения '{template.connection_type}', ожидается 'api'")
        
        if not template.connection_settings:
            raise ValueError("В шаблоне не указаны настройки подключения к API")
        
        # Парсим настройки подключения
        import json
        try:
            if isinstance(template.connection_settings, str):
                settings = json.loads(template.connection_settings)
            elif template.connection_settings is None:
                raise ValueError("Настройки подключения не указаны")
            else:
                settings = template.connection_settings
        except (json.JSONDecodeError, TypeError) as e:
            raise ValueError(f"Неверный формат настроек подключения: {str(e)}")
        
        # Определяем тип провайдера
        provider_type = settings.get("provider_type", "petrolplus")
        base_url = settings.get("base_url") or settings.get("api_url")
        api_token = settings.get("api_token") or settings.get("token") or settings.get("api_key")
        currency = settings.get("currency", "RUB")
        
        if not base_url:
            raise ValueError("Не указан базовый URL API (base_url или api_url)")
        if not api_token:
            raise ValueError("Не указан токен авторизации (api_token, token или api_key)")
        
        if provider_type.lower() == "petrolplus":
            return PetrolPlusAdapter(base_url, api_token, currency)
        else:
            raise ValueError(f"Неподдерживаемый тип провайдера API: {provider_type}")
    
    async def test_connection(self, template: ProviderTemplate) -> Dict[str, Any]:
        """
        Тестирование подключения к API
        
        Args:
            template: Шаблон провайдера с типом подключения "api"
            
        Returns:
            Результат тестирования
        """
        try:
            adapter = self.create_adapter(template)
            async with adapter:
                result = await adapter.healthcheck()
                return {
                    "success": result.get("status") == "ok",
                    "message": (
                        "Подключение успешно" if result.get("status") == "ok"
                        else f"Ошибка подключения: {result.get('error', 'Неизвестная ошибка')}"
                    ),
                    "details": result
                }
        except Exception as e:
            logger.error("Ошибка при тестировании подключения к API", extra={
                "template_id": template.id,
                "error": str(e)
            }, exc_info=True)
            return {
                "success": False,
                "message": f"Ошибка подключения: {str(e)}",
                "details": {"error": str(e)}
            }
    
    async def get_api_fields(self, template: ProviderTemplate) -> Dict[str, Any]:
        """
        Получение списка полей из API ответа
        
        Args:
            template: Шаблон провайдера с типом подключения "api"
            
        Returns:
            Словарь с полями и информацией об ошибках
        """
        try:
            adapter = self.create_adapter(template)
            async with adapter:
                fields = await adapter.get_transaction_fields()
                
                if not fields:
                    return {
                        "fields": [],
                        "count": 0,
                        "error": "Не удалось получить поля из API. Возможные причины: нет доступных карт, нет транзакций за последние 90 дней, или API возвращает пустые данные."
                    }
                
                return {
                    "fields": fields,
                    "count": len(fields),
                    "error": None
                }
        except ValueError as e:
            # Ошибки валидации (неправильные настройки)
            error_msg = str(e)
            logger.error("Ошибка валидации при получении полей из API", extra={
                "template_id": getattr(template, 'id', None),
                "error": error_msg
            }, exc_info=True)
            return {
                "fields": [],
                "count": 0,
                "error": f"Ошибка настройки подключения: {error_msg}"
            }
        except Exception as e:
            error_msg = str(e)
            logger.error("Ошибка при получении полей из API", extra={
                "template_id": getattr(template, 'id', None),
                "error": error_msg
            }, exc_info=True)
            return {
                "fields": [],
                "count": 0,
                "error": f"Ошибка подключения к API: {error_msg}"
            }
    
    async def fetch_transactions(
        self,
        template: ProviderTemplate,
        date_from: date,
        date_to: date,
        card_numbers: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Загрузка транзакций через API
        
        Args:
            template: Шаблон провайдера с типом подключения "api"
            card_numbers: Список номеров карт (если None, загружаются все карты)
            date_from: Начальная дата периода
            date_to: Конечная дата периода
            
        Returns:
            Список транзакций в формате системы
        """
        adapter = self.create_adapter(template)
        
        all_transactions = []
        
        try:
            async with adapter:
                # Если карты не указаны, получаем список всех карт
                if not card_numbers:
                    cards_data = await adapter.list_cards()
                    card_numbers = [str(card.get("cardNum") or "") for card in cards_data if card.get("cardNum")]
                    logger.info(f"Найдено карт для загрузки: {len(card_numbers)}", extra={
                        "template_id": template.id
                    })
                
                # Загружаем транзакции для каждой карты
                for card_number in card_numbers:
                    if not card_number:
                        continue
                    
                    try:
                        transactions = await adapter.fetch_card_transactions(
                            card_number,
                            date_from,
                            date_to
                        )
                        
                        # Преобразуем транзакции в формат системы
                        for trans in transactions:
                            system_trans = self._convert_to_system_format(trans, template, card_number)
                            if system_trans:
                                all_transactions.append(system_trans)
                        
                        logger.debug(f"Загружено транзакций для карты {card_number}: {len(transactions)}", extra={
                            "card_number": card_number,
                            "template_id": template.id
                        })
                    except Exception as e:
                        logger.warning(f"Ошибка при загрузке транзакций для карты {card_number}: {str(e)}", extra={
                            "card_number": card_number,
                            "template_id": template.id,
                            "error": str(e)
                        })
                        continue
            
            logger.info(f"Всего загружено транзакций: {len(all_transactions)}", extra={
                "template_id": template.id,
                "total": len(all_transactions)
            })
            
            return all_transactions
            
        except Exception as e:
            logger.error("Ошибка при загрузке транзакций через API", extra={
                "template_id": template.id,
                "error": str(e)
            }, exc_info=True)
            raise
    
    def _convert_to_system_format(
        self,
        api_transaction: Dict[str, Any],
        template: ProviderTemplate,
        card_number: str
    ) -> Optional[Dict[str, Any]]:
        """
        Преобразование транзакции из формата API в формат системы
        
        Args:
            api_transaction: Транзакция из API
            template: Шаблон провайдера
            card_number: Номер карты
            
        Returns:
            Транзакция в формате системы или None
        """
        # Парсим маппинг полей
        import json
        try:
            if isinstance(template.field_mapping, str):
                field_mapping = json.loads(template.field_mapping)
            else:
                field_mapping = template.field_mapping
        except (json.JSONDecodeError, TypeError):
            field_mapping = {}
        
        # Преобразуем дату
        transaction_date = self._parse_datetime(
            api_transaction.get("date") or
            api_transaction.get("dateReg") or
            api_transaction.get("dateRec")
        )
        
        if not transaction_date:
            logger.warning("Не удалось определить дату транзакции", extra={
                "transaction": api_transaction
            })
            return None
        
        # Преобразуем сумму и количество
        amount = self._parse_decimal(api_transaction.get("sum"), default=Decimal("0")) or Decimal("0")
        quantity = self._parse_decimal(api_transaction.get("amount")) or Decimal("0")
        
        # Формируем адрес
        address_parts = [
            api_transaction.get("posAddress") or api_transaction.get("address"),
            api_transaction.get("posTown"),
            api_transaction.get("posStreet"),
            api_transaction.get("posHouse"),
        ]
        address_candidates = [part for part in address_parts if part]
        resolved_address = (
            api_transaction.get("fullAddress") or
            api_transaction.get("posFullAddress") or
            ", ".join(dict.fromkeys(address_candidates))
        )
        
        # Создаем транзакцию в формате системы
        system_transaction = {
            "transaction_date": transaction_date,
            "card_number": card_number,
            "vehicle": None,  # Будет определяться по маппингу или привязкам карты
            "azs_number": str(api_transaction.get("posName") or api_transaction.get("posBrand") or api_transaction.get("azsNumber") or ""),
            "supplier": api_transaction.get("supplier"),
            "region": api_transaction.get("region"),
            "settlement": api_transaction.get("posTown") or api_transaction.get("settlement"),
            "location": resolved_address,
            "location_code": api_transaction.get("posCode") or api_transaction.get("locationCode"),
            "product": api_transaction.get("serviceName") or api_transaction.get("product"),
            "operation_type": "Покупка",
            "quantity": quantity,
            "currency": api_transaction.get("currency") or self._get_currency_from_settings(template) or "RUB",
            "exchange_rate": Decimal("1"),
            "amount": amount,
            "provider_id": template.provider_id,
            "source_file": f"API_{template.provider_id}_{card_number}",
        }
        
        return system_transaction
    
    def _parse_datetime(self, value: Any) -> Optional[datetime]:
        """Парсинг даты и времени из различных форматов"""
        if not value:
            return None
        
        if isinstance(value, datetime):
            return value
        
        if isinstance(value, date):
            return datetime.combine(value, datetime.min.time()).replace(tzinfo=timezone.utc)
        
        if isinstance(value, str):
            # Пробуем различные форматы
            formats = [
                "%Y-%m-%dT%H:%M:%S",
                "%Y-%m-%dT%H:%M:%S.%f",
                "%Y-%m-%d %H:%M:%S",
                "%Y-%m-%d",
                "%d.%m.%Y %H:%M:%S",
                "%d.%m.%Y",
            ]
            
            for fmt in formats:
                try:
                    dt = datetime.strptime(value, fmt)
                    return dt.replace(tzinfo=timezone.utc)
                except ValueError:
                    continue
        
        return None
    
    def _parse_decimal(self, value: Any, default: Optional[Decimal] = None) -> Optional[Decimal]:
        """Парсинг Decimal из различных типов"""
        if value is None:
            return default
        
        if isinstance(value, Decimal):
            return value
        
        if isinstance(value, (int, float)):
            return Decimal(str(value))
        
        if isinstance(value, str):
            try:
                # Убираем пробелы и заменяем запятую на точку
                cleaned = value.strip().replace(",", ".").replace(" ", "")
                return Decimal(cleaned)
            except (ValueError, TypeError):
                return default
        
        return default
    
    def _get_currency_from_settings(self, template: ProviderTemplate) -> Optional[str]:
        """Получение валюты из настроек подключения"""
        if not template.connection_settings:
            return None
        
        import json
        try:
            if isinstance(template.connection_settings, str):
                settings = json.loads(template.connection_settings)
            else:
                settings = template.connection_settings
            return settings.get("currency", "RUB")
        except (json.JSONDecodeError, TypeError):
            return None

