"""
Конфигурация для E2E тестов
"""
import os
import pytest
import socket
import urllib.request
from playwright.sync_api import sync_playwright, Browser, BrowserContext, Page


def find_available_frontend_host(host: str = None, port: int = 3000, timeout: float = 2.0) -> tuple[bool, str]:
    """
    Поиск доступного хоста фронтенда
    
    Пробует несколько вариантов доступа к хосту:
    - host.docker.internal (для Docker на Windows/Mac)
    - localhost
    - 172.17.0.1 (стандартный gateway Docker)
    
    Args:
        host: Хост фронтенда (если None, пробует несколько вариантов)
        port: Порт фронтенда
        timeout: Таймаут подключения в секундах
    
    Returns:
        Tuple (is_available, found_host): True и найденный хост если доступен, False и None иначе
    """
    # Получаем хост из переменной окружения или используем список вариантов
    if host is None:
        # Пробуем несколько вариантов доступа к хосту
        hosts_to_try = [
            os.getenv("E2E_FRONTEND_HOST", ""),  # Пользовательская настройка
            "host.docker.internal",  # Docker на Windows/Mac
            "172.17.0.1",  # Стандартный Docker gateway
            "localhost",  # Локальный хост
        ]
        # Убираем пустые значения
        hosts_to_try = [h for h in hosts_to_try if h]
    else:
        hosts_to_try = [host]
    
    # Пробуем подключиться через socket
    for host_to_try in hosts_to_try:
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(timeout)
            result = sock.connect_ex((host_to_try, port))
            sock.close()
            if result == 0:
                # Дополнительно проверяем через HTTP запрос
                try:
                    url = f"http://{host_to_try}:{port}"
                    req = urllib.request.Request(url, method="HEAD")
                    urllib.request.urlopen(req, timeout=timeout)
                    return (True, host_to_try)
                except Exception:
                    # Если HTTP не работает, но socket работает, все равно считаем доступным
                    return (True, host_to_try)
        except Exception:
            continue
    
    return (False, None)


def is_frontend_available(host: str = None, port: int = 3000, timeout: float = 2.0) -> bool:
    """
    Проверка доступности фронтенда (обратная совместимость)
    """
    is_available, _ = find_available_frontend_host(host, port, timeout)
    return is_available


@pytest.fixture(scope="session")
def frontend_host():
    """
    Определение доступного хоста фронтенда
    
    Если фронтенд недоступен, все E2E тесты будут пропущены с информативным сообщением.
    
    Returns:
        Найденный хост фронтенда
    """
    frontend_host_env = os.getenv("E2E_FRONTEND_HOST")
    frontend_port = int(os.getenv("E2E_FRONTEND_PORT", "3000"))
    
    is_available, found_host = find_available_frontend_host(
        host=frontend_host_env, 
        port=frontend_port
    )
    
    if not is_available:
        host_info = frontend_host_env if frontend_host_env else "localhost/host.docker.internal"
        pytest.skip(
            f"Frontend недоступен на http://{host_info}:{frontend_port}. "
            "Запустите фронтенд перед выполнением E2E тестов:\n"
            "  cd frontend && npm run dev\n\n"
            "Если фронтенд запущен на хосте, а тесты в Docker, попробуйте:\n"
            "  E2E_FRONTEND_HOST=host.docker.internal pytest tests/e2e/ -v"
        )
    
    return found_host


@pytest.fixture(scope="session")
def frontend_available(frontend_host):
    """
    Проверка доступности фронтенда (обратная совместимость)
    """
    return True


@pytest.fixture(scope="session")
def browser(frontend_host):
    """
    Создание браузера для всех тестов
    
    Args:
        frontend_host: Фикстура определения доступного хоста фронтенда
    """
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        yield browser
        browser.close()


@pytest.fixture(scope="function")
def page(browser: Browser) -> Page:
    """Создание новой страницы для каждого теста"""
    context = browser.new_context()
    page = context.new_page()
    yield page
    context.close()

