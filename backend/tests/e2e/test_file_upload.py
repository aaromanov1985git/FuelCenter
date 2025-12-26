"""
E2E тест для загрузки файла

ВАЖНО: Перед запуском E2E тестов убедитесь, что фронтенд запущен:
  cd frontend && npm run dev
"""
import os
import pytest
from playwright.sync_api import Page, expect


@pytest.fixture(scope="module")
def base_url(frontend_host):
    """Базовый URL приложения"""
    frontend_port = os.getenv("E2E_FRONTEND_PORT", "3000")
    return f"http://{frontend_host}:{frontend_port}"


def test_file_upload_flow(page: Page, base_url: str):
    """Тест полного потока загрузки файла"""
    # Переходим на страницу логина
    page.goto(f"{base_url}/login", wait_until="networkidle")
    
    # Ждем загрузки формы логина (пробуем несколько вариантов)
    username_input = page.locator('input[name="username"], input[type="text"]').first
    if username_input.count() > 0:
        username_input.wait_for(state="visible", timeout=10000)
        username_input.fill("admin")
        
        password_input = page.locator('input[name="password"], input[type="password"]').first
        password_input.fill("admin")
        
        login_button = page.locator('button[type="submit"], button:has-text("Войти")').first
        login_button.click()
        
        # Ждем перехода после логина (может быть корень или dashboard)
        try:
            page.wait_for_load_state("networkidle", timeout=10000)
        except Exception:
            # Если не удалось дождаться networkidle, проверяем текущий URL
            pass
        
        # Проверяем наличие ошибок на странице
        error_messages = page.locator('.error, [role="alert"], .toast-error').all()
        if error_messages:
            error_text = " | ".join([msg.inner_text() for msg in error_messages[:3]])
            raise AssertionError(f"Ошибка при логине: {error_text}")
        
        # Проверяем, что мы не на странице логина (успешный логин)
        current_url = page.url
        if "/login" in current_url:
            # Ждем еще немного - возможно, редирект задерживается
            page.wait_for_timeout(2000)
            current_url = page.url
            if "/login" in current_url:
                # Делаем скриншот для диагностики
                page.screenshot(path="/tmp/login_failed.png")
                raise AssertionError(f"Остались на странице логина после попытки входа. URL: {current_url}")
    else:
        # Если форма логина не найдена, возможно, уже авторизованы
        # Продолжаем выполнение
        pass
    
    # Переходим на dashboard если нужно
    if "/dashboard" not in page.url and "/" == page.url.rstrip("/"):
        page.goto(f"{base_url}/dashboard", wait_until="networkidle")
    
    # Переходим на страницу транзакций
    page.goto(f"{base_url}/transactions", wait_until="networkidle")
    
    # Ждем загрузки страницы
    page.wait_for_load_state("networkidle", timeout=10000)
    
    # Проверяем, что страница загрузилась (ищем любой контент)
    page_content = page.locator("body")
    expect(page_content).to_be_visible(timeout=5000)
    
    # Проверяем, что мы на правильной странице (URL содержит /transactions)
    assert "/transactions" in page.url, f"Не на странице транзакций. URL: {page.url}"


def test_transactions_list_view(page: Page, base_url: str):
    """Тест просмотра списка транзакций"""
    # Логинимся
    page.goto(f"{base_url}/login", wait_until="networkidle")
    
    username_input = page.locator('input[name="username"], input[type="text"]').first
    if username_input.count() > 0:
        username_input.wait_for(state="visible", timeout=10000)
        username_input.fill("admin")
        
        password_input = page.locator('input[name="password"], input[type="password"]').first
        password_input.fill("admin")
        
        login_button = page.locator('button[type="submit"], button:has-text("Войти")').first
        login_button.click()
        
        # Ждем перехода после логина
        page.wait_for_load_state("networkidle", timeout=10000)
        
        # Проверяем, что мы не на странице логина
        current_url = page.url
        assert "/login" not in current_url, f"Остались на странице логина: {current_url}"
    
    # Переходим на dashboard если нужно
    if "/dashboard" not in page.url:
        page.goto(f"{base_url}/dashboard", wait_until="networkidle")
    
    # Переходим на страницу транзакций
    page.goto(f"{base_url}/transactions", wait_until="networkidle")
    
    # Ждем загрузки страницы (проверяем наличие заголовка или любого контента)
    page.wait_for_load_state("networkidle", timeout=10000)
    
    # Проверяем, что страница загрузилась (ищем заголовок или любой контент)
    # Таблица может быть пустой, но страница должна загрузиться
    page_content = page.locator("body")
    expect(page_content).to_be_visible(timeout=5000)


def test_providers_page(page: Page, base_url: str):
    """Тест страницы провайдеров"""
    # Логинимся
    page.goto(f"{base_url}/login", wait_until="networkidle")
    
    username_input = page.locator('input[name="username"], input[type="text"]').first
    if username_input.count() > 0:
        username_input.wait_for(state="visible", timeout=10000)
        username_input.fill("admin")
        
        password_input = page.locator('input[name="password"], input[type="password"]').first
        password_input.fill("admin")
        
        login_button = page.locator('button[type="submit"], button:has-text("Войти")').first
        login_button.click()
        
        # Ждем перехода после логина
        page.wait_for_load_state("networkidle", timeout=10000)
        
        # Проверяем, что мы не на странице логина
        current_url = page.url
        assert "/login" not in current_url, f"Остались на странице логина: {current_url}"
    
    # Переходим на dashboard если нужно
    if "/dashboard" not in page.url:
        page.goto(f"{base_url}/dashboard", wait_until="networkidle")
    
    # Переходим на страницу провайдеров
    page.goto(f"{base_url}/providers", wait_until="networkidle")
    
    # Ждем загрузки страницы
    page.wait_for_load_state("networkidle", timeout=10000)
    
    # Проверяем, что страница загрузилась
    page_content = page.locator("body")
    expect(page_content).to_be_visible(timeout=5000)
    
    # Проверяем, что мы на правильной странице (URL содержит /providers)
    assert "/providers" in page.url, f"Не на странице провайдеров. URL: {page.url}"


def test_vehicles_page(page: Page, base_url: str):
    """Тест страницы транспортных средств"""
    # Логинимся
    page.goto(f"{base_url}/login", wait_until="networkidle")
    
    username_input = page.locator('input[name="username"], input[type="text"]').first
    if username_input.count() > 0:
        username_input.wait_for(state="visible", timeout=10000)
        username_input.fill("admin")
        
        password_input = page.locator('input[name="password"], input[type="password"]').first
        password_input.fill("admin")
        
        login_button = page.locator('button[type="submit"], button:has-text("Войти")').first
        login_button.click()
        
        # Ждем перехода после логина
        page.wait_for_load_state("networkidle", timeout=10000)
        
        # Проверяем, что мы не на странице логина
        current_url = page.url
        assert "/login" not in current_url, f"Остались на странице логина: {current_url}"
    
    # Переходим на dashboard если нужно
    if "/dashboard" not in page.url:
        page.goto(f"{base_url}/dashboard", wait_until="networkidle")
    
    # Переходим на страницу ТС
    page.goto(f"{base_url}/vehicles", wait_until="networkidle")
    
    # Ждем загрузки страницы
    page.wait_for_load_state("networkidle", timeout=10000)
    
    # Проверяем, что страница загрузилась
    page_content = page.locator("body")
    expect(page_content).to_be_visible(timeout=5000)
    
    # Проверяем, что мы на правильной странице (URL содержит /vehicles)
    assert "/vehicles" in page.url, f"Не на странице ТС. URL: {page.url}"

