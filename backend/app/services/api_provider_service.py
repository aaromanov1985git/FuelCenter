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


class WebAdapter:
    """
    Адаптер для работы с веб-сервисом через API авторизацию
    
    Примечание: Если возникает ошибка 403 Forbidden, это может означать, что сервер
    использует защиту от ботов, требующую выполнения JavaScript. В таком случае,
    может потребоваться использование библиотеки Playwright для полной имитации браузера.
    См. WEB_SERVICE_CONNECTION_ISSUES.md для подробностей.
    """
    
    def __init__(self, base_url: str, username: str, password: str, currency: str = "RUB"):
        """
        Инициализация адаптера веб-сервиса
        
        Args:
            base_url: Базовый URL сервиса (например, "http://176.222.217.51:8080")
            username: Имя пользователя для авторизации
            password: Пароль для авторизации
            currency: Валюта по умолчанию
        """
        # Нормализуем базовый URL (убираем лишние слэши и пробелы)
        self.base_url = base_url.strip().rstrip('/')
        self.username = username
        self.password = password
        self.currency = currency
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
        print(f"{'='*80}\n")
        
        logger.info(f"=== НАЧАЛО АВТОРИЗАЦИИ В ВЕБ-СЕРВИСЕ ===", extra={
            "base_url": base_url,
            "login_url": login_url,
            "username": self.username,
            "method": "WebAdapter._authenticate"
        })
        
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
            
            # Если получили 403, сразу пробуем Playwright
            if response.status_code == 403:
                print(f"\n{'!'*80}")
                print(f"!!! ПОЛУЧЕН 403 FORBIDDEN, ЗАПУСКАЕМ PLAYWRIGHT !!!")
                print(f"Тело ответа: {response.text[:500]}")
                print(f"{'!'*80}\n")
                
                logger.error("=== ПОЛУЧЕН 403 FORBIDDEN, ЗАПУСКАЕМ PLAYWRIGHT ===")
                logger.error(f"Тело ответа: {response.text[:500]}")
                try:
                    print("Вызываем _authenticate_with_playwright...")
                    playwright_token = await self._authenticate_with_playwright(base_url)
                    if playwright_token:
                        print(f"!!! PLAYWRIGHT УСПЕШНО ВЕРНУЛ ТОКЕН !!!")
                        self.access_token = playwright_token
                        logger.info("=== АВТОРИЗАЦИЯ ЧЕРЕЗ PLAYWRIGHT УСПЕШНА! ===")
                        return
                    else:
                        print(f"!!! PLAYWRIGHT НЕ ВЕРНУЛ ТОКЕН !!!")
                        logger.error("=== PLAYWRIGHT НЕ ВЕРНУЛ ТОКЕН ===")
                        # Если Playwright не вернул токен, все равно пробуем продолжить с ошибкой
                        response.raise_for_status()
                except Exception as pw_error:
                    print(f"!!! ОШИБКА ПРИ ИСПОЛЬЗОВАНИИ PLAYWRIGHT: {str(pw_error)} !!!")
                    import traceback
                    print(traceback.format_exc())
                    logger.error(f"=== ОШИБКА ПРИ ИСПОЛЬЗОВАНИИ PLAYWRIGHT: {str(pw_error)} ===", exc_info=True)
                    # Если Playwright упал с ошибкой, пробуем продолжить с исходной ошибкой
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
            
            # Если это 403, пробуем несколько альтернативных подходов
            if e.response.status_code == 403:
                logger.error("=== В БЛОКЕ EXCEPT: ПОЛУЧЕН 403 FORBIDDEN ===")
                logger.warning("Получен 403 Forbidden, пробуем альтернативные подходы")
                
                # Сначала пробуем Playwright (самый надежный способ)
                logger.info("Пробуем подход 0: Авторизация через Playwright (полная имитация браузера)")
                try:
                    playwright_token = await self._authenticate_with_playwright(base_url)
                    if playwright_token:
                        self.access_token = playwright_token
                        logger.info("=== АВТОРИЗАЦИЯ ЧЕРЕЗ PLAYWRIGHT УСПЕШНА (из блока except)! ===")
                        return
                except Exception as playwright_error:
                    logger.warning(f"Playwright подход не сработал: {str(playwright_error)}")
                
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
                
                # Подход 3: Использование Playwright для полной имитации браузера
                logger.info("Пробуем подход 3: Авторизация через Playwright (полная имитация браузера)")
                try:
                    playwright_token = await self._authenticate_with_playwright(base_url)
                    if playwright_token:
                        self.access_token = playwright_token
                        logger.info("Авторизация через Playwright успешна!")
                        return
                except Exception as playwright_error:
                    logger.warning(f"Playwright подход не сработал: {str(playwright_error)}")
                
                # Если все подходы не сработали, выбрасываем исходную ошибку
                logger.error("Все альтернативные подходы не сработали, возвращаем исходную ошибку 403")
            
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
        cards = await self._get_json("/api/cards")
        # API возвращает список чисел, преобразуем в строки
        if isinstance(cards, list):
            return [str(card) for card in cards if card is not None]
        return []
    
    async def fetch_card_transactions(
        self,
        card_number: str,
        date_from: date,
        date_to: date
    ) -> List[Dict[str, Any]]:
        """
        Получение транзакций по карте за период
        
        Примечание: Этот метод возвращает пустой список, так как API для транзакций
        не был найден. В будущем можно добавить веб-скрапинг или найти правильный endpoint.
        
        Args:
            card_number: Номер карты
            date_from: Начальная дата периода
            date_to: Конечная дата периода
            
        Returns:
            Список транзакций (пока пустой)
        """
        # TODO: Найти правильный API endpoint для получения транзакций
        # Пока возвращаем пустой список, так как endpoint не найден
        logger.warning("API endpoint для транзакций не найден", extra={
            "card_number": card_number,
            "date_from": str(date_from),
            "date_to": str(date_to)
        })
        return []
    
    async def healthcheck(self) -> Dict[str, Any]:
        """
        Проверка доступности API
        
        Returns:
            Результат проверки
        """
        try:
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
            Список имен полей (пока стандартные, так как API для транзакций не найден)
        """
        # Возвращаем стандартные поля, так как API для транзакций не найден
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
        try:
            if isinstance(template.connection_settings, str):
                settings = json.loads(template.connection_settings)
            elif template.connection_settings is None:
                raise ValueError("Настройки подключения не указаны")
            else:
                settings = template.connection_settings
        except (json.JSONDecodeError, TypeError) as e:
            raise ValueError(f"Неверный формат настроек подключения: {str(e)}")
        
        currency = settings.get("currency", "RUB")
        
        # Для типа "web" используем WebAdapter
        if template.connection_type == "web":
            base_url = settings.get("base_url") or settings.get("api_url")
            username = settings.get("username") or settings.get("login") or settings.get("user")
            password = settings.get("password") or settings.get("pass")
            
            if not base_url:
                raise ValueError("Не указан базовый URL (base_url или api_url)")
            if not username:
                raise ValueError("Не указано имя пользователя (username, login или user)")
            if not password:
                raise ValueError("Не указан пароль (password или pass)")
            
            return WebAdapter(base_url, username, password, currency)
        
        # Для типа "api" используем существующую логику
        provider_type = settings.get("provider_type", "petrolplus")
        base_url = settings.get("base_url") or settings.get("api_url")
        api_token = settings.get("api_token") or settings.get("token") or settings.get("api_key")
        
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
            
            if status_code == 403:
                # Проверяем, может быть это из-за капчи
                if 'captcha' in error_text.lower() or 'капча' in error_text.lower():
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
                # Если карты не указаны, получаем список всех карт
                if not card_numbers:
                    cards_data = await adapter.list_cards()
                    # Для WebAdapter list_cards возвращает список строк, для PetrolPlusAdapter - список словарей
                    if cards_data and isinstance(cards_data[0], dict):
                        card_numbers = [str(card.get("cardNum") or "") for card in cards_data if card.get("cardNum")]
                    else:
                        card_numbers = [str(card) for card in cards_data if card]
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
        
        # Получаем оригинальное название АЗС
        azs_original_name = str(api_transaction.get("posName") or api_transaction.get("posBrand") or api_transaction.get("azsNumber") or "")
        # Извлекаем номер АЗС из названия
        from app.services.normalization_service import extract_azs_number
        azs_number = extract_azs_number(azs_original_name) if azs_original_name else ""
        
        # Создаем транзакцию в формате системы
        system_transaction = {
            "transaction_date": transaction_date,
            "card_number": card_number,
            "vehicle": None,  # Будет определяться по маппингу или привязкам карты
            "azs_number": azs_number,
            "azs_original_name": azs_original_name,  # Сохраняем оригинальное название АЗС
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

