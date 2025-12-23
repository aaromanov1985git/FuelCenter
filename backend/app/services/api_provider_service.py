"""
Сервис для работы с API провайдеров (PetrolPlus и другие)
"""
from datetime import datetime, timezone, date, timedelta
from decimal import Decimal
from typing import Optional, List, Dict, Any
import httpx
import hashlib
import base64
import json
import xml.etree.ElementTree as ET
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


class WebAdapter:
    """
    Адаптер для работы с веб-сервисом через API авторизацию
    
    Поддерживает два типа авторизации:
    1. XML API авторизация (приоритет) - используется при наличии ключа или подписи в настройках
    2. JSON API авторизация (JWT токен) - используется по умолчанию, если XML API параметры не указаны
    
    Примечание: Playwright отключен. Используется только оригинальный API (XML или JSON).
    """
    
    def __init__(
        self, 
        base_url: str, 
        username: str, 
        password: str, 
        currency: str = "RUB",
        use_xml_api: bool = False,
        xml_api_key: Optional[str] = None,
        xml_api_signature: Optional[str] = None,
        xml_api_salt: Optional[str] = None,
        xml_api_cod_azs: Optional[int] = None,
        xml_api_endpoint: Optional[str] = None,
        xml_api_certificate: Optional[str] = None,
        xml_api_pos_code: Optional[int] = None
    ):
        """
        Инициализация адаптера веб-сервиса
        
        Args:
            base_url: Базовый URL сервиса (например, "http://176.222.217.51:8080")
            username: Имя пользователя для авторизации
            password: Пароль для авторизации
            currency: Валюта по умолчанию
            use_xml_api: Использовать XML API авторизацию (вместо JSON)
            xml_api_key: Ключ для XML API (например, "i#188;t#0;k#545")
            xml_api_signature: Подпись для XML API (например, "545.1AFB41693CD79C72796D7B56F2D727B8B343BF17")
            xml_api_salt: Salt для хеширования пароля (если требуется вычисление sha1(salt + password))
            xml_api_cod_azs: Код АЗС для XML API (например, 1000001)
            xml_api_endpoint: Кастомный endpoint для XML API (если не указан, пробуются стандартные пути)
            xml_api_certificate: Сертификат для XML API (например, "1.4703FECF75257F2E915")
            xml_api_pos_code: Код POS для XML API (например, 23)
        """
        # Нормализуем базовый URL (убираем лишние слэши и пробелы)
        base_url = base_url.strip()
        # Убираем завершающий слэш, если есть
        self.base_url = base_url.rstrip('/')
        # Проверяем, что base_url содержит протокол
        if not self.base_url.startswith('http://') and not self.base_url.startswith('https://'):
            raise ValueError(f"base_url должен начинаться с http:// или https://. Получено: {base_url}")
        self.username = username
        self.password = password
        self.currency = currency
        self.use_xml_api = use_xml_api
        self.xml_api_key = xml_api_key
        self.xml_api_signature = xml_api_signature
        self.xml_api_salt = xml_api_salt
        self.xml_api_cod_azs = xml_api_cod_azs or 1000001
        self.xml_api_endpoint = xml_api_endpoint
        self.xml_api_certificate = xml_api_certificate
        # POS Code может быть None - в таком случае запрос будет по всем POS
        self.xml_api_pos_code = xml_api_pos_code if xml_api_pos_code else None
        # Настраиваем клиент с заголовками по умолчанию для имитации браузера
        # Используем тот же User-Agent, что и в браузере пользователя
        default_headers = {
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
            "User-Agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "Connection": "keep-alive",
        }
        self.client = httpx.AsyncClient(
            timeout=30.0,
            follow_redirects=True,
            headers=default_headers,
            cookies=None  # httpx автоматически сохраняет cookies между запросами
        )
        self.access_token: Optional[str] = None
    
    async def __aenter__(self):
        await self._authenticate()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.client.aclose()
    
    def _parse_xml_api_key(self, key: str) -> Dict[str, int]:
        """
        Парсит ключ XML API вида "i#188;t#0;k#545"
        
        Args:
            key: Ключ в формате "i#188;t#0;k#545"
            
        Returns:
            Словарь с распарсенными значениями
        """
        result = {}
        parts = key.split(';')
        for part in parts:
            if '#' in part:
                key_part, value_part = part.split('#', 1)
                try:
                    result[key_part.strip()] = int(value_part.strip())
                except ValueError:
                    pass
        return result
    
    def _create_xml_auth_request(
        self, 
        login: str, 
        password_hash: str,
        cod_azs: int = 1000001
    ) -> str:
        """
        Создает XML запрос для авторизации согласно спецификации API СНК
        
        Args:
            login: Логин пользователя
            password_hash: Хешированный пароль (sha1(salt + password))
            cod_azs: Код АЗС
            
        Returns:
            XML строка запроса
        """
        xml_request = ET.Element('RequestDS')
        
        # Элемент Request
        request_elem = ET.SubElement(xml_request, 'Request')
        ET.SubElement(request_elem, 'RequestKey').text = '0'
        ET.SubElement(request_elem, 'sncAppCode').text = '17'
        ET.SubElement(request_elem, 'ShopRequestKey').text = '0'
        ET.SubElement(request_elem, 'SelectName').text = 'Authorization'
        ET.SubElement(request_elem, 'COD_AZS').text = str(cod_azs)
        ET.SubElement(request_elem, 'COD_Q').text = '0'
        
        # Элементы Details
        details_new_login = ET.SubElement(xml_request, 'Details')
        ET.SubElement(details_new_login, 'DetailsSelectName').text = 'NewLogin'
        ET.SubElement(details_new_login, 'DetailsValue').text = ''
        
        details_login = ET.SubElement(xml_request, 'Details')
        ET.SubElement(details_login, 'DetailsSelectName').text = 'login'
        ET.SubElement(details_login, 'DetailsValue').text = login
        
        details_password = ET.SubElement(xml_request, 'Details')
        ET.SubElement(details_password, 'DetailsSelectName').text = 'password'
        ET.SubElement(details_password, 'DetailsValue').text = password_hash
        
        details_roles = ET.SubElement(xml_request, 'Details')
        ET.SubElement(details_roles, 'DetailsSelectName').text = 'Roles'
        ET.SubElement(details_roles, 'DetailsValue').text = '0'
        
        details_import = ET.SubElement(xml_request, 'Details')
        ET.SubElement(details_import, 'DetailsSelectName').text = 'ImportData'
        ET.SubElement(details_import, 'DetailsValue').text = ''
        
        # Преобразуем в строку
        ET.indent(xml_request, space='  ')
        xml_string = ET.tostring(xml_request, encoding='utf-8', xml_declaration=True).decode('utf-8')
        return xml_string
    
    def _hash_password(self, password: str, salt: str) -> str:
        """
        Хеширует пароль по алгоритму sha1(salt + password)
        
        Args:
            password: Пароль пользователя
            salt: Соль для хеширования
            
        Returns:
            Хеш пароля в hex формате
        """
        combined = salt + password
        hash_obj = hashlib.sha1(combined.encode('utf-8'))
        return hash_obj.hexdigest()
    
    async def _authenticate_xml_api(self) -> bool:
        """
        Авторизация через XML API согласно спецификации API СНК (раздел 6.2)
        
        Returns:
            True если авторизация успешна, иначе False
        """
        print(f"\n{'='*80}")
        print(f"=== WebAdapter._authenticate_xml_api НАЧАЛО ===")
        print(f"base_url: {self.base_url}")
        print(f"username: {self.username}")
        print(f"use_xml_api: {self.use_xml_api}")
        print(f"xml_api_key: {self.xml_api_key}")
        print(f"xml_api_signature: {self.xml_api_signature}")
        print(f"xml_api_salt: {self.xml_api_salt}")
        print(f"xml_api_cod_azs: {self.xml_api_cod_azs}")
        print(f"{'='*80}\n")
        
        logger.info("=== НАЧАЛО XML API АВТОРИЗАЦИИ ===", extra={
            "base_url": self.base_url,
            "username": self.username,
            "use_xml_api": self.use_xml_api,
            "has_key": bool(self.xml_api_key),
            "has_signature": bool(self.xml_api_signature),
            "has_salt": bool(self.xml_api_salt),
            "cod_azs": self.xml_api_cod_azs
        })
        
        try:
            # Определяем хеш пароля согласно спецификации: password = sha1(salt + inputPassword)
            password_hash = None
            hash_source = None
            
            # Приоритет 1: Если есть готовая подпись, используем её как готовый хеш пароля
            # Подпись в формате "545.1AFB41693CD79C72796D7B56F2D727B8B343BF17"
            # где часть после точки - это готовый хеш sha1(salt + password)
            if self.xml_api_signature:
                # Извлекаем хеш (часть после точки)
                if '.' in self.xml_api_signature:
                    password_hash = self.xml_api_signature.split('.', 1)[1]
                    hash_source = f"signature (извлечен из '{self.xml_api_signature[:20]}...')"
                else:
                    password_hash = self.xml_api_signature
                    hash_source = f"signature (использован полностью)"
                logger.info(f"✓ Используется готовая подпись как хеш пароля: {hash_source}")
                print(f"✓ Хеш пароля из подписи: {password_hash[:20]}... (длина: {len(password_hash)})")
            
            # Приоритет 2: Если есть salt, вычисляем хеш sha1(salt + password)
            elif self.xml_api_salt:
                password_hash = self._hash_password(self.password, self.xml_api_salt)
                hash_source = f"salt (вычислен sha1(salt + password))"
                logger.info(f"✓ Вычислен хеш пароля с использованием salt")
                print(f"✓ Хеш пароля вычислен из salt: {password_hash[:20]}... (длина: {len(password_hash)})")
            
            # Приоритет 3: Если нет ни подписи, ни salt, используем пароль как есть (не рекомендуется)
            else:
                logger.warning("⚠ Нет подписи и salt, используем пароль как есть (небезопасно)")
                password_hash = self.password
                hash_source = "password (без хеширования)"
            
            if not password_hash:
                logger.error("✗ Не удалось определить хеш пароля")
                return False
            
            logger.info(f"Итоговый хеш пароля: {hash_source}, длина: {len(password_hash)}")
            
            # Парсим ключ для извлечения параметров (COD_AZS из i#188)
            # Ключ в формате "i#188;t#0;k#545" где:
            # - i#188 - COD_AZS = 188
            # - t#0 - возможно тип или другой параметр
            # - k#545 - возможно другой параметр
            cod_azs_from_key = None
            if self.xml_api_key:
                parsed_key = self._parse_xml_api_key(self.xml_api_key)
                logger.info(f"✓ Ключ распарсен: {parsed_key}")
                print(f"✓ Распарсенные параметры из ключа '{self.xml_api_key}': {parsed_key}")
                
                # Если в ключе есть значение для COD_AZS (параметр 'i'), используем его
                if 'i' in parsed_key:
                    cod_azs_from_key = parsed_key['i']
                    self.xml_api_cod_azs = cod_azs_from_key
                    logger.info(f"✓ COD_AZS извлечен из ключа: {cod_azs_from_key}")
                    print(f"✓ COD_AZS из ключа: {cod_azs_from_key}")
                else:
                    logger.warning(f"⚠ В ключе не найден параметр 'i' для COD_AZS, используем значение по умолчанию: {self.xml_api_cod_azs}")
            else:
                logger.info(f"Ключ не указан, используем COD_AZS по умолчанию: {self.xml_api_cod_azs}")
            
            # Создаем XML запрос согласно спецификации
            logger.info("Создание XML запроса авторизации", extra={
                "login": self.username,
                "password_hash_length": len(password_hash),
                "password_hash_preview": password_hash[:20] + "..." if len(password_hash) > 20 else password_hash,
                "cod_azs": self.xml_api_cod_azs,
                "hash_source": hash_source
            })
            
            xml_request = self._create_xml_auth_request(
                login=self.username,
                password_hash=password_hash,
                cod_azs=self.xml_api_cod_azs
            )
            
            logger.info("✓ XML запрос создан", extra={
                "xml_length": len(xml_request),
                "xml_preview": xml_request[:500]
            })
            print(f"\n{'='*80}")
            print(f"XML ЗАПРОС АВТОРИЗАЦИИ:")
            print(f"{'='*80}")
            print(xml_request)
            print(f"{'='*80}\n")
            
            # Заголовки для XML API согласно спецификации СНК-ЛК
            # Важно: Content-Length вычисляется автоматически httpx
            xml_request_bytes = xml_request.encode('utf-8')
            headers = {
                "Content-Type": "text/xml; charset=utf-8",
                "Return-type": "json",  # Ответ приходит в формате JSON, несмотря на XML-запрос
                "Connection": "open",
                "Accept": "application/json, text/xml, */*",
                "User-Agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36",
                "Content-Length": str(len(xml_request_bytes)),  # Явно указываем длину
            }
            
            logger.info(f"Отправка XML запроса (размер: {len(xml_request_bytes)} байт, кодировка: UTF-8)")
            logger.info(f"Заголовки запроса: {headers}")
            
            # Определяем URL для отправки XML запроса
            # Согласно спецификации: URL: BASE_URL
            # Правильный endpoint для СНК API: BASE_URL/sncapi/
            if self.xml_api_endpoint:
                # Если указан кастомный endpoint, используем его
                if self.xml_api_endpoint.startswith('http://') or self.xml_api_endpoint.startswith('https://'):
                    # Полный URL - используем как есть
                    xml_endpoints = [self.xml_api_endpoint]
                    logger.info(f"Используется кастомный XML API endpoint (полный URL): {xml_endpoints[0]}")
                else:
                    # Если указан относительный путь, добавляем к base_url
                    endpoint_url = f"{self.base_url.rstrip('/')}/{self.xml_api_endpoint.lstrip('/')}"
                    xml_endpoints = [endpoint_url]
                    logger.info(f"Используется кастомный XML API endpoint (относительный путь): {xml_endpoints[0]}")
            else:
                # Пробуем стандартные endpoints
                xml_endpoints = [
                    self.base_url,  # Пробуем корневой URL (как в спецификации)
                    f"{self.base_url}/api",  # Стандартный API endpoint
                    f"{self.base_url}/xml",  # XML endpoint
                    f"{self.base_url}/soap",  # SOAP endpoint
                    f"{self.base_url}/api/xml",  # API/XML endpoint
                ]
                logger.info(f"Пробуем стандартные endpoints для XML API")
            
            response = None
            last_error = None
            
            for endpoint_url in xml_endpoints:
                try:
                    logger.info(f"Пробуем отправить XML запрос на {endpoint_url}")
                    print(f"Пробуем endpoint: {endpoint_url}")
                    
                    # Отправляем XML запрос с правильной кодировкой UTF-8
                    # httpx автоматически установит Content-Length
                    response = await self.client.post(
                        endpoint_url,
                        content=xml_request_bytes,
                        headers=headers,
                        timeout=30.0
                    )
                    
                    logger.info(f"Получен ответ от {endpoint_url}: статус {response.status_code}")
                    
                    # Если получили успешный ответ или ошибку авторизации (не 405), используем этот endpoint
                    if response.status_code != 405:
                        logger.info(f"✓ Найден рабочий endpoint: {endpoint_url}")
                        print(f"✓ Рабочий endpoint: {endpoint_url}")
                        break
                    else:
                        # Логируем заголовки ответа для диагностики
                        allow_methods = response.headers.get('Allow', 'не указано')
                        logger.warning(f"Endpoint {endpoint_url} вернул 405 Method Not Allowed. Allow: {allow_methods}")
                        print(f"✗ {endpoint_url} вернул 405. Разрешенные методы: {allow_methods}")
                        print(f"  Заголовки ответа: {dict(response.headers)}")
                        response = None
                        
                except httpx.HTTPStatusError as e:
                    # Если это не 405, значит endpoint правильный, но есть другая ошибка
                    if e.response.status_code != 405:
                        response = e.response
                        logger.info(f"✓ Endpoint {endpoint_url} принял запрос (статус {e.response.status_code})")
                        print(f"✓ Endpoint {endpoint_url} принял запрос (статус {e.response.status_code})")
                        break
                    last_error = e
                    response = None
                except Exception as e:
                    last_error = e
                    logger.warning(f"Ошибка при запросе к {endpoint_url}: {str(e)}")
                    response = None
                    continue
            
            if response is None:
                # Если все endpoints вернули 405, возможно нужен другой метод или путь
                error_msg = (
                    f"Не удалось найти рабочий endpoint для XML API. "
                    f"Все пробованные endpoints вернули 405 Method Not Allowed.\n"
                    f"Пробованные endpoints:\n" + "\n".join(f"  - {ep}" for ep in xml_endpoints) + "\n\n"
                    f"Возможные решения:\n"
                    f"1. Уточните правильный endpoint для XML API у администратора СНК-ЛК\n"
                    f"2. Укажите endpoint явно в настройках подключения (поле 'endpoint')\n"
                    f"3. Проверьте, что сервер СНК-HTTP запущен и доступен"
                )
                logger.error(error_msg)
                print(f"\n{'='*80}")
                print(f"✗ ОШИБКА: {error_msg}")
                print(f"{'='*80}\n")
                raise ValueError(error_msg)
            
            logger.info(f"Получен ответ: статус {response.status_code}")
            print(f"\n{'='*80}")
            print(f"ОТВЕТ ОТ СЕРВЕРА:")
            print(f"  Статус: {response.status_code}")
            print(f"  Заголовки: {dict(response.headers)}")
            print(f"  Тело ответа: {response.text[:1000]}")
            print(f"{'='*80}\n")
            
            # Проверяем статус ответа
            if response.status_code == 405:
                error_msg = "Метод POST не поддерживается на этом endpoint. Попробуйте указать другой endpoint для XML API в настройках."
                logger.error(error_msg)
                raise httpx.HTTPStatusError(
                    error_msg,
                    request=response.request,
                    response=response
                )
            
            response.raise_for_status()
            
            # Парсим ответ (согласно спецификации, ответ приходит в формате JSON)
            response_text = response.text
            
            # Ответ должен быть в формате JSON (благодаря заголовку Return-type: json)
            try:
                response_data = response.json()
                logger.info("✓ Ответ получен в формате JSON")
                print(f"\n{'='*80}")
                print(f"JSON ОТВЕТ ОТ СЕРВЕРА:")
                print(f"{'='*80}")
                print(json.dumps(response_data, ensure_ascii=False, indent=2))
                print(f"{'='*80}\n")
            except json.JSONDecodeError as json_error:
                # Если не JSON, пробуем парсить XML (на случай, если сервер вернул XML)
                logger.warning(f"Ответ не в формате JSON, пробуем парсить как XML: {str(json_error)}")
                try:
                    root = ET.fromstring(response_text)
                    logger.info("Ответ получен в формате XML")
                    # Преобразуем XML в словарь для удобства
                    response_data = self._xml_to_dict(root)
                    print(f"XML ответ (преобразовано): {response_data}")
                except Exception as xml_error:
                    logger.error(f"Не удалось распарсить ответ (ни JSON, ни XML): {str(xml_error)}")
                    logger.error(f"Сырой ответ: {response_text[:500]}")
                    return False
            except Exception as parse_error:
                logger.error(f"Ошибка при парсинге ответа: {str(parse_error)}")
                logger.error(f"Сырой ответ: {response_text[:500]}")
                return False
            
            # Проверяем результат авторизации
            # Ищем поле AuthorizationState в ответе
            auth_state = None
            
            # Функция для поиска AuthorizationState в JSON ответе
            # Структура ответа: { "Request": {...}, "Details": [{ "DetailsSelectName": "AuthorizationState", "DetailsValue": "..." }] }
            def find_auth_state(data, path=""):
                if isinstance(data, dict):
                    # Проверяем текущий уровень - может быть DetailsSelectName и DetailsValue
                    if 'DetailsSelectName' in data and data.get('DetailsSelectName') == 'AuthorizationState':
                        return data.get('DetailsValue', '')
                    
                    # Проверяем массив Details
                    if 'Details' in data and isinstance(data['Details'], list):
                        for detail in data['Details']:
                            if isinstance(detail, dict):
                                if detail.get('DetailsSelectName') == 'AuthorizationState':
                                    return detail.get('DetailsValue', '')
                    
                    # Рекурсивно ищем во вложенных структурах
                    for key, value in data.items():
                        result = find_auth_state(value, f"{path}.{key}")
                        if result is not None:
                            return result
                elif isinstance(data, list):
                    for i, item in enumerate(data):
                        result = find_auth_state(item, f"{path}[{i}]")
                        if result is not None:
                            return result
                return None
            
            auth_state = find_auth_state(response_data)
            
            logger.info(f"AuthorizationState: {auth_state}")
            
            # Если AuthorizationState пустое, авторизация успешна
            if auth_state == '' or auth_state is None:
                logger.info("=== XML API АВТОРИЗАЦИЯ УСПЕШНА ===")
                # Сохраняем информацию о пользователе из ответа
                # В будущем можно использовать для получения дополнительных данных
                self.access_token = "XML_API_AUTHENTICATED"  # Заглушка, так как XML API может не использовать токены
                return True
            else:
                logger.error(f"=== XML API АВТОРИЗАЦИЯ НЕУДАЧНА: {auth_state} ===")
                return False
                
        except Exception as e:
            logger.error(f"Ошибка при XML API авторизации: {str(e)}", exc_info=True)
            print(f"Ошибка: {str(e)}")
            import traceback
            print(traceback.format_exc())
            return False
    
    def _xml_to_dict(self, element: ET.Element) -> Dict[str, Any]:
        """
        Преобразует XML элемент в словарь
        
        Args:
            element: XML элемент
            
        Returns:
            Словарь с данными из XML
        """
        result = {}
        
        # Если у элемента есть текст и нет дочерних элементов
        if len(element) == 0:
            return element.text
        
        # Обрабатываем дочерние элементы
        children = {}
        details_list = []
        
        for child in element:
            if child.tag == 'Details':
                # Для Details создаем список словарей
                detail_dict = {}
                for detail_child in child:
                    detail_dict[detail_child.tag] = detail_child.text
                details_list.append(detail_dict)
            elif child.tag == 'Request':
                # Для Request создаем словарь
                request_dict = {}
                for request_child in child:
                    request_dict[request_child.tag] = request_child.text
                children['Request'] = request_dict
            else:
                # Для остальных элементов рекурсивно обрабатываем
                if len(child) == 0:
                    children[child.tag] = child.text
                else:
                    children[child.tag] = self._xml_to_dict(child)
        
        # Если есть Details, добавляем их как список
        if details_list:
            children['Details'] = details_list
        
        # Если это корневой элемент RequestDS, возвращаем его содержимое
        if element.tag == 'RequestDS':
            return children
        
        result[element.tag] = children if children else element.text
        return result
    
    async def _authenticate_with_playwright(self, base_url: str) -> Optional[str]:
        """
        Альтернативный метод авторизации через Playwright (полная имитация браузера)
        
        Args:
            base_url: Базовый URL сервиса
            
        Returns:
            Access token или None, если не удалось авторизоваться
        """
        print(f"\n{'='*80}")
        print(f"=== _authenticate_with_playwright НАЧАЛО ===")
        print(f"base_url: {base_url}")
        print(f"username: {self.username}")
        print(f"{'='*80}\n")
        
        logger.info("=== ЗАПУСК PLAYWRIGHT ДЛЯ АВТОРИЗАЦИИ ===")
        try:
            print("Импортируем playwright.async_api...")
            from playwright.async_api import async_playwright
            print("Playwright импортирован успешно")
            logger.info("Playwright импортирован успешно")
        except ImportError as import_error:
            print(f"ОШИБКА: Playwright не установлен: {str(import_error)}")
            logger.error(f"Playwright не установлен: {str(import_error)}. Установите: pip install playwright && python -m playwright install chromium")
            return None
        
        try:
            import asyncio
            print("Инициализация Playwright...")
            logger.info("Инициализация Playwright...")
            async with async_playwright() as p:
                print("Запуск браузера Chromium...")
                logger.info("Запуск браузера Chromium...")
                # Запускаем браузер в headless режиме с максимальным скрытием признаков автоматизации
                browser = await p.chromium.launch(
                    headless=True,
                    args=[
                        '--disable-blink-features=AutomationControlled',
                        '--disable-dev-shm-usage',
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-web-security',
                        '--disable-features=IsolateOrigins,site-per-process',
                        '--disable-site-isolation-trials',
                    ]
                )
                print("Браузер запущен, создаем контекст...")
                logger.info("Браузер запущен, создаем контекст...")
                context = await browser.new_context(
                    viewport={'width': 1920, 'height': 1080},
                    user_agent="Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36",
                    locale="ru-RU",
                    timezone_id="Europe/Moscow",
                    # Устанавливаем заголовки, которые есть в реальном браузере
                    extra_http_headers={
                        "Accept": "application/json, text/plain, */*",
                        "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
                        "Accept-Encoding": "gzip, deflate",
                        "Cache-Control": "no-cache",
                        "Pragma": "no-cache",
                        "Connection": "keep-alive",
                    },
                    # Скрываем признаки автоматизации
                    java_script_enabled=True,
                    bypass_csp=True,
                )
                
                # Добавляем скрипт для скрытия WebDriver флагов
                await context.add_init_script("""
                    Object.defineProperty(navigator, 'webdriver', {
                        get: () => undefined
                    });
                    
                    // Переопределяем plugins
                    Object.defineProperty(navigator, 'plugins', {
                        get: () => [1, 2, 3, 4, 5]
                    });
                    
                    // Переопределяем languages
                    Object.defineProperty(navigator, 'languages', {
                        get: () => ['ru-RU', 'ru', 'en-US', 'en']
                    });
                    
                    // Переопределяем permissions
                    const originalQuery = window.navigator.permissions.query;
                    window.navigator.permissions.query = (parameters) => (
                        parameters.name === 'notifications' ?
                            Promise.resolve({ state: Notification.permission }) :
                            originalQuery(parameters)
                    );
                """)
                print("Скрипты для скрытия автоматизации добавлены")
                page = await context.new_page()
                print("Страница создана")
                logger.info("Страница создана")
                
                # Перехватываем и модифицируем запросы, чтобы они выглядели как из реального браузера
                async def handle_route(route):
                    request = route.request
                    # Модифицируем только запросы к /api/auth/login
                    if '/api/auth/login' in request.url:
                        print(f"Перехвачен запрос к /api/auth/login, модифицируем заголовки...")
                        headers = request.headers.copy()
                        # Убеждаемся, что все заголовки точно как в реальном браузере
                        headers['accept'] = 'application/json, text/plain, */*'
                        headers['accept-encoding'] = 'gzip, deflate'
                        headers['accept-language'] = 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7'
                        headers['cache-control'] = 'no-cache'
                        headers['connection'] = 'keep-alive'
                        headers['content-type'] = 'application/json;charset=UTF-8'
                        headers['origin'] = base_url
                        headers['pragma'] = 'no-cache'
                        headers['referer'] = f'{base_url}/login'
                        headers['user-agent'] = 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36'
                        
                        await route.continue_(headers=headers)
                    else:
                        await route.continue_()
                
                await page.route('**/*', handle_route)
                print("Route interception настроен")
                
                try:
                    # Перехватываем ответ от API при авторизации
                    token_from_response = None
                    response_received = asyncio.Event()
                    all_responses = []
                    
                    async def handle_response(response):
                        nonlocal token_from_response
                        url = response.url
                        status = response.status
                        all_responses.append({"url": url, "status": status})
                        
                        # Логируем только важные ответы (не все статические ресурсы)
                        if '/api/' in url or 'captcha' in url.lower():
                            print(f"Получен ответ: {status} от {url}")
                            logger.info(f"Получен ответ: {status} от {url}")
                        
                        if '/api/auth/login' in url:
                            print(f"!!! Это ответ от /api/auth/login: статус {status} !!!")
                            logger.info(f"Получен ответ от /api/auth/login: статус {status}")
                            if status == 200:
                                try:
                                    data = await response.json()
                                    token_from_response = data.get('accessToken') or data.get('token')
                                    print(f"!!! ТОКЕН ПОЛУЧЕН ИЗ ОТВЕТА: {token_from_response[:50] if token_from_response else 'None'}... !!!")
                                    logger.info("Токен получен из ответа API через Playwright")
                                    response_received.set()
                                except Exception as e:
                                    print(f"Ошибка при парсинге ответа: {str(e)}")
                                    logger.warning(f"Ошибка при парсинге ответа: {str(e)}")
                            elif status == 403:
                                try:
                                    error_text = await response.text()
                                    print(f"!!! API вернул 403 Forbidden: {error_text[:500]} !!!")
                                    logger.error(f"API вернул 403 Forbidden: {error_text[:500]}")
                                    # Проверяем, не связана ли ошибка с капчей
                                    if 'captcha' in error_text.lower() or 'капча' in error_text.lower():
                                        print(f"!!! ОШИБКА СВЯЗАНА С КАПЧЕЙ !!!")
                                        logger.error("Ошибка 403 связана с капчей")
                                except:
                                    logger.warning(f"API вернул статус {status}")
                            else:
                                try:
                                    error_text = await response.text()
                                    print(f"API вернул статус {status}: {error_text[:200]}")
                                    logger.warning(f"API вернул статус {status}: {error_text[:200]}")
                                except:
                                    logger.warning(f"API вернул статус {status}")
                    
                    page.on("response", handle_response)
                    
                    # Открываем страницу логина
                    print(f"Открываем страницу логина: {base_url}/login")
                    logger.info("Открываем страницу логина через Playwright")
                    await page.goto(f"{base_url}/login", wait_until="domcontentloaded", timeout=30000)
                    
                    # Устанавливаем cookie rememberMe после загрузки страницы
                    try:
                        await context.add_cookies([{
                            "name": "rememberMe",
                            "value": "false",
                            "domain": "176.222.217.51",
                            "path": "/",
                        }])
                        print("Cookie rememberMe=false установлен")
                    except Exception as cookie_error:
                        print(f"Не удалось установить cookie rememberMe: {str(cookie_error)}")
                        # Пробуем установить через JavaScript
                        try:
                            await page.evaluate('() => { document.cookie = "rememberMe=false; path=/"; }')
                            print("Cookie rememberMe=false установлен через JavaScript")
                        except:
                            pass
                    
                    print(f"Страница загружена, ждем выполнения JavaScript...")
                    # Ждем, пока страница загрузится и выполнится JavaScript
                    # Не ждем networkidle, так как на странице могут быть постоянные запросы
                    try:
                        await page.wait_for_load_state("networkidle", timeout=5000)
                        print(f"Networkidle достигнут")
                    except:
                        print(f"Networkidle не достигнут за 5 сек, продолжаем...")
                        pass
                    
                    # Ждем, пока появятся поля для ввода
                    try:
                        await page.wait_for_selector('input[type="text"], input[name="username"]', timeout=10000)
                        print(f"Поля для ввода найдены")
                    except:
                        print(f"Поля для ввода не найдены, продолжаем...")
                        pass
                    
                    await asyncio.sleep(3)  # Дополнительная задержка для выполнения JS
                    print(f"Страница готова, проверяем наличие капчи...")
                    
                    # Проверяем наличие капчи на странице
                    captcha_found = False
                    try:
                        # Проверяем наличие элементов капчи Yandex
                        captcha_selectors = [
                            '[data-captcha]',
                            '.yandex-captcha',
                            '#captcha',
                            'iframe[src*="captcha"]',
                            'iframe[src*="yandex"]',
                        ]
                        for selector in captcha_selectors:
                            count = await page.locator(selector).count()
                            if count > 0:
                                captcha_found = True
                                print(f"!!! ОБНАРУЖЕНА КАПЧА: {selector} !!!")
                                logger.warning(f"Обнаружена капча на странице: {selector}")
                                break
                        
                        # Также проверяем через JavaScript
                        if not captcha_found:
                            has_captcha = await page.evaluate('''() => {
                                return !!(
                                    document.querySelector('[data-captcha]') ||
                                    document.querySelector('.yandex-captcha') ||
                                    document.querySelector('#captcha') ||
                                    document.querySelector('iframe[src*="captcha"]') ||
                                    document.querySelector('iframe[src*="yandex"]') ||
                                    window.yandexCaptcha ||
                                    document.body.innerText.includes('капча') ||
                                    document.body.innerText.includes('captcha')
                                );
                            }''')
                            if has_captcha:
                                captcha_found = True
                                print(f"!!! ОБНАРУЖЕНА КАПЧА (через JS проверку) !!!")
                                logger.warning("Обнаружена капча на странице (через JS проверку)")
                    except Exception as captcha_check_error:
                        print(f"Ошибка при проверке капчи: {str(captcha_check_error)}")
                    
                    if captcha_found:
                        print(f"!!! ВНИМАНИЕ: На странице обнаружена капча! Автоматическая авторизация невозможна. !!!")
                        logger.error("На странице обнаружена капча. Автоматическая авторизация невозможна.")
                        await browser.close()
                        return None
                    
                    print(f"Капча не обнаружена, пробуем прямой вызов API...")
                    
                    # Пробуем прямой вызов API через JavaScript в браузере
                    print(f"Пробуем прямой вызов API через JavaScript в браузере")
                    logger.info("Пробуем прямой вызов API через JavaScript в браузере")
                    try:
                        # Используем полный URL для fetch
                        full_login_url = f"{base_url}/api/auth/login"
                        print(f"Вызываем fetch для: {full_login_url}")
                        # Используем правильный синтаксис для page.evaluate с async функцией
                        # Передаем аргументы как отдельные параметры
                        js_code = f'''
                        async () => {{
                            try {{
                                const username = {repr(self.username)};
                                const password = {repr(self.password)};
                                const loginUrl = {repr(full_login_url)};
                                
                                // Устанавливаем cookie rememberMe, если его нет
                                if (!document.cookie.includes('rememberMe')) {{
                                    document.cookie = 'rememberMe=false; path=/';
                                }}
                                
                                console.log('Начинаем fetch к:', loginUrl);
                                console.log('Cookies:', document.cookie);
                                
                                const response = await fetch(loginUrl, {{
                                    method: 'POST',
                                    headers: {{
                                        'Content-Type': 'application/json;charset=UTF-8',
                                        'Accept': 'application/json, text/plain, */*',
                                        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
                                        'Accept-Encoding': 'gzip, deflate',
                                        'Cache-Control': 'no-cache',
                                        'Pragma': 'no-cache',
                                        'Connection': 'keep-alive',
                                        'Origin': window.location.origin,
                                        'Referer': window.location.href
                                    }},
                                    credentials: 'include',
                                    body: JSON.stringify({{
                                        username: username,
                                        password: password,
                                        isAdminLogin: false
                                    }})
                                }});
                                
                                console.log('Получен ответ:', response.status, response.statusText);
                                
                                if (response.ok) {{
                                    const data = await response.json();
                                    console.log('Данные получены:', Object.keys(data));
                                    return {{ success: true, token: data.accessToken || data.token || null }};
                                }} else {{
                                    const errorText = await response.text();
                                    console.error('Login failed:', response.status, errorText);
                                    return {{ success: false, status: response.status, error: errorText }};
                                }}
                            }} catch (error) {{
                                console.error('Login error:', error);
                                return {{ success: false, error: error.toString() }};
                            }}
                        }}
                        '''
                        result = await page.evaluate(js_code)
                        
                        print(f"Результат прямого вызова API: {result}")
                        if result and result.get('success') and result.get('token'):
                            token = result['token']
                            print(f"!!! ТОКЕН ПОЛУЧЕН ЧЕРЕЗ ПРЯМОЙ ВЫЗОВ API !!!")
                            logger.info("Токен получен через прямой вызов API из браузера")
                            await browser.close()
                            return token
                        else:
                            error_info = result.get('error', 'Unknown error') if result else 'No result'
                            status = result.get('status', 'Unknown') if result else 'Unknown'
                            print(f"Прямой вызов API не удался: status={status}, error={error_info}")
                            logger.warning(f"Прямой вызов API вернул ошибку: status={status}, error={error_info}")
                    except Exception as api_error:
                        print(f"ОШИБКА при прямом вызове API: {str(api_error)}")
                        logger.warning(f"Прямой вызов API не сработал: {str(api_error)}", exc_info=True)
                    
                    # Если прямой вызов не сработал, пробуем через форму
                    print(f"Пробуем авторизацию через форму на странице...")
                    logger.info("Пробуем авторизацию через форму на странице")
                    
                    # Ищем и заполняем поля для ввода
                    # Пробуем найти все input поля
                    inputs = await page.query_selector_all('input')
                    print(f"Найдено input полей на странице: {len(inputs)}")
                    logger.info(f"Найдено input полей на странице: {len(inputs)}")
                    
                    # Выводим информацию о всех полях для отладки
                    for i, input_elem in enumerate(inputs):
                        input_type = await input_elem.get_attribute('type')
                        input_name = await input_elem.get_attribute('name')
                        input_id = await input_elem.get_attribute('id')
                        placeholder = await input_elem.get_attribute('placeholder')
                        print(f"  Input {i}: type={input_type}, name={input_name}, id={input_id}, placeholder={placeholder}")
                    
                    username_filled = False
                    password_filled = False
                    
                    for input_elem in inputs:
                        input_type = await input_elem.get_attribute('type')
                        input_name = await input_elem.get_attribute('name')
                        input_id = await input_elem.get_attribute('id')
                        placeholder = await input_elem.get_attribute('placeholder')
                        
                        # Заполняем поле username с реальными событиями
                        if not username_filled and (input_type == 'text' or input_type is None or input_type == 'email'):
                            if input_name and ('user' in input_name.lower() or 'login' in input_name.lower()):
                                # Используем реальные события для более естественного ввода
                                await input_elem.click()
                                await asyncio.sleep(0.1)
                                await input_elem.type(self.username, delay=50)  # Задержка между символами
                                username_filled = True
                                print(f"Заполнено поле username через name: {input_name}")
                                logger.info(f"Заполнено поле username через name: {input_name}")
                            elif input_id and ('user' in input_id.lower() or 'login' in input_id.lower()):
                                await input_elem.click()
                                await asyncio.sleep(0.1)
                                await input_elem.type(self.username, delay=50)
                                username_filled = True
                                print(f"Заполнено поле username через id: {input_id}")
                                logger.info(f"Заполнено поле username через id: {input_id}")
                            elif placeholder and ('логин' in placeholder.lower() or 'login' in placeholder.lower() or 'user' in placeholder.lower()):
                                await input_elem.click()
                                await asyncio.sleep(0.1)
                                await input_elem.type(self.username, delay=50)
                                username_filled = True
                                print(f"Заполнено поле username через placeholder: {placeholder}")
                                logger.info(f"Заполнено поле username через placeholder: {placeholder}")
                            elif not username_filled and input_type != 'password':
                                # Берем первое текстовое поле
                                await input_elem.click()
                                await asyncio.sleep(0.1)
                                await input_elem.type(self.username, delay=50)
                                username_filled = True
                                print(f"Заполнено первое текстовое поле как username (type={input_type})")
                                logger.info("Заполнено первое текстовое поле как username")
                        
                        # Заполняем поле password с реальными событиями
                        if not password_filled and input_type == 'password':
                            await input_elem.click()
                            await asyncio.sleep(0.1)
                            await input_elem.type(self.password, delay=50)
                            password_filled = True
                            print(f"Заполнено поле password")
                            logger.info("Заполнено поле password")
                    
                    print(f"Результат заполнения: username={username_filled}, password={password_filled}")
                    if not username_filled or not password_filled:
                        logger.warning(f"Не удалось найти поля: username={username_filled}, password={password_filled}")
                    
                    # Даем время на обработку полей
                    await asyncio.sleep(0.5)
                    
                    # Ищем и нажимаем кнопку входа
                    button_clicked = False
                    button_selectors = [
                        'button[type="submit"]',
                        'button:has-text("Войти")',
                        'button:has-text("Login")',
                        'form button[type="button"]',
                        'form button',
                        'button',
                    ]
                    
                    print(f"Ищем кнопку для отправки формы...")
                    for selector in button_selectors:
                        try:
                            count = await page.locator(selector).count()
                            print(f"  Селектор {selector}: найдено {count} элементов")
                            if count > 0:
                                # Пробуем несколько способов клика
                                try:
                                    # Способ 1: Обычный клик
                                    await page.locator(selector).first.click(timeout=5000)
                                    button_clicked = True
                                    print(f"Нажата кнопка через click: {selector}")
                                    logger.info(f"Нажата кнопка: {selector}")
                                    break
                                except:
                                    try:
                                        # Способ 2: JavaScript click
                                        await page.locator(selector).first.evaluate('el => el.click()')
                                        button_clicked = True
                                        print(f"Нажата кнопка через JS click: {selector}")
                                        logger.info(f"Нажата кнопка через JS: {selector}")
                                        break
                                    except:
                                        continue
                        except Exception as click_error:
                            print(f"Ошибка при поиске кнопки {selector}: {str(click_error)}")
                            logger.debug(f"Не удалось нажать кнопку {selector}: {str(click_error)}")
                            continue
                    
                    if not button_clicked:
                        # Пробуем нажать Enter в поле пароля
                        try:
                            print(f"Пробуем нажать Enter в поле пароля...")
                            await page.press('input[type="password"]', 'Enter')
                            button_clicked = True
                            print(f"Нажат Enter в поле пароля")
                            logger.info("Нажат Enter в поле пароля")
                        except Exception as enter_error:
                            print(f"Не удалось нажать Enter: {str(enter_error)}")
                            pass
                    
                    print(f"Кнопка нажата: {button_clicked}, ждем ответа от API...")
                    
                    # Если кнопка не нажата, пробуем отправить форму через JavaScript
                    if not button_clicked:
                        try:
                            print(f"Пробуем отправить форму через JavaScript submit...")
                            await page.evaluate('() => { const form = document.querySelector("form"); if (form) form.submit(); }')
                            print(f"Форма отправлена через JS submit")
                        except Exception as submit_error:
                            print(f"Не удалось отправить форму через JS: {str(submit_error)}")
                    
                    # Ждем ответа от API (максимум 15 секунд)
                    try:
                        print(f"Ожидание ответа от API (таймаут 15 сек)...")
                        await asyncio.wait_for(response_received.wait(), timeout=15.0)
                        print(f"Получен ответ от API!")
                    except asyncio.TimeoutError:
                        print(f"Таймаут ожидания ответа от API")
                        print(f"Всего получено ответов: {len(all_responses)}")
                        for resp in all_responses:
                            print(f"  - {resp['status']} от {resp['url']}")
                        logger.warning("Таймаут ожидания ответа от API")
                    
                    # Даем еще немного времени на обработку
                    await asyncio.sleep(3)
                    
                    # Пробуем получить токен из различных источников
                    token = token_from_response
                    print(f"Токен из перехваченного ответа: {'есть' if token else 'нет'}")
                    
                    # 1. Из localStorage
                    if not token:
                        try:
                            print(f"Проверяем localStorage...")
                            token = await page.evaluate('() => localStorage.getItem("accessToken") || localStorage.getItem("token")')
                            if token:
                                print(f"!!! ТОКЕН ПОЛУЧЕН ИЗ LOCALSTORAGE !!!")
                                logger.info("Токен получен из localStorage")
                        except Exception as e:
                            print(f"Ошибка при чтении localStorage: {str(e)}")
                            pass
                    
                    # 2. Из cookies
                    if not token:
                        try:
                            print(f"Проверяем cookies...")
                            cookies = await context.cookies()
                            print(f"Найдено cookies: {len(cookies)}")
                            for cookie in cookies:
                                print(f"Cookie: {cookie['name']} = {cookie['value'][:50]}...")
                                if 'token' in cookie['name'].lower() or 'access' in cookie['name'].lower():
                                    token = cookie['value']
                                    print(f"!!! ТОКЕН ПОЛУЧЕН ИЗ COOKIE: {cookie['name']} !!!")
                                    logger.info(f"Токен получен из cookie: {cookie['name']}")
                                    break
                        except Exception as e:
                            print(f"Ошибка при чтении cookies: {str(e)}")
                            pass
                    
                    await browser.close()
                    
                    if token:
                        print(f"!!! АВТОРИЗАЦИЯ ЧЕРЕЗ PLAYWRIGHT УСПЕШНА !!!")
                        logger.info("Авторизация через Playwright успешна")
                        return token
                    else:
                        print(f"!!! НЕ УДАЛОСЬ ПОЛУЧИТЬ ТОКЕН ЧЕРЕЗ PLAYWRIGHT !!!")
                        logger.warning("Не удалось получить токен через Playwright")
                        return None
                        
                except Exception as e:
                    print(f"\n!!! ОШИБКА В БЛОКЕ TRY PLAYWRIGHT: {str(e)} !!!")
                    import traceback
                    print(traceback.format_exc())
                    await browser.close()
                    logger.error(f"Ошибка при авторизации через Playwright: {str(e)}", exc_info=True)
                    return None
        except Exception as e:
            print(f"\n!!! ОШИБКА ПРИ ЗАПУСКЕ PLAYWRIGHT: {str(e)} !!!")
            import traceback
            print(traceback.format_exc())
            logger.error(f"Ошибка при запуске Playwright: {str(e)}", exc_info=True)
            return None
    
    async def _authenticate(self) -> None:
        """Авторизация в веб-сервисе"""
        # Нормализуем базовый URL (убираем лишние слэши и пробелы)
        base_url = self.base_url.strip().rstrip('/')
        login_url = f"{base_url}/api/auth/login"
        
        print(f"\n{'='*80}")
        print(f"=== WebAdapter._authenticate НАЧАЛО ===")
        print(f"base_url: {base_url}")
        print(f"login_url: {login_url}")
        print(f"username: {self.username}")
        print(f"use_xml_api: {self.use_xml_api}")
        print(f"{'='*80}\n")
        
        logger.info(f"=== НАЧАЛО АВТОРИЗАЦИИ В ВЕБ-СЕРВИСЕ ===", extra={
            "base_url": base_url,
            "login_url": login_url,
            "username": self.username,
            "method": "WebAdapter._authenticate",
            "use_xml_api": self.use_xml_api
        })
        
        # Для XML API с сертификатом авторизация не требуется
        if self.use_xml_api and self.xml_api_certificate:
            logger.info("Используется XML API с сертификатом - авторизация не требуется")
            self.access_token = "XML_API_CERTIFICATE"  # Заглушка для совместимости
            return
        
        # Если XML API включен, но сертификат не указан - это ошибка
        if self.use_xml_api:
            raise ValueError("Для XML API требуется указать сертификат (certificate). Логин, пароль, ключ и подпись не используются.")
        
        try:
            # Сначала делаем запрос к странице логина для получения cookies/CSRF токена
            # Это имитирует поведение браузера - пользователь сначала открывает страницу логина
            import asyncio
            import re
            csrf_token = None
            
            try:
                login_page_url = f"{base_url}/login"
                # Используем тот же User-Agent, что и в браузере пользователя
                login_page_headers = {
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                    "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
                    "User-Agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36",
                    "Cache-Control": "no-cache",
                    "Pragma": "no-cache",
                    "Connection": "keep-alive",
                }
                # Получаем страницу логина для установки cookies
                login_page_response = await self.client.get(login_page_url, headers=login_page_headers)
                
                # Пытаемся извлечь CSRF токен из HTML (если есть)
                if login_page_response.status_code == 200:
                    html_content = login_page_response.text
                    # Ищем CSRF токен в различных форматах
                    csrf_patterns = [
                        r'name=["\']_token["\']\s+value=["\']([^"\']+)["\']',
                        r'csrf[_-]?token["\']?\s*[:=]\s*["\']([^"\']+)["\']',
                        r'X-CSRF-TOKEN["\']?\s*[:=]\s*["\']([^"\']+)["\']',
                        r'<meta\s+name=["\']csrf-token["\']\s+content=["\']([^"\']+)["\']',
                    ]
                    for pattern in csrf_patterns:
                        match = re.search(pattern, html_content, re.IGNORECASE)
                        if match:
                            csrf_token = match.group(1)
                            logger.debug(f"Найден CSRF токен в HTML страницы логина")
                            break
                
                logger.info(f"Получена страница логина для установки cookies", extra={
                    "status_code": login_page_response.status_code,
                    "cookies_count": len(login_page_response.cookies),
                    "cookies": dict(login_page_response.cookies),
                    "set_cookie_headers": login_page_response.headers.get_list("Set-Cookie", []),
                    "has_csrf_token": bool(csrf_token)
                })
                
                # Увеличиваем задержку, чтобы имитировать поведение пользователя (чтение страницы)
                await asyncio.sleep(1.0)
            except Exception as e:
                # Игнорируем ошибки при получении страницы логина, продолжаем авторизацию
                logger.warning(f"Не удалось получить страницу логина: {str(e)}")
            
            # Имитируем заголовки браузера точно как в реальном запросе
            # Используем тот же User-Agent, что и в браузере пользователя
            headers = {
                "Accept": "application/json, text/plain, */*",
                "Accept-Encoding": "gzip, deflate",
                "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
                "Content-Type": "application/json;charset=UTF-8",
                "Origin": base_url,
                "Referer": f"{base_url}/login",
                "User-Agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36",
                "Cache-Control": "no-cache",
                "Pragma": "no-cache",
                "Connection": "keep-alive",
            }
            
            # Добавляем CSRF токен в заголовки, если он был найден
            if csrf_token:
                headers["X-CSRF-TOKEN"] = csrf_token
                headers["X-Requested-With"] = "XMLHttpRequest"
            
            # Подготавливаем данные для отправки (кириллица будет автоматически закодирована в UTF-8)
            login_data = {
                'username': self.username,
                'password': self.password,
                'isAdminLogin': False  # Сервер требует это поле
            }
            
            # Логируем все cookies перед отправкой
            all_cookies = dict(self.client.cookies)
            logger.info(f"Отправка запроса авторизации", extra={
                "url": login_url,
                "headers": {k: v for k, v in headers.items() if k not in ['User-Agent']},  # Не логируем полный User-Agent
                "cookies_count": len(all_cookies),
                "cookies": all_cookies,
                "username": self.username,
                "password_length": len(self.password),
                "login_data": {k: v if k != 'password' else '***' for k, v in login_data.items()}
            })
            
            # httpx автоматически кодирует JSON в UTF-8 при использовании параметра json=
            # И автоматически отправляет все cookies, которые были получены ранее
            logger.info("Отправка POST запроса на авторизацию...")
            response = await self.client.post(
                login_url,
                json=login_data,
                headers=headers
            )
            
            logger.info(f"Получен ответ: статус {response.status_code}")
            
            # Playwright отключен - используем только XML API или JSON API
            # Если получили 403, просто выбрасываем ошибку
            if response.status_code == 403:
                logger.error("=== ПОЛУЧЕН 403 FORBIDDEN ===")
                logger.error(f"Тело ответа: {response.text[:500]}")
                logger.warning("Playwright отключен. Убедитесь, что используются правильные параметры XML API (ключ и подпись)")
                response.raise_for_status()
            
            response.raise_for_status()
            data = response.json()
            self.access_token = data.get('accessToken')
            if not self.access_token:
                raise ValueError("Не получен токен доступа при авторизации")
            logger.info("Авторизация в веб-сервисе успешна", extra={
                "base_url": base_url,
                "has_token": bool(self.access_token)
            })
        except httpx.HTTPStatusError as e:
            error_detail = ""
            response_headers = {}
            try:
                error_detail = e.response.text[:1000]
                response_headers = dict(e.response.headers)
            except:
                pass
            
            # Детальное логирование для диагностики проблемы 403
            logger.error(f"Ошибка HTTP при авторизации: {e.response.status_code}", extra={
                "url": login_url,
                "status_code": e.response.status_code,
                "response_text": error_detail,
                "response_headers": response_headers,
                "request_headers": {k: v for k, v in headers.items() if k not in ['User-Agent']},
                "cookies_before_request": dict(self.client.cookies),
                "request_body": {k: v if k != 'password' else '***' for k, v in login_data.items()},
                "base_url": base_url
            })
            
            # Если это 403, пробуем несколько альтернативных подходов (без Playwright)
            if e.response.status_code == 403:
                logger.error("=== В БЛОКЕ EXCEPT: ПОЛУЧЕН 403 FORBIDDEN ===")
                logger.warning("Получен 403 Forbidden, пробуем альтернативные подходы (Playwright отключен)")
                
                # Подход 1: Без предварительного запроса к странице логина
                try:
                    logger.info("Пробуем подход 1: Прямой запрос без предварительного получения страницы логина")
                    alt_client = httpx.AsyncClient(
                        timeout=30.0,
                        follow_redirects=True,
                        headers={
                            "Accept": "application/json, text/plain, */*",
                            "Accept-Encoding": "gzip, deflate",
                            "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
                            "Content-Type": "application/json;charset=UTF-8",
                            "Origin": base_url,
                            "Referer": f"{base_url}/login",
                            "User-Agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36",
                            "Cache-Control": "no-cache",
                            "Pragma": "no-cache",
                            "Connection": "keep-alive",
                        }
                    )
                    
                    alt_response = await alt_client.post(
                        login_url,
                        json=login_data,
                    )
                    alt_response.raise_for_status()
                    alt_data = alt_response.json()
                    self.access_token = alt_data.get('accessToken')
                    if self.access_token:
                        await alt_client.aclose()
                        logger.info("Подход 1 сработал: авторизация успешна без предварительного запроса")
                        return
                    await alt_client.aclose()
                except Exception as alt_error:
                    logger.warning(f"Подход 1 не сработал: {str(alt_error)}")
                
                # Подход 2: Использование form-data вместо JSON
                try:
                    logger.info("Пробуем подход 2: Отправка данных как form-data")
                    form_client = httpx.AsyncClient(
                        timeout=30.0,
                        follow_redirects=True,
                        headers={
                            "Accept": "application/json, text/plain, */*",
                            "Accept-Encoding": "gzip, deflate",
                            "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
                            "Content-Type": "application/x-www-form-urlencoded",
                            "Origin": base_url,
                            "Referer": f"{base_url}/login",
                            "User-Agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36",
                            "Cache-Control": "no-cache",
                            "Pragma": "no-cache",
                            "Connection": "keep-alive",
                        }
                    )
                    
                    # Отправляем как form-data
                    form_data = {
                        'username': self.username,
                        'password': self.password,
                        'isAdminLogin': 'false'
                    }
                    
                    form_response = await form_client.post(
                        login_url,
                        data=form_data,
                    )
                    form_response.raise_for_status()
                    form_data_result = form_response.json()
                    self.access_token = form_data_result.get('accessToken')
                    if self.access_token:
                        await form_client.aclose()
                        logger.info("Подход 2 сработал: авторизация успешна с form-data")
                        return
                    await form_client.aclose()
                except Exception as form_error:
                    logger.warning(f"Подход 2 не сработал: {str(form_error)}")
                
                # Playwright отключен - используем только XML API или JSON API
                # Если все подходы не сработали, выбрасываем исходную ошибку
                logger.error("Все альтернативные подходы не сработали, возвращаем исходную ошибку 403")
                logger.warning("Убедитесь, что используются правильные параметры XML API (ключ и подпись) в настройках подключения")
            
            raise
        except httpx.RequestError as e:
            logger.error(f"Ошибка запроса при авторизации: {str(e)}", extra={
                "url": login_url,
                "error_type": type(e).__name__
            })
            raise
    
    def _auth_headers(self) -> Dict[str, str]:
        """Формирование заголовков авторизации"""
        if not self.access_token:
            raise ValueError("Токен доступа не установлен. Выполните авторизацию.")
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
    
    async def _get_json(
        self,
        path: str,
        params: Optional[Dict[str, Any]] = None
    ) -> Any:
        """
        Выполнение GET запроса к API
        
        Args:
            path: Путь API endpoint
            params: Параметры запроса
            
        Returns:
            Ответ API в виде словаря или списка
            
        Raises:
            httpx.HTTPError: при ошибке HTTP запроса
        """
        headers = self._auth_headers()
        # Добавляем заголовки Origin и Referer для имитации браузера
        headers.update({
            "Origin": self.base_url,
            "Referer": f"{self.base_url}/login",
        })
        url = f"{self.base_url}{path}"
        
        try:
            response = await self.client.get(url, headers=headers, params=params)
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
    
    async def list_cards(self) -> List[str]:
        """
        Получение списка номеров топливных карт
        
        Returns:
            Список номеров карт
        """
        # Для XML API с сертификатом список карт нужно получать отдельно
        # Пока возвращаем пустой список, так как нет отдельного endpoint для списка карт
        if self.use_xml_api and self.xml_api_certificate:
            logger.info("XML API с сертификатом: список карт нужно указывать вручную")
            return []
        
        # Для JSON API пробуем стандартный endpoint
        try:
            cards = await self._get_json("/api/cards")
            # API возвращает список чисел, преобразуем в строки
            if isinstance(cards, list):
                return [str(card) for card in cards if card is not None]
            return []
        except Exception as e:
            logger.warning(f"Не удалось получить список карт: {str(e)}")
            return []
    
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
        # Если используется XML API с сертификатом, используем XML метод
        if self.use_xml_api and self.xml_api_certificate:
            return await self._fetch_transactions_xml_api([card_number], date_from, date_to)
        
        # Для JSON API пробуем стандартный endpoint
        try:
            cards = await self._get_json("/api/cards")
            # Если есть endpoint для транзакций, используем его
            # Пока возвращаем пустой список, так как endpoint не найден
            logger.warning("API endpoint для транзакций не найден (JSON API)", extra={
                "card_number": card_number,
                "date_from": str(date_from),
                "date_to": str(date_to)
            })
            return []
        except Exception as e:
            logger.error(f"Ошибка при получении транзакций: {str(e)}")
            return []
    
    def _create_xml_card_info_request(
        self,
        card_number: str,
        certificate: str,
        pos_code: Optional[int] = None,
        flags: int = 23
    ) -> str:
        """
        Создает XML запрос для получения информации по карте (команда getinfo)
        
        Args:
            card_number: Номер карты
            certificate: Сертификат для доступа к API
            pos_code: Код POS (опционально, по умолчанию используется self.xml_api_pos_code)
            flags: Битовая маска реквизитов (1=FirstName, 2=LastName, 4=Patronymic, 8=BirthDate, 16=PhoneNumber, 32=Sex)
                  По умолчанию 23 (1+2+4+16) = ФИО + телефон
        
        Returns:
            XML строка запроса в кодировке UTF-8 без BOM
        """
        xml_request = ET.Element('RequestDS')
        
        # Элемент Request
        request_elem = ET.SubElement(xml_request, 'Request')
        ET.SubElement(request_elem, 'Command').text = 'getinfo'
        ET.SubElement(request_elem, 'Version').text = '1'
        ET.SubElement(request_elem, 'Certificate').text = certificate
        # POSCode добавляем только если указан
        if pos_code is not None:
            ET.SubElement(request_elem, 'POSCode').text = str(pos_code)
        
        # Элемент Card
        card_elem = ET.SubElement(xml_request, 'Card')
        ET.SubElement(card_elem, 'CardNumber').text = card_number
        ET.SubElement(card_elem, 'Flags').text = str(flags)
        
        # Преобразуем в строку без BOM
        ET.indent(xml_request, space='  ')
        xml_string = ET.tostring(xml_request, encoding='utf-8', xml_declaration=True).decode('utf-8')
        return xml_string
    
    async def get_card_info(
        self,
        card_number: str,
        flags: int = 23
    ) -> Dict[str, Any]:
        """
        Получение информации по карте через XML API (команда getinfo)
        
        Args:
            card_number: Номер карты
            flags: Битовая маска реквизитов (1=FirstName, 2=LastName, 4=Patronymic, 8=BirthDate, 16=PhoneNumber, 32=Sex)
                  По умолчанию 23 (1+2+4+16) = ФИО + телефон
        
        Returns:
            Словарь с информацией по карте
        
        Raises:
            ValueError: если не указан сертификат или не используется XML API
            httpx.HTTPError: при ошибке HTTP запроса
        """
        if not self.use_xml_api:
            raise ValueError("Метод get_card_info доступен только для XML API")
        
        if not self.xml_api_certificate:
            raise ValueError("Сертификат не указан для XML API")
        
        # Используем xml_api_pos_code если он указан, иначе None
        pos_code = self.xml_api_pos_code
        
        # Создаем XML запрос
        xml_request = self._create_xml_card_info_request(
            card_number=card_number,
            certificate=self.xml_api_certificate,
            pos_code=pos_code,
            flags=flags
        )
        
        logger.info(f"Запрос информации по карте: {card_number}", extra={
            "card_number": card_number,
            "flags": flags,
            "pos_code": pos_code,
            "base_url": self.base_url,
            "xml_api_endpoint": self.xml_api_endpoint
        })
        
        # Определяем endpoint для запроса информации по карте
        # Для команды getinfo всегда используем /sncapi/card, независимо от xml_api_endpoint
        # (который может быть настроен для транзакций /sncapi/sale)
        base = self.base_url.rstrip('/')
        url = f"{base}/sncapi/card"
        
        # Валидация URL
        if not url.startswith('http://') and not url.startswith('https://'):
            raise ValueError(f"Некорректный URL: {url}. URL должен начинаться с http:// или https://")
        
        logger.debug(f"Сформированный URL для запроса информации по карте: {url}", extra={
            "card_number": card_number,
            "url": url,
            "base_url": self.base_url,
            "xml_api_endpoint": self.xml_api_endpoint
        })
        
        # Заголовки для XML API
        headers = {
            "Content-Type": "text/xml",
            "Content-Version": "2"
        }
        
        try:
            response = await self.client.post(
                url,
                content=xml_request.encode('utf-8'),
                headers=headers,
                timeout=30.0
            )
            response.raise_for_status()
            
            # Парсим XML ответ
            response_text = response.text
            
            # Убираем BOM если есть
            if response_text.startswith('\ufeff'):
                response_text = response_text[1:]
            
            # Парсим XML
            try:
                root = ET.fromstring(response_text)
                card_info = self._parse_card_info_response(root)
                logger.info(f"Информация по карте получена: {card_number}", extra={
                    "card_number": card_number,
                    "has_info": bool(card_info)
                })
                return card_info
            except ET.ParseError as e:
                logger.error(f"Ошибка парсинга XML ответа: {str(e)}", extra={
                    "card_number": card_number,
                    "response_text": response_text[:500]
                })
                raise ValueError(f"Ошибка парсинга XML ответа: {str(e)}")
                
        except httpx.HTTPStatusError as e:
            logger.error(f"Ошибка HTTP при запросе информации по карте: {e.response.status_code}", extra={
                "url": url,
                "card_number": card_number,
                "status_code": e.response.status_code,
                "response_text": e.response.text[:500]
            })
            raise
        except httpx.RequestError as e:
            logger.error(f"Ошибка запроса информации по карте: {str(e)}", extra={
                "url": url,
                "card_number": card_number
            })
            raise
    
    def _parse_card_info_response(self, root: ET.Element) -> Dict[str, Any]:
        """
        Парсит XML ответ с информацией по карте
        
        Args:
            root: Корневой XML элемент
        
        Returns:
            Словарь с информацией по карте
        """
        result = {}
        
        # Ищем элемент Card в ответе
        card_elem = root.find('.//Card')
        if card_elem is not None:
            # Парсим основные поля
            for child in card_elem:
                tag = child.tag
                text = child.text
                
                if tag == 'CardNumber':
                    result['card_number'] = text
                elif tag == 'COD_A':
                    result['cod_a'] = text
                elif tag == 'COD_OWN':
                    result['cod_own'] = text
                elif tag == 'ApplicationType':
                    result['application_type'] = int(text) if text and text.isdigit() else None
                    result['application_type_name'] = 'дисконт' if result['application_type'] == 1 else 'топливо'
                elif tag == 'ApplicationKey':
                    result['application_key'] = text
                elif tag == 'Balance':
                    result['balance'] = float(text) if text and text.replace('.', '').replace('-', '').isdigit() else 0.0
                elif tag == 'BonusProgram':
                    result['bonus_program'] = int(text) if text and text.replace('-', '').isdigit() else None
                elif tag == 'State':
                    result['state'] = int(text) if text and text.isdigit() else 0
                    result['state_name'] = self._parse_card_state(result['state'])
                elif tag == 'PersonName':
                    result['person_name'] = text
                elif tag == 'FirstName':
                    result['first_name'] = text
                elif tag == 'LastName':
                    result['last_name'] = text
                elif tag == 'Patronymic':
                    result['patronymic'] = text
                elif tag == 'BirthDate':
                    result['birth_date'] = text
                elif tag == 'PhoneNumber':
                    result['phone_number'] = text
                elif tag == 'Sex':
                    result['sex'] = text
        
        return result
    
    def _parse_card_state(self, state: int) -> str:
        """
        Парсит состояние карты из числового значения
        
        Args:
            state: Числовое значение состояния
        
        Returns:
            Текстовое описание состояния
        """
        state_map = {
            0: "работает",
            1: "заблокирована",
            2: "заблокирована",
            4: "заблокирована"
        }
        return state_map.get(state, f"неизвестно ({state})")
    
    def _create_xml_sale_request(
        self,
        date_from: date,
        date_to: date,
        certificate: str,
        pos_code: Optional[int] = None
    ) -> str:
        """
        Создает XML запрос для получения транзакций согласно спецификации СНК API
        Использует метод getsaleext с Restriction вместо getsale с Card элементами
        
        Args:
            date_from: Начальная дата периода
            date_to: Конечная дата периода
            certificate: Сертификат для доступа к API
            pos_code: Код POS (опционально, если не указан - запрос по всем POS)
            
        Returns:
            XML строка запроса в кодировке UTF-8 без BOM
        """
        xml_request = ET.Element('RequestDS')
        
        # Элемент Request
        request_elem = ET.SubElement(xml_request, 'Request')
        ET.SubElement(request_elem, 'Command').text = 'getsaleext'  # Используем getsaleext вместо getsale
        ET.SubElement(request_elem, 'Version').text = '1'
        ET.SubElement(request_elem, 'Certificate').text = certificate
        # POSCode добавляем только если указан
        if pos_code is not None:
            ET.SubElement(request_elem, 'POSCode').text = str(pos_code)
        
        # Элемент Restriction с датами (вместо Card элементов)
        restriction_elem = ET.SubElement(xml_request, 'Restriction')
        # Форматируем даты в формате "YYYY-MM-DD HH:MM:SS"
        ET.SubElement(restriction_elem, 'StartDate').text = date_from.strftime('%Y-%m-%d 00:00:00')
        ET.SubElement(restriction_elem, 'EndDate').text = date_to.strftime('%Y-%m-%d 23:59:59')
        
        # Преобразуем в строку без BOM
        ET.indent(xml_request, space='  ')
        # Используем encoding='utf-8' без BOM
        xml_string = ET.tostring(xml_request, encoding='utf-8', xml_declaration=True).decode('utf-8')
        return xml_string
    
    async def _fetch_transactions_xml_api(
        self,
        card_numbers: Optional[List[str]],
        date_from: date,
        date_to: date
    ) -> List[Dict[str, Any]]:
        """
        Получение транзакций через XML API с сертификатом
        Использует метод getsaleext и разбивает период на части по 3-4 дня для избежания ошибки 500
        
        Args:
            card_numbers: Список номеров карт (опционально, не используется в getsaleext - метод возвращает все транзакции за период)
            date_from: Начальная дата периода
            date_to: Конечная дата периода
            
        Returns:
            Список транзакций
        """
        if not self.xml_api_certificate:
            logger.error("Сертификат не указан для XML API")
            return []
        
        logger.info("Получение транзакций через XML API (getsaleext)", extra={
            "date_from": str(date_from),
            "date_to": str(date_to),
            "pos_code": self.xml_api_pos_code if self.xml_api_pos_code else "не указан (по всем POS)",
            "certificate": self.xml_api_certificate[:20] + "..." if len(self.xml_api_certificate) > 20 else self.xml_api_certificate
        })
        
        # Разбиваем период на части по 3-4 дня для избежания ошибки 500
        MAX_PERIOD_DAYS = 3  # Максимальный период запроса в днях
        all_transactions = []
        current_date = date_from
        
        while current_date <= date_to:
            # Определяем конечную дату для текущего запроса
            period_end = min(current_date + timedelta(days=MAX_PERIOD_DAYS - 1), date_to)
            
            logger.info(f"Запрос транзакций за период: {current_date} - {period_end}", extra={
                "period_start": str(current_date),
                "period_end": str(period_end),
                "days": (period_end - current_date).days + 1
            })
            
            try:
                period_transactions = await self._fetch_transactions_xml_api_period(
                    current_date,
                    period_end
                )
                all_transactions.extend(period_transactions)
                logger.info(f"Загружено транзакций за период {current_date} - {period_end}: {len(period_transactions)}")
            except Exception as e:
                logger.error(f"Ошибка при загрузке транзакций за период {current_date} - {period_end}: {str(e)}", exc_info=True)
                # Продолжаем загрузку следующих периодов даже при ошибке
                if "500" in str(e) or "Internal Server Error" in str(e):
                    logger.warning("Получена ошибка 500 - возможно период слишком большой. Продолжаем с меньшими периодами.")
            
            # Переходим к следующему периоду
            current_date = period_end + timedelta(days=1)
        
        logger.info(f"Всего загружено транзакций: {len(all_transactions)}")
        return all_transactions
    
    async def _fetch_transactions_xml_api_period(
        self,
        date_from: date,
        date_to: date
    ) -> List[Dict[str, Any]]:
        """
        Получение транзакций за один период через XML API с сертификатом
        
        Args:
            date_from: Начальная дата периода
            date_to: Конечная дата периода
            
        Returns:
            Список транзакций
        """
        try:
            # Создаем XML запрос
            # Если POS Code не указан (None или 0), отправляем запрос без POSCode (по всем POS)
            pos_code_to_use = self.xml_api_pos_code if self.xml_api_pos_code else None
            xml_request = self._create_xml_sale_request(
                date_from=date_from,
                date_to=date_to,
                certificate=self.xml_api_certificate,
                pos_code=pos_code_to_use
            )
            
            logger.info("XML запрос для получения транзакций создан", extra={
                "xml_length": len(xml_request)
            })
            print(f"\n{'='*80}")
            print(f"XML ЗАПРОС ДЛЯ ПОЛУЧЕНИЯ ТРАНЗАКЦИЙ (getsaleext):")
            print(f"{'='*80}")
            print(xml_request)
            print(f"{'='*80}\n")
            
            # Заголовки для XML API
            # Отправляем XML без BOM в кодировке UTF-8
            xml_request_bytes = xml_request.encode('utf-8')
            headers = {
                "Content-Type": "text/xml",
                "Accept": "application/xml, text/xml, */*",
                "User-Agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36",
            }
            
            # Endpoint для получения транзакций: BASE_URL/sncapi/sale
            if self.xml_api_endpoint:
                if self.xml_api_endpoint.startswith('http://') or self.xml_api_endpoint.startswith('https://'):
                    sale_endpoint = self.xml_api_endpoint
                else:
                    sale_endpoint = f"{self.base_url.rstrip('/')}/{self.xml_api_endpoint.lstrip('/')}"
            else:
                sale_endpoint = f"{self.base_url.rstrip('/')}/sncapi/sale"
            
            logger.info(f"Отправка XML запроса на {sale_endpoint}")
            response = await self.client.post(
                sale_endpoint,
                content=xml_request_bytes,
                headers=headers,
                timeout=60.0
            )
            
            logger.info(f"Получен ответ: статус {response.status_code}")
            
            # Обрабатываем ошибку 500 (слишком большой период)
            if response.status_code == 500:
                error_text = response.text[:500] if response.text else ""
                logger.error(f"Ошибка 500 Internal Server Error - возможно период слишком большой", extra={
                    "error_preview": error_text
                })
                raise Exception(f"Ошибка 500: период запроса слишком большой. Попробуйте уменьшить период до 3-4 дней.")
            
            response.raise_for_status()
            
            # Парсим XML ответ
            response_text = response.text
            logger.info(f"Размер ответа: {len(response_text)} байт")
            
            # Логируем первые 500 символов ответа для отладки
            logger.debug(f"Начало XML ответа: {response_text[:500]}")
            
            try:
                root = ET.fromstring(response_text)
                transactions = []
                
                # Ищем все элементы sale в ответе (в нижнем регистре согласно примеру)
                sale_elements = root.findall('.//sale')
                if not sale_elements:
                    # Пробуем также в верхнем регистре для совместимости
                    sale_elements = root.findall('.//Sale')
                
                logger.info(f"Найдено элементов sale в ответе: {len(sale_elements)}")
                
                for idx, sale_elem in enumerate(sale_elements):
                    transaction = {}
                    
                    # Извлекаем все поля из элемента sale
                    for child in sale_elem:
                        tag = child.tag
                        text = child.text if child.text else ""
                        
                        # Преобразуем значения в нужные типы
                        if tag in ['COD_L', 'COD_O', 'COD_A', 'COD_OWN', 'COD_AZS', 'ResourceKey', 
                                  'CollectionKey', 'VendorKey', 'WarehouseKey', 'ApplicationKey', 'TerminalRequestID']:
                            try:
                                transaction[tag] = int(text) if text else 0
                            except ValueError:
                                transaction[tag] = 0
                        elif tag in ['BonusIn', 'BonusOut', 'VOLUM', 'Volume', 'COST', 'ShopCost', 'ShopBaseCost', 'PersonCost', 'BINPC']:
                            try:
                                transaction[tag] = float(text) if text else 0.0
                            except ValueError:
                                transaction[tag] = 0.0
                        else:
                            transaction[tag] = text
                    
                    # Получаем объем (может быть VOLUM или Volume)
                    volume = transaction.get('VOLUM') or transaction.get('Volume', 0.0)
                    
                    # Игнорируем транзакции с VOLUM < 0 (возвраты)
                    if volume < 0:
                        logger.debug(f"Пропущена транзакция с отрицательным объемом: VOLUM={volume}")
                        continue
                    
                    # Преобразуем в стандартный формат транзакций
                    # В ответе getsaleext используется ID_SMP как дата/время транзакции
                    transaction_datetime_str = transaction.get("ID_SMP", "") or transaction.get("TransactionDatetime", "")
                    complete_datetime_str = transaction.get("CompleteDatetime", "")
                    
                    parsed_transaction_date = self._parse_datetime(transaction_datetime_str)
                    parsed_complete_date = self._parse_datetime(complete_datetime_str)
                    
                    # Логируем первые несколько транзакций для отладки
                    if idx < 3:
                        logger.info(f"Транзакция {idx + 1}: NUM_EMAP={transaction.get('NUM_EMAP')}, "
                                  f"ID_SMP='{transaction_datetime_str}' -> {parsed_transaction_date}, "
                                  f"SECORT={transaction.get('SECORT')}, "
                                  f"VOLUM={volume}, COST={transaction.get('COST')}, ERPKEY={transaction.get('ERPKEY')}")
                    
                    # Получаем стоимость (может быть COST или ShopCost)
                    cost = transaction.get('COST') or transaction.get('ShopCost', 0.0)
                    
                    standard_transaction = {
                        "card_number": transaction.get("NUM_EMAP", ""),  # Номер карты из NUM_EMAP
                        "transaction_date": parsed_transaction_date,
                        "complete_date": parsed_complete_date,
                        "product": transaction.get("SECORT", ""),  # Вид топлива из SECORT
                        "volume": volume,
                        "amount": abs(cost),  # Используем абсолютное значение
                        "azs_number": str(transaction.get("COD_AZS", "")),
                        "azs_name": transaction.get("AZS_NAME", ""),
                        "currency": self.currency,
                        # Сохраняем ERPKEY (GUID контрагента)
                        "erpkey": transaction.get("ERPKEY", ""),
                        # Дополнительные поля из XML
                        "cod_l": transaction.get("COD_L", 0),
                        "cod_o": transaction.get("COD_O", 0),
                        "cod_a": transaction.get("COD_A", 0),
                        "cod_own": transaction.get("COD_OWN", 0),
                        "bonus_in": transaction.get("BINPC", 0.0) or transaction.get("BonusIn", 0.0),
                        "bonus_out": transaction.get("BonusOut", 0.0),
                        "shop_base_cost": transaction.get("ShopBaseCost", 0.0),
                        "person_cost": transaction.get("PersonCost", 0.0),
                        "resource_key": transaction.get("ResourceKey", 0),
                        "collection_key": transaction.get("CollectionKey", 0),
                        "vendor_key": transaction.get("VendorKey", 0),
                        "warehouse_key": transaction.get("WarehouseKey", 0),
                        "application_key": transaction.get("ApplicationKey", 0),
                        "terminal_request_id": transaction.get("TerminalRequestID", 0),
                    }
                    
                    # Проверяем, что дата транзакции успешно распарсена
                    if not parsed_transaction_date:
                        logger.warning(f"Не удалось распарсить дату транзакции: '{transaction_datetime_str}'")
                        continue  # Пропускаем транзакцию без даты
                    
                    transactions.append(standard_transaction)
                
                logger.info(f"Успешно обработано транзакций из XML API: {len(transactions)} из {len(sale_elements)}")
                return transactions
                
            except ET.ParseError as xml_error:
                logger.error(f"Ошибка парсинга XML ответа: {str(xml_error)}")
                logger.error(f"Сырой ответ: {response_text[:1000]}")
                return []
                
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 500:
                raise Exception(f"Ошибка 500: период запроса слишком большой. Попробуйте уменьшить период до 3-4 дней.")
            raise
        except Exception as e:
            logger.error(f"Ошибка при получении транзакций через XML API: {str(e)}", exc_info=True)
            raise
    
    def _parse_datetime(self, datetime_str: str) -> Optional[datetime]:
        """
        Парсит строку даты/времени в формате "YYYY-MM-DD HH:MM:SS"
        
        Args:
            datetime_str: Строка с датой/временем
            
        Returns:
            Объект datetime или None
        """
        if not datetime_str:
            return None
        
        try:
            # Пробуем разные форматы
            formats = [
                '%Y-%m-%d %H:%M:%S',
                '%Y-%m-%dT%H:%M:%S',
                '%Y-%m-%d %H:%M:%S.%f',
                '%Y-%m-%dT%H:%M:%S.%f',
            ]
            
            for fmt in formats:
                try:
                    return datetime.strptime(datetime_str.strip(), fmt)
                except ValueError:
                    continue
            
            logger.warning(f"Не удалось распарсить дату: {datetime_str}")
            return None
        except Exception as e:
            logger.warning(f"Ошибка при парсинге даты {datetime_str}: {str(e)}")
            return None
    
    async def healthcheck(self) -> Dict[str, Any]:
        """
        Проверка доступности API
        
        Returns:
            Результат проверки
        """
        try:
            # Для XML API с сертификатом проверяем доступность endpoint
            if self.use_xml_api and self.xml_api_certificate:
                # Пробуем отправить тестовый запрос с минимальными данными
                try:
                    # Определяем endpoint для тестирования
                    if self.xml_api_endpoint:
                        if self.xml_api_endpoint.startswith('http://') or self.xml_api_endpoint.startswith('https://'):
                            test_endpoint = self.xml_api_endpoint
                        else:
                            test_endpoint = f"{self.base_url.rstrip('/')}/{self.xml_api_endpoint.lstrip('/')}"
                    else:
                        # Используем стандартный endpoint: BASE_URL/sncapi/sale
                        test_endpoint = f"{self.base_url.rstrip('/')}/sncapi/sale"
                    
                    # Создаем минимальный тестовый запрос
                    # Если POS Code не указан, отправляем запрос без POSCode (по всем POS)
                    pos_code_to_use = self.xml_api_pos_code if self.xml_api_pos_code else None
                    test_xml = self._create_xml_sale_request(
                        date_from=date.today(),
                        date_to=date.today(),
                        certificate=self.xml_api_certificate,
                        pos_code=pos_code_to_use
                    )
                    
                    headers = {
                        "Content-Type": "text/xml; charset=utf-8",
                        "Accept": "application/xml, text/xml, */*",
                    }
                    
                    logger.info(f"Тестовый запрос к endpoint: {test_endpoint}")
                    response = await self.client.post(
                        test_endpoint,
                        content=test_xml.encode('utf-8'),
                        headers=headers,
                        timeout=10.0
                    )
                    
                    # Если получили ответ (даже с ошибкой валидации), значит endpoint доступен
                    return {
                        "status": "ok",
                        "checked_at": datetime.now(timezone.utc),
                        "endpoint": test_endpoint,
                        "message": "XML API endpoint доступен"
                    }
                except httpx.HTTPStatusError as e:
                    # Если получили ошибку, но не 405, значит endpoint работает
                    if e.response.status_code != 405:
                        return {
                            "status": "ok",
                            "checked_at": datetime.now(timezone.utc),
                            "endpoint": test_endpoint,
                            "message": f"XML API endpoint доступен (статус: {e.response.status_code})"
                        }
                    raise
                except Exception as test_error:
                    return {
                        "status": "error",
                        "checked_at": datetime.now(timezone.utc),
                        "error": f"Не удалось подключиться к XML API endpoint: {str(test_error)}"
                    }
            
            # Для JSON API пробуем получить список карт
            cards = await self.list_cards()
            return {
                "status": "ok",
                "checked_at": datetime.now(timezone.utc),
                "cards_count": len(cards)
            }
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
            Список имен полей
        """
        # Для XML API возвращаем поля из спецификации
        if self.use_xml_api and self.xml_api_certificate:
            xml_api_fields = [
                "CardNumber", "card_number",
                "StartDate", "EndDate",
                "COD_L", "COD_O", "COD_A", "COD_OWN", "COD_AZS",
                "AZS_NAME", "azs_name", "azs_number",
                "BonusIn", "BonusOut",
                "CompleteDatetime", "TransactionDatetime", "transaction_date",
                "Volume", "volume",
                "ShopCost", "ShopBaseCost", "PersonCost", "amount",
                "ResourceKey", "CollectionKey", "VendorKey", "WarehouseKey",
                "ResourceName", "product",
                "ApplicationKey", "TerminalRequestID",
            ]
            return xml_api_fields
        
        # Для JSON API возвращаем стандартные поля
        standard_fields = [
            "date", "transaction_date",
            "card_number", "card",
            "sum", "amount",
            "product", "service",
            "azs_number", "azs",
            "location", "address",
            "settlement", "region",
            "supplier",
            "currency",
        ]
        return standard_fields


class RnCardAdapter:
    """
    Адаптер для работы с API провайдера РН-Карт (WebAPI EMV v2)
    
    Документация: https://lkapi.rn-card.ru
    """
    
    def __init__(
        self,
        base_url: str,
        login: str,
        password: str,
        contract: str,
        currency: str = "RUB",
        use_md5_hash: bool = True
    ):
        """
        Инициализация адаптера РН-Карт
        
        Args:
            base_url: Базовый URL API (например, "https://lkapi.rn-card.ru")
            login: Логин из Личного кабинета РН-Карт
            password: Пароль из Личного кабинета РН-Карт
            contract: Код договора
            currency: Валюта по умолчанию
            use_md5_hash: Использовать MD5-хеш пароля (рекомендуется, True по умолчанию)
        """
        self.base_url = base_url.rstrip('/')
        self.login = login
        self.password = password
        self.contract = contract
        self.currency = currency
        self.use_md5_hash = use_md5_hash
        # Создаем клиент с настройками по умолчанию
        # httpx автоматически добавляет необходимые заголовки (Host, Connection и т.д.)
        self.client = httpx.AsyncClient(timeout=30.0)
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.client.aclose()
    
    def _prepare_password(self) -> str:
        """
        Подготовка пароля для заголовка авторизации
        
        Returns:
            Base64-кодированная строка (MD5-хеш пароля или сам пароль)
        """
        if self.use_md5_hash:
            # Рекомендуемый способ: MD5-хеш пароля → hex-строка → Base64
            # Это соответствует PowerShell:
            # $md5 = [System.Security.Cryptography.MD5]::Create()
            # $bytes = [System.Text.Encoding]::UTF8.GetBytes($password)
            # $hashBytes = $md5.ComputeHash($bytes)
            # $hashHex = -join ($hashBytes | ForEach-Object { "{0:x2}" -f $_ })
            # $base64Auth = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($hashHex))
            
            # Шаг 1: Пароль → UTF-8 байты
            password_bytes = self.password.encode('utf-8')
            
            # Шаг 2: UTF-8 байты → MD5 хеш (байты)
            password_hash_bytes = hashlib.md5(password_bytes).digest()
            
            # Шаг 3: Байты MD5 → hex-строка (lowercase, по 2 символа на байт, как "{0:x2}" в PowerShell)
            password_hash_hex = ''.join(f'{b:02x}' for b in password_hash_bytes)
            
            # Шаг 4: Hex-строка → UTF-8 байты → Base64
            password_encoded = base64.b64encode(password_hash_hex.encode('utf-8')).decode('utf-8')
            
            # Логируем для отладки (без пароля, только хеш)
            logger.info(f"Подготовка пароля для РН-Карт (MD5)", extra={
                "password_length": len(self.password) if self.password else 0,
                "password_preview": self.password[:3] + "***" if self.password and len(self.password) > 3 else "***",
                "hash_hex": password_hash_hex,
                "hash_hex_length": len(password_hash_hex),
                "base64_encoded": password_encoded,
                "base64_length": len(password_encoded),
                "login": self.login,
                "contract": self.contract,
                "use_md5_hash": self.use_md5_hash
            })
        else:
            # Альтернативный способ: просто Base64 пароля
            password_encoded = base64.b64encode(self.password.encode('utf-8')).decode('utf-8')
            logger.info(f"Подготовка пароля для РН-Карт (Base64 без MD5)", extra={
                "password_length": len(self.password) if self.password else 0,
                "password_preview": self.password[:3] + "***" if self.password and len(self.password) > 3 else "***",
                "base64_encoded": password_encoded,
                "base64_length": len(password_encoded),
                "login": self.login,
                "contract": self.contract
            })
        
        return password_encoded
    
    def _auth_headers(self, request_id: Optional[str] = None) -> Dict[str, str]:
        """
        Формирование заголовков авторизации
        
        Args:
            request_id: Уникальный идентификатор запроса (GUID) для диагностики
            
        Returns:
            Словарь с заголовками
        """
        password_encoded = self._prepare_password()
        
        headers = {
            "RnCard-Identity-Account-Pass": password_encoded,
            "Accept": "application/json",
            # Не добавляем User-Agent, чтобы соответствовать PowerShell скрипту
        }
        
        # Добавляем RequestId для диагностики (рекомендуется)
        if request_id:
            headers["RnCard-RequestId"] = request_id
        else:
            import uuid
            headers["RnCard-RequestId"] = str(uuid.uuid4())
        
        # Логируем заголовки для отладки (без пароля)
        logger.debug(f"Заголовки авторизации для РН-Карт", extra={
            "has_password_header": bool(password_encoded),
            "password_header_length": len(password_encoded),
            "password_header_preview": password_encoded[:20] + "..." if len(password_encoded) > 20 else password_encoded,
            "request_id": headers.get("RnCard-RequestId"),
            "user_agent": headers.get("User-Agent")
        })
        
        return headers
    
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
        
        # Добавляем обязательные параметры
        query = {
            "u": self.login,
            "contract": self.contract,
            "type": "json"
        }
        
        if params:
            query.update({k: v for k, v in params.items() if v is not None})
        
        url = f"{self.base_url}{path}"
        
        try:
            # Логируем информацию о запросе для диагностики (без пароля)
            logger.debug(f"Запрос к API РН-Карт: {url}", extra={
                "url": url,
                "login": self.login,
                "contract": self.contract,
                "use_md5_hash": self.use_md5_hash,
                "has_password": bool(self.password),
                "request_id": headers.get("RnCard-RequestId"),
                "has_auth_header": "RnCard-Identity-Account-Pass" in headers,
                "auth_header_length": len(headers.get("RnCard-Identity-Account-Pass", "")) if "RnCard-Identity-Account-Pass" in headers else 0
            })
            
            # Логируем заголовки для отладки (без значения пароля)
            logger.debug(f"Заголовки запроса к API РН-Карт", extra={
                "headers_keys": list(headers.keys()),
                "has_accept": "Accept" in headers,
                "has_request_id": "RnCard-RequestId" in headers,
                "has_user_agent": "User-Agent" in headers,
                "auth_header_exists": "RnCard-Identity-Account-Pass" in headers,
                "auth_header_length": len(headers.get("RnCard-Identity-Account-Pass", ""))
            })
            
            # Детальное логирование для диагностики 403
            logger.info(f"Детальная информация о запросе к API РН-Карт", extra={
                "url": url,
                "method": "GET",
                "all_headers": {k: (v[:20] + "..." if k == "RnCard-Identity-Account-Pass" and len(v) > 20 else v) for k, v in headers.items()},
                "params": query,
                "login": self.login,
                "contract": self.contract,
                "use_md5_hash": self.use_md5_hash
            })
            
            response = await self.client.get(url, headers=headers, params=query)
            
            # Логируем ответ
            logger.info(f"Ответ от API РН-Карт", extra={
                "status_code": response.status_code,
                "response_headers": dict(response.headers) if hasattr(response, 'headers') else {},
                "response_preview": response.text[:200] if hasattr(response, 'text') else "N/A"
            })
            
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            status_code = e.response.status_code
            error_text = e.response.text[:1000] if hasattr(e.response, 'text') else str(e)
            
            # Логируем детальную информацию об ошибке для диагностики
            logger.error(f"HTTP ошибка {status_code} при запросе к API РН-Карт", extra={
                "url": url,
                "status_code": status_code,
                "error_text": error_text,
                "request_headers": dict(e.request.headers) if hasattr(e.request, 'headers') else {},
                "response_headers": dict(e.response.headers) if hasattr(e.response, 'headers') else {},
                "login": self.login,
                "contract": self.contract,
                "auth_header_sent": "RnCard-Identity-Account-Pass" in (dict(e.request.headers) if hasattr(e.request, 'headers') else {}),
                "auth_header_value_preview": dict(e.request.headers).get("RnCard-Identity-Account-Pass", "")[:30] + "..." if hasattr(e.request, 'headers') and "RnCard-Identity-Account-Pass" in dict(e.request.headers) else "N/A"
            })
            
            # Формируем более информативное сообщение об ошибке
            if status_code == 403:
                error_message = (
                    f"Ошибка 403 Forbidden при запросе к API РН-Карт. "
                    f"Возможные причины:\n"
                    f"1. IP-адрес вашего сервера не добавлен в белый список в Личном кабинете РН-Карт (раздел 1.4 регламента)\n"
                    f"2. Неправильные учетные данные (логин/пароль)\n"
                    f"3. Неправильный формат заголовка авторизации\n"
                    f"4. Учетная запись заблокирована\n\n"
                    f"URL: {url}\n"
                    f"Логин: {self.login}\n"
                    f"Договор: {self.contract}\n"
                    f"Ответ сервера: {error_text}"
                )
            elif status_code == 404:
                error_message = (
                    f"Ошибка 404 Not Found при запросе к API РН-Карт. "
                    f"Возможные причины:\n"
                    f"1. Неправильный URL или версия API\n"
                    f"2. IP-адрес не в белом списке (сервер может возвращать 404 вместо 403)\n"
                    f"3. Неправильный код договора\n\n"
                    f"URL: {url}\n"
                    f"Ответ сервера: {error_text}"
                )
            else:
                error_message = f"Ошибка HTTP {status_code} при запросе к API РН-Карт: {error_text}"
            
            logger.error(error_message, extra={
                "url": url,
                "status_code": status_code,
                "response_text": error_text,
                "login": self.login,
                "contract": self.contract
            })
            
            # Сохраняем улучшенное сообщение в атрибуте исключения для последующего использования
            e._rncard_error_message = error_message
            raise
        except httpx.RequestError as e:
            logger.error(f"Ошибка запроса к API РН-Карт: {str(e)}", extra={"url": url})
            raise
    
    async def list_cards(self) -> List[Dict[str, Any]]:
        """
        Получение списка топливных карт по договору
        
        Returns:
            Список карт в формате [{"Num": "...", "Rem": "...", "SName": "...", "SCode": "...", "CardGrp": "..."}, ...]
        """
        payload = await self._get_json("/api/emv/v1/GetCardsByContract")
        
        # API возвращает список карт напрямую
        if isinstance(payload, list):
            return payload
        
        # Или может быть обернут в объект
        return payload.get("cards") or payload.get("Cards") or []
    
    async def fetch_card_transactions(
        self,
        card_number: str,
        date_from: date,
        date_to: date
    ) -> List[Dict[str, Any]]:
        """
        Получение транзакций по договору за период
        
        Args:
            card_number: Номер карты (не используется напрямую, но может быть полезен для фильтрации)
            date_from: Начальная дата периода
            date_to: Конечная дата периода (максимум 2 месяца от date_from)
            
        Returns:
            Список транзакций из OperationList
        """
        # Проверяем, что период не превышает 2 месяца
        if (date_to - date_from).days > 60:
            raise ValueError("Период не может превышать 2 месяца (60 дней)")
        
        # Форматируем даты в ISO 8601: yyyy-MM-ddTHH:mm:ss
        begin_str = date_from.strftime("%Y-%m-%dT00:00:00")
        end_str = date_to.strftime("%Y-%m-%dT23:59:59")
        
        params = {
            "begin": begin_str,
            "end": end_str
        }
        
        payload = await self._get_json("/api/emv/v2/GetOperByContract", params=params)
        
        # API возвращает объект с полем OperationList
        operations = payload.get("OperationList") or payload.get("operationList") or []
        
        # Фильтруем по номеру карты, если указан
        if card_number:
            operations = [
                op for op in operations
                if str(op.get("Card", "")).strip() == str(card_number).strip()
            ]
        
        return operations
    
    async def fetch_transactions_by_last_modified(
        self,
        last_hours: int = 24
    ) -> List[Dict[str, Any]]:
        """
        Получение транзакций по дате последнего изменения (для синхронизации)
        
        Args:
            last_hours: Сколько часов назад импортировались или изменялись операции (макс. 120 часов)
            
        Returns:
            Список транзакций из OperationList
        """
        if last_hours > 120:
            raise ValueError("Параметр lastHours не может превышать 120 часов")
        
        params = {
            "lastHours": last_hours
        }
        
        payload = await self._get_json("/api/emv/v2/GetOperByContractLM", params=params)
        
        # API возвращает объект с полем OperationList
        return payload.get("OperationList") or payload.get("operationList") or []
    
    async def healthcheck(self) -> Dict[str, Any]:
        """
        Проверка доступности API
        
        Returns:
            Результат проверки
        """
        try:
            # Пробуем получить список карт - это простой метод для проверки
            await self._get_json("/api/emv/v1/GetCardsByContract")
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
            # Получаем транзакции за последние 30 дней
            date_to = date.today()
            date_from = date_to - timedelta(days=30)
            
            try:
                transactions = await self.fetch_card_transactions("", date_from, date_to)
            except ValueError:
                # Если период слишком большой, пробуем меньший
                date_from = date_to - timedelta(days=1)
                transactions = await self.fetch_card_transactions("", date_from, date_to)
            
            if not transactions:
                logger.warning("Список транзакций пуст при получении полей из API РН-Карт")
                # Возвращаем стандартные поля на основе документации
                return [
                    "Date", "Card", "Type", "Value", "Sum", "DSum",
                    "Price", "DPrice", "Contract", "AZS", "AZSName",
                    "Product", "Region", "Settlement", "Address"
                ]
            
            # Извлекаем все уникальные ключи из транзакций
            all_fields = set()
            for trans in transactions[:10]:  # Проверяем первые 10 транзакций
                if isinstance(trans, dict):
                    all_fields.update(trans.keys())
            
            fields_list = sorted(list(all_fields))
            
            logger.info(f"Получено полей из API РН-Карт: {len(fields_list)}", extra={
                "fields_count": len(fields_list),
                "sample_fields": fields_list[:10]
            })
            
            return fields_list
            
        except Exception as e:
            logger.error(f"Ошибка при получении полей из API РН-Карт: {str(e)}", extra={"error": str(e)}, exc_info=True)
            # Возвращаем стандартные поля на основе документации
            return [
                "Date", "Card", "Type", "Value", "Sum", "DSum",
                "Price", "DPrice", "Contract", "AZS", "AZSName",
                "Product", "Region", "Settlement", "Address"
            ]


class ApiProviderService:
    """
    Сервис для работы с API провайдерами
    """
    
    def __init__(self, db: Session):
        self.db = db
    
    def create_adapter(self, template: ProviderTemplate):
        """
        Создание адаптера для работы с API на основе шаблона
        
        Args:
            template: Шаблон провайдера с типом подключения "api" или "web"
            
        Returns:
            Адаптер API или WebAdapter
        """
        if template.connection_type not in ["api", "web"]:
            raise ValueError(f"Шаблон имеет тип подключения '{template.connection_type}', ожидается 'api' или 'web'")
        
        if not template.connection_settings:
            raise ValueError("В шаблоне не указаны настройки подключения")
        
        # Парсим настройки подключения
        import json
        from app.utils.encryption import decrypt_connection_settings
        
        try:
            if isinstance(template.connection_settings, str):
                settings = json.loads(template.connection_settings)
            elif template.connection_settings is None:
                raise ValueError("Настройки подключения не указаны")
            else:
                settings = template.connection_settings
            
            # Расшифровываем пароль, если он зашифрован
            settings = decrypt_connection_settings(settings)
        except (json.JSONDecodeError, TypeError) as e:
            raise ValueError(f"Неверный формат настроек подключения: {str(e)}")
        
        currency = settings.get("currency", "RUB")
        
        # Для типа "web" используем WebAdapter
        if template.connection_type == "web":
            base_url = settings.get("base_url") or settings.get("api_url")
            certificate = settings.get("xml_api_certificate") or settings.get("certificate")
            
            if not base_url:
                raise ValueError("Не указан базовый URL (base_url или api_url)")
            
            # Для XML API требуется только сертификат, username и password не используются
            if not certificate:
                raise ValueError("Для XML API требуется указать сертификат (certificate или xml_api_certificate)")
            
            # Для совместимости устанавливаем пустые значения, так как они не используются
            username = settings.get("username") or settings.get("login") or settings.get("user") or ""
            password = settings.get("password") or settings.get("pass") or ""
            
            # Параметры для XML API (если указаны)
            use_xml_api = settings.get("use_xml_api", False)
            xml_api_key = settings.get("xml_api_key") or settings.get("key")
            xml_api_signature = settings.get("xml_api_signature") or settings.get("signature")
            xml_api_salt = settings.get("xml_api_salt") or settings.get("salt")
            xml_api_cod_azs = settings.get("xml_api_cod_azs") or settings.get("cod_azs")
            xml_api_endpoint = settings.get("xml_api_endpoint") or settings.get("endpoint")
            xml_api_certificate = settings.get("xml_api_certificate") or settings.get("certificate")
            # POS Code опциональный - если не указан или 0, будет None (запрос по всем POS)
            pos_code_raw = settings.get("xml_api_pos_code") or settings.get("pos_code")
            xml_api_pos_code = int(pos_code_raw) if pos_code_raw and str(pos_code_raw).strip() and int(pos_code_raw) > 0 else None
            
            # Если указан сертификат, автоматически включаем XML API
            if xml_api_certificate:
                use_xml_api = True
                logger.info("✓ Обнаружен сертификат XML API, включаем XML API", extra={
                    "has_certificate": bool(xml_api_certificate),
                    "certificate_preview": xml_api_certificate[:30] + "..." if xml_api_certificate and len(xml_api_certificate) > 30 else xml_api_certificate,
                    "pos_code": xml_api_pos_code
                })
                print(f"\n{'='*80}")
                print(f"XML API ПАРАМЕТРЫ ОБНАРУЖЕНЫ:")
                print(f"  Сертификат (certificate): {xml_api_certificate[:50]}..." if len(xml_api_certificate) > 50 else f"  Сертификат (certificate): {xml_api_certificate}")
                if xml_api_pos_code:
                    print(f"  POS Code: {xml_api_pos_code}")
                else:
                    print(f"  POS Code: не указан (запрос по всем POS)")
                print(f"  → Используется XML API с сертификатом (авторизация не требуется)")
                print(f"  → Логин, пароль, ключ, подпись и salt не используются")
                print(f"{'='*80}\n")
            else:
                logger.info("Сертификат XML API не указан. Для работы с XML API требуется сертификат.")
            
            return WebAdapter(
                base_url=base_url,
                username=username,
                password=password,
                currency=currency,
                use_xml_api=use_xml_api,
                xml_api_key=xml_api_key,
                xml_api_signature=xml_api_signature,
                xml_api_salt=xml_api_salt,
                xml_api_cod_azs=xml_api_cod_azs,
                xml_api_endpoint=xml_api_endpoint,
                xml_api_certificate=xml_api_certificate,
                xml_api_pos_code=xml_api_pos_code
            )
        
        # Для типа "api" используем существующую логику
        provider_type = settings.get("provider_type", "petrolplus")
        base_url = settings.get("base_url") or settings.get("api_url")
        
        if not base_url:
            raise ValueError("Не указан базовый URL API (base_url или api_url)")
        
        provider_type_lower = provider_type.lower()
        
        if provider_type_lower == "petrolplus":
            api_token = settings.get("api_token") or settings.get("token") or settings.get("api_key")
            if not api_token:
                raise ValueError("Не указан токен авторизации (api_token, token или api_key)")
            return PetrolPlusAdapter(base_url, api_token, currency)
        
        elif provider_type_lower == "rncard" or provider_type_lower == "rn-card":
            # Для РН-Карт требуется логин, пароль и код договора
            login = settings.get("login") or settings.get("username") or settings.get("user")
            password = settings.get("password") or settings.get("pass")
            contract = settings.get("contract") or settings.get("contract_code")
            use_md5_hash = settings.get("use_md5_hash", True)  # По умолчанию используем MD5
            
            # Убираем пробелы в начале и конце (на случай, если они были добавлены при вводе)
            if login:
                login = str(login).strip()
            if password:
                password = str(password).strip()
            if contract:
                contract = str(contract).strip()
            
            # Логируем параметры для диагностики (без пароля)
            logger.info(f"Создание адаптера РН-Карт", extra={
                "login": login,
                "login_length": len(login) if login else 0,
                "has_password": bool(password),
                "password_length": len(password) if password else 0,
                "contract": contract,
                "contract_length": len(contract) if contract else 0,
                "use_md5_hash": use_md5_hash,
                "base_url": base_url
            })
            
            if not login:
                raise ValueError("Не указан логин (login, username или user)")
            if not password:
                raise ValueError("Не указан пароль (password или pass)")
            if not contract:
                raise ValueError("Не указан код договора (contract или contract_code)")
            
            # Если base_url не указан, используем стандартный URL РН-Карт
            if not base_url or base_url.strip() == "":
                base_url = "https://lkapi.rn-card.ru"
            
            return RnCardAdapter(
                base_url=base_url,
                login=login,
                password=password,
                contract=contract,
                currency=currency,
                use_md5_hash=use_md5_hash
            )
        
        else:
            raise ValueError(f"Неподдерживаемый тип провайдера API: {provider_type}")
    
    async def test_connection(self, template: ProviderTemplate) -> Dict[str, Any]:
        """
        Тестирование подключения к API или веб-сервису
        
        Args:
            template: Шаблон провайдера с типом подключения "api" или "web"
            
        Returns:
            Результат тестирования
        """
        print(f"\n[ApiProviderService.test_connection] Начало теста для типа: {template.connection_type}")
        logger.info("ApiProviderService.test_connection вызван", extra={
            "connection_type": template.connection_type,
            "template_id": getattr(template, 'id', None)
        })
        
        try:
            print(f"[ApiProviderService.test_connection] Создание адаптера...")
            adapter = self.create_adapter(template)
            print(f"[ApiProviderService.test_connection] Адаптер создан: {type(adapter).__name__}")
            
            print(f"[ApiProviderService.test_connection] Вход в async with adapter (начнется авторизация)...")
            async with adapter:
                print(f"[ApiProviderService.test_connection] Внутри async with, запускаем healthcheck...")
                result = await adapter.healthcheck()
                print(f"[ApiProviderService.test_connection] healthcheck вернул: {result}")
                
                return {
                    "success": result.get("status") == "ok",
                    "message": (
                        "Подключение успешно" if result.get("status") == "ok"
                        else f"Ошибка подключения: {result.get('error', 'Неизвестная ошибка')}"
                    ),
                    "details": result
                }
        except ValueError as e:
            # Специальная обработка для ошибок валидации (например, капча)
            error_msg = str(e)
            print(f"\n[ApiProviderService.test_connection] ОШИБКА ВАЛИДАЦИИ: {error_msg}")
            logger.error("Ошибка валидации при тестировании подключения", extra={
                "template_id": getattr(template, 'id', None),
                "error": error_msg,
                "error_type": "ValueError"
            })
            return {
                "success": False,
                "message": error_msg,
                "details": {"error": error_msg, "error_type": "validation"}
            }
        except httpx.HTTPStatusError as e:
            # Специальная обработка для HTTP ошибок
            status_code = e.response.status_code
            try:
                error_text = e.response.text[:500] if hasattr(e.response, 'text') else str(e)
            except:
                error_text = str(e)
            
            # Проверяем, есть ли улучшенное сообщение об ошибке от адаптера
            if hasattr(e, '_rncard_error_message'):
                error_msg = e._rncard_error_message
            elif status_code == 403:
                # Специальная обработка для РН-Карт
                # Проверяем тип провайдера из настроек шаблона
                import json
                try:
                    settings = json.loads(template.connection_settings) if isinstance(template.connection_settings, str) else template.connection_settings
                    provider_type = settings.get("provider_type", "").lower() if settings else ""
                    is_rncard = provider_type in ["rncard", "rn-card"]
                except:
                    is_rncard = False
                
                if is_rncard:
                    error_msg = (
                        "Ошибка 403 Forbidden при подключении к API РН-Карт.\n\n"
                        "Возможные причины:\n"
                        "1. IP-адрес вашего сервера не добавлен в белый список в Личном кабинете РН-Карт\n"
                        "   (раздел 1.4 технического регламента). Убедитесь, что IP-адрес добавлен в ЛК.\n"
                        "2. Неправильные учетные данные (логин/пароль)\n"
                        "3. Неправильный формат заголовка авторизации\n"
                        "4. Учетная запись заблокирована\n\n"
                        f"Ответ сервера: {error_text}"
                    )
                elif 'captcha' in error_text.lower() or 'капча' in error_text.lower():
                    error_msg = (
                        "Сервер требует решение капчи для авторизации. "
                        "Автоматическая авторизация невозможна. "
                        "Пожалуйста, проверьте учетные данные или обратитесь к администратору сервера."
                    )
                else:
                    error_msg = (
                        f"Сервер вернул 403 Forbidden. "
                        f"Возможные причины: неправильные учетные данные, требуется капча, "
                        f"или сервер блокирует автоматизированные запросы. "
                        f"Ответ сервера: {error_text}"
                    )
            elif status_code == 404:
                # Специальная обработка для РН-Карт
                # Проверяем тип провайдера из настроек шаблона
                import json
                try:
                    settings = json.loads(template.connection_settings) if isinstance(template.connection_settings, str) else template.connection_settings
                    provider_type = settings.get("provider_type", "").lower() if settings else ""
                    is_rncard = provider_type in ["rncard", "rn-card"]
                except:
                    is_rncard = False
                
                if is_rncard:
                    error_msg = (
                        "Ошибка 404 Not Found при подключении к API РН-Карт.\n\n"
                        "Возможные причины:\n"
                        "1. IP-адрес не в белом списке (сервер может возвращать 404 вместо 403)\n"
                        "2. Неправильный URL или версия API\n"
                        "3. Неправильный код договора\n\n"
                        f"Ответ сервера: {error_text}"
                    )
                else:
                    error_msg = f"Ошибка HTTP {status_code}: {error_text}"
            else:
                error_msg = f"Ошибка HTTP {status_code}: {error_text}"
            
            print(f"\n[ApiProviderService.test_connection] HTTP ОШИБКА {status_code}: {error_msg}")
            logger.error(f"Ошибка HTTP при тестировании подключения: {status_code}", extra={
                "template_id": getattr(template, 'id', None),
                "status_code": status_code,
                "error": error_text,
                "error_type": "HTTPStatusError"
            }, exc_info=True)
            return {
                "success": False,
                "message": error_msg,
                "details": {"error": error_text, "status_code": status_code, "error_type": "http"}
                }
        except Exception as e:
            print(f"\n[ApiProviderService.test_connection] ИСКЛЮЧЕНИЕ: {type(e).__name__}: {str(e)}")
            import traceback
            print(traceback.format_exc())
            
            logger.error("Ошибка при тестировании подключения к API", extra={
                "template_id": getattr(template, 'id', None),
                "error": str(e),
                "error_type": type(e).__name__
            }, exc_info=True)
            return {
                "success": False,
                "message": f"Ошибка подключения: {str(e)}",
                "details": {"error": str(e), "error_type": type(e).__name__}
            }
    
    async def get_api_fields(self, template: ProviderTemplate) -> Dict[str, Any]:
        """
        Получение списка полей из API ответа
        
        Args:
            template: Шаблон провайдера с типом подключения "api" или "web"
            
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
        Загрузка транзакций через API или веб-сервис
        
        Args:
            template: Шаблон провайдера с типом подключения "api" или "web"
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
                # Для XML API с сертификатом метод getsaleext может работать без указания карт
                # Он возвращает все транзакции за указанный период
                is_xml_api_with_cert = isinstance(adapter, WebAdapter) and adapter.use_xml_api and adapter.xml_api_certificate
                
                # Если карты не указаны, пытаемся получить список всех карт
                # Для XML API с сертификатом это не обязательно - можно загрузить все транзакции
                if not card_numbers:
                    if is_xml_api_with_cert:
                        # Для XML API с сертификатом можно работать без карт
                        logger.info("Для XML API с сертификатом карты не указаны. Будет загружены все транзакции за указанный период.", extra={
                            "template_id": template.id
                        })
                        card_numbers = []  # Пустой список - метод getsaleext вернет все транзакции
                    else:
                        # Для других типов API пытаемся получить список карт
                        cards_data = await adapter.list_cards()
                        # Для WebAdapter list_cards возвращает список строк, для PetrolPlusAdapter - список словарей, для RnCardAdapter - список словарей с полем "Num"
                        if cards_data and len(cards_data) > 0:
                            if isinstance(cards_data[0], dict):
                                # Для РН-Карт поле называется "Num", для PetrolPlus - "cardNum"
                                card_numbers = [
                                    str(card.get("Num") or card.get("cardNum") or "")
                                    for card in cards_data
                                    if card.get("Num") or card.get("cardNum")
                                ]
                            else:
                                card_numbers = [str(card) for card in cards_data if card]
                            logger.info(f"Найдено карт для загрузки: {len(card_numbers)}", extra={
                                "template_id": template.id
                            })
                        else:
                            logger.warning("Не удалось получить список карт. Укажите номера карт в параметре card_numbers.", extra={
                                "template_id": template.id
                            })
                            raise ValueError("Не удалось получить список карт. Укажите номера карт в параметре card_numbers.")
                
                # Для XML API с сертификатом можно загрузить транзакции для всех карт одним запросом
                # Для РН-Карт также загружаем все транзакции по договору одним запросом
                is_rncard_adapter = isinstance(adapter, RnCardAdapter)
                
                if is_xml_api_with_cert:
                    # Загружаем транзакции для всех карт одним запросом
                    try:
                        transactions = await adapter._fetch_transactions_xml_api(
                            card_numbers,
                            date_from,
                            date_to
                        )
                        
                        # Преобразуем транзакции в формат системы
                        for trans in transactions:
                            # Извлекаем номер карты из транзакции
                            card_num = trans.get("card_number", "")
                            system_trans = self._convert_to_system_format(trans, template, card_num)
                            if system_trans:
                                all_transactions.append(system_trans)
                        
                        logger.info(f"Загружено транзакций через XML API: {len(transactions)}", extra={
                            "template_id": template.id,
                            "cards_count": len(card_numbers),
                            "transactions_count": len(transactions)
                        })
                    except Exception as e:
                        logger.error(f"Ошибка при загрузке транзакций через XML API: {str(e)}", extra={
                            "template_id": template.id,
                            "error": str(e)
                        }, exc_info=True)
                        raise
                elif is_rncard_adapter:
                    # Для РН-Карт загружаем все транзакции по договору одним запросом
                    try:
                        # Используем пустую строку для card_number, чтобы получить все транзакции
                        transactions = await adapter.fetch_card_transactions(
                            "",
                            date_from,
                            date_to
                        )
                        
                        # Фильтруем по указанным картам, если они указаны
                        if card_numbers:
                            transactions = [
                                trans for trans in transactions
                                if str(trans.get("Card", "")).strip() in [str(cn).strip() for cn in card_numbers]
                            ]
                        
                        # Преобразуем транзакции в формат системы
                        for trans in transactions:
                            # Извлекаем номер карты из транзакции
                            card_num = str(trans.get("Card", "")).strip()
                            system_trans = self._convert_to_system_format(trans, template, card_num)
                            if system_trans:
                                all_transactions.append(system_trans)
                        
                        logger.info(f"Загружено транзакций через API РН-Карт: {len(transactions)}", extra={
                            "template_id": template.id,
                            "cards_count": len(card_numbers) if card_numbers else "all",
                            "transactions_count": len(transactions)
                        })
                    except Exception as e:
                        logger.error(f"Ошибка при загрузке транзакций через API РН-Карт: {str(e)}", extra={
                            "template_id": template.id,
                            "error": str(e)
                        }, exc_info=True)
                        raise
                else:
                    # Для других типов API загружаем транзакции для каждой карты отдельно
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
            logger.error("Ошибка при загрузке транзакций через API/Web", extra={
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
        
        # Преобразуем дату (поддерживаем разные форматы: стандартный API, XML API и РН-Карт)
        transaction_date = self._parse_datetime(
            api_transaction.get("transaction_date") or  # XML API
            api_transaction.get("TransactionDatetime") or  # XML API (оригинальное поле)
            api_transaction.get("Date") or  # РН-Карт
            api_transaction.get("date") or
            api_transaction.get("dateReg") or
            api_transaction.get("dateRec")
        )
        
        if not transaction_date:
            logger.warning("Не удалось определить дату транзакции", extra={
                "transaction": api_transaction
            })
            return None
        
        # Преобразуем сумму и количество (поддерживаем разные форматы)
        amount = self._parse_decimal(
            api_transaction.get("amount") or  # Стандартный формат или уже преобразованное
            api_transaction.get("Sum") or  # РН-Карт
            api_transaction.get("ShopCost") or  # XML API
            api_transaction.get("PersonCost") or  # XML API (альтернатива)
            api_transaction.get("sum"),  # Стандартный формат
            default=Decimal("0")
        ) or Decimal("0")
        
        # Для XML API могут быть отрицательные значения для возвратов
        # Используем абсолютное значение суммы для отображения
        amount = abs(amount)
        
        # Количество/объем (поддерживаем разные форматы)
        quantity = self._parse_decimal(
            api_transaction.get("volume") or  # XML API (уже преобразованное)
            api_transaction.get("Volume") or  # XML API (оригинальное поле)
            api_transaction.get("Value") or  # РН-Карт (объем)
            api_transaction.get("quantity") or
            api_transaction.get("amount")
        ) or Decimal("0")
        
        # Для объема также используем абсолютное значение
        quantity = abs(quantity)
        
        # Определяем тип операции на основе знака суммы/объема в исходных данных
        # Если в исходных данных было отрицательное значение, это возврат
        raw_amount = api_transaction.get("Sum") or api_transaction.get("ShopCost") or api_transaction.get("amount") or 0
        raw_volume = api_transaction.get("Value") or api_transaction.get("Volume") or api_transaction.get("volume") or 0
        operation_type = "Возврат" if (isinstance(raw_amount, (int, float)) and raw_amount < 0) or \
                                       (isinstance(raw_volume, (int, float)) and raw_volume < 0) else "Покупка"
        
        # Формируем адрес
        address_parts = [
            api_transaction.get("posAddress") or api_transaction.get("address"),
            api_transaction.get("Address"),  # РН-Карт
            api_transaction.get("posTown"),
            api_transaction.get("posStreet"),
            api_transaction.get("posHouse"),
        ]
        address_candidates = [part for part in address_parts if part]
        resolved_address = (
            api_transaction.get("fullAddress") or
            api_transaction.get("posFullAddress") or
            api_transaction.get("Address") or  # РН-Карт
            ", ".join(dict.fromkeys(address_candidates))
        )
        
        # Парсим адрес из поля Address для РН-Карт, если Region и Settlement не указаны
        parsed_region = api_transaction.get("region") or api_transaction.get("Region")
        parsed_settlement = api_transaction.get("posTown") or api_transaction.get("settlement") or api_transaction.get("Settlement")
        parsed_location = resolved_address
        
        # Если адрес есть, но регион и населенный пункт не указаны, парсим из адреса
        rncard_address = api_transaction.get("Address")
        if rncard_address and isinstance(rncard_address, str) and rncard_address.strip():
            if not parsed_region or not parsed_settlement:
                parsed_data = self._parse_rncard_address(rncard_address)
                if parsed_data:
                    # Используем распарсенные данные только если они не были указаны отдельно
                    if not parsed_region and parsed_data.get("region"):
                        parsed_region = parsed_data["region"]
                    if not parsed_settlement and parsed_data.get("settlement"):
                        parsed_settlement = parsed_data["settlement"]
                    if parsed_data.get("location"):
                        parsed_location = parsed_data["location"]
        
        # Получаем оригинальное название АЗС (поддерживаем разные форматы)
        azs_original_name = str(
            api_transaction.get("azs_name") or  # XML API (уже преобразованное)
            api_transaction.get("AZS_NAME") or  # XML API (оригинальное поле)
            api_transaction.get("AZSName") or  # РН-Карт
            api_transaction.get("posName") or
            api_transaction.get("posBrand") or
            api_transaction.get("azsNumber") or
            ""
        )
        
        # Номер АЗС (поддерживаем разные форматы)
        azs_number = str(
            api_transaction.get("azs_number") or  # XML API (уже преобразованное)
            api_transaction.get("COD_AZS") or  # XML API (оригинальное поле)
            api_transaction.get("AZS") or  # РН-Карт
            api_transaction.get("PosCode") or  # РН-Карт (код точки продажи)
            api_transaction.get("azsNumber") or
            ""
        )
        
        # Если номер АЗС не найден напрямую, извлекаем из названия
        if not azs_number or azs_number.strip() == "":
            if azs_original_name:
                from app.services.normalization_service import extract_azs_number
                azs_number = extract_azs_number(azs_original_name) or ""
            
            # Логируем, если azs_number все еще пустой
            if not azs_number or azs_number.strip() == "":
                logger.warning("Поле azs_number пустое в транзакции", extra={
                    "api_transaction_keys": list(api_transaction.keys()),
                    "card_number": card_number,
                    "transaction_date": transaction_date,
                    "azs_original_name": azs_original_name,
                    "available_azs_fields": {
                        "azs_number": api_transaction.get("azs_number"),
                        "COD_AZS": api_transaction.get("COD_AZS"),
                        "AZS": api_transaction.get("AZS"),
                        "PosCode": api_transaction.get("PosCode"),
                        "azsNumber": api_transaction.get("azsNumber")
                    }
                })
        
        # Название товара/топлива (поддерживаем разные форматы)
        product = (
            api_transaction.get("product") or  # Стандартный формат или уже преобразованное
            api_transaction.get("Product") or  # РН-Карт
            api_transaction.get("GName") or  # РН-Карт (название товара из GName)
            api_transaction.get("ResourceName") or  # XML API (оригинальное поле)
            api_transaction.get("serviceName") or
            api_transaction.get("service") or
            ""
        )
        
        # Нормализуем product, если он пустой или содержит только пробелы
        if product:
            product = str(product).strip()
        else:
            product = ""
        
        # Логируем, если product пустой (для отладки)
        if not product:
            logger.warning("Поле product пустое в транзакции", extra={
                "api_transaction_keys": list(api_transaction.keys()),
                "card_number": card_number,
                "transaction_date": transaction_date,
                "available_product_fields": {
                    "product": api_transaction.get("product"),
                    "Product": api_transaction.get("Product"),
                    "GName": api_transaction.get("GName"),
                    "ResourceName": api_transaction.get("ResourceName"),
                    "serviceName": api_transaction.get("serviceName"),
                    "service": api_transaction.get("service")
                }
            })
        
        # Парсим координаты из поля PosCoord (формат: "широта,долгота")
        latitude = None
        longitude = None
        pos_coord = api_transaction.get("PosCoord") or api_transaction.get("posCoord") or api_transaction.get("pos_coord")
        if pos_coord:
            try:
                # Формат: "52.261365,104.35507"
                coords = str(pos_coord).strip().split(",")
                if len(coords) == 2:
                    lat_str = coords[0].strip()
                    lon_str = coords[1].strip()
                    latitude = float(lat_str) if lat_str else None
                    longitude = float(lon_str) if lon_str else None
                    # Проверяем валидность координат
                    if latitude is not None and (latitude < -90 or latitude > 90):
                        logger.warning(f"Некорректная широта: {latitude}", extra={"pos_coord": pos_coord})
                        latitude = None
                    if longitude is not None and (longitude < -180 or longitude > 180):
                        logger.warning(f"Некорректная долгота: {longitude}", extra={"pos_coord": pos_coord})
                        longitude = None
            except (ValueError, AttributeError) as e:
                logger.debug(f"Не удалось распарсить координаты из PosCoord: {pos_coord}", extra={
                    "pos_coord": pos_coord,
                    "error": str(e)
                })
        
        # Создаем транзакцию в формате системы
        system_transaction = {
            "transaction_date": transaction_date,
            "card_number": card_number or api_transaction.get("Card", ""),  # РН-Карт
            "vehicle": None,  # Будет определяться по маппингу или привязкам карты
            "azs_number": azs_number,
            "azs_original_name": azs_original_name,  # Сохраняем оригинальное название АЗС
            "supplier": api_transaction.get("supplier"),
            "region": parsed_region,  # Используем распарсенный регион
            "settlement": parsed_settlement,  # Используем распарсенный населенный пункт
            "location": parsed_location,  # Используем распарсенный адрес
            "location_code": api_transaction.get("posCode") or api_transaction.get("locationCode") or api_transaction.get("PosCode"),  # РН-Карт
            "product": product,
            "operation_type": operation_type,
            "quantity": quantity,
            "currency": api_transaction.get("currency") or self._get_currency_from_settings(template) or "RUB",
            "exchange_rate": Decimal("1"),
            "amount": amount,
            "provider_id": template.provider_id,
            "source_file": f"API_{template.provider_id}_{card_number}",
            # Координаты АЗС для сохранения при создании/обновлении АЗС
            "azs_latitude": latitude,
            "azs_longitude": longitude,
        }
        
        return system_transaction
    
    def _parse_rncard_address(self, address_str: str) -> Optional[Dict[str, str]]:
        """
        Парсинг адреса из формата РН-Карт для извлечения региона, населенного пункта и адреса
        
        Формат: "Россия, Республика Саха (Якутия), Ленский улус, г. Ленск, ул. Победы, 97"
        
        Args:
            address_str: Строка адреса
            
        Returns:
            Словарь с полями region, settlement, location или None
        """
        if not address_str or not isinstance(address_str, str):
            return None
        
        address_str = address_str.strip()
        if not address_str:
            return None
        
        # Разбиваем адрес по запятым
        parts = [part.strip() for part in address_str.split(",")]
        
        if len(parts) < 3:
            # Если частей меньше 3, возвращаем весь адрес как location
            return {
                "region": None,
                "settlement": None,
                "location": address_str
            }
        
        result = {
            "region": None,
            "settlement": None,
            "location": None
        }
        
        # Обычный формат: страна, регион, район/улус, населенный пункт, улица, дом
        # Пропускаем "Россия" (первая часть)
        # Регион обычно вторая часть (может содержать скобки)
        # Район/улус - третья часть (может отсутствовать)
        # Населенный пункт - обычно содержит "г.", "п.", "с.", "д." и т.д.
        # Улица и дом - последние части
        
        region_candidates = []
        settlement_candidates = []
        location_parts = []
        
        # Пропускаем первую часть (обычно "Россия")
        start_idx = 1 if len(parts) > 1 and parts[0].lower() in ["россия", "russia"] else 0
        
        # Ищем регион (обычно вторая или третья часть, может содержать скобки)
        for i in range(start_idx, min(start_idx + 3, len(parts))):
            part = parts[i]
            # Регион часто содержит слова: "область", "край", "республика", "автономный"
            if any(keyword in part.lower() for keyword in ["область", "край", "республика", "автономный", "округ"]):
                region_candidates.append(part)
                start_idx = i + 1
                break
        
        # Ищем населенный пункт (обычно содержит префиксы: "г.", "п.", "с.", "д.", "пос.")
        for i in range(start_idx, len(parts)):
            part = parts[i]
            # Населенный пункт часто начинается с префикса
            if any(part.lower().startswith(prefix) for prefix in ["г.", "п.", "с.", "д.", "пос.", "пгт.", "ст.", "х."]):
                settlement_candidates.append(part)
                start_idx = i + 1
                break
            # Или может быть просто название города без префикса (если это не улица)
            elif i < len(parts) - 2 and not any(keyword in part.lower() for keyword in ["ул.", "улица", "проспект", "пр.", "переулок", "пер."]):
                settlement_candidates.append(part)
                start_idx = i + 1
                break
        
        # Остальные части - это адрес (улица, дом)
        if start_idx < len(parts):
            location_parts = parts[start_idx:]
        
        # Формируем результат
        if region_candidates:
            result["region"] = region_candidates[0]
        
        if settlement_candidates:
            result["settlement"] = settlement_candidates[0]
        
        if location_parts:
            result["location"] = ", ".join(location_parts)
        elif not result["region"] and not result["settlement"]:
            # Если ничего не распарсили, возвращаем весь адрес как location
            result["location"] = address_str
        
        logger.debug("Парсинг адреса РН-Карт", extra={
            "original_address": address_str,
            "parsed_region": result["region"],
            "parsed_settlement": result["settlement"],
            "parsed_location": result["location"]
        })
        
        return result
    
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

