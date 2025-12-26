"""
E2E тесты для критических пользовательских сценариев
Требуется Playwright: pip install playwright && playwright install

ВАЖНО: Перед запуском E2E тестов убедитесь, что фронтенд запущен:
  cd frontend && npm run dev
"""
import pytest
from playwright.sync_api import Page, expect


@pytest.fixture(scope="module")
def base_url(frontend_host):
    """Базовый URL приложения"""
    import os
    frontend_port = os.getenv("E2E_FRONTEND_PORT", "3000")
    return f"http://{frontend_host}:{frontend_port}"


@pytest.mark.e2e
class TestAuthFlow:
    """E2E тесты для потока аутентификации"""
    
    def test_login_logout_flow(self, page: Page, base_url: str):
        """Тест полного цикла: вход → использование → выход"""
        page.goto(base_url)
        
        # Проверяем, что мы на странице логина (или главной)
        # В зависимости от реализации, может быть редирект на /login
        
        # Если есть форма логина
        if page.locator('input[type="text"], input[name="username"]').count() > 0:
            # Заполняем форму логина
            username_input = page.locator('input[name="username"], input[type="text"]').first
            password_input = page.locator('input[name="password"], input[type="password"]').first
            
            username_input.fill("admin")
            password_input.fill("admin")  # Замените на тестовый пароль
            
            # Нажимаем кнопку входа
            login_button = page.locator('button:has-text("Войти"), button[type="submit"]').first
            login_button.click()
            
            # Ждем успешного входа (проверяем наличие элементов дашборда)
            expect(page).to_have_url(f"{base_url}/", timeout=10000)
            
            # Проверяем, что мы авторизованы (например, видим имя пользователя)
            # Это зависит от вашей реализации UI
        
        # Тест выхода
        # Ищем кнопку выхода (может быть в меню)
        logout_button = page.locator('button:has-text("Выход"), a:has-text("Выход")').first
        if logout_button.count() > 0:
            logout_button.click()
            
            # Проверяем, что мы вышли (редирект на страницу логина)
            expect(page).to_have_url(f"{base_url}/login", timeout=5000)


@pytest.mark.e2e
class TestTransactionsView:
    """E2E тесты для просмотра транзакций"""
    
    def test_view_transactions_list(self, page: Page, base_url: str):
        """Тест просмотра списка транзакций"""
        # Сначала логинимся
        page.goto(f"{base_url}/login", wait_until="networkidle")
        
        # Если есть форма логина
        username_input = page.locator('input[name="username"], input[type="text"]').first
        if username_input.count() > 0:
            username_input.wait_for(state="visible", timeout=10000)
            username_input.fill("admin")
            
            password_input = page.locator('input[name="password"], input[type="password"]').first
            password_input.fill("admin")
            
            login_button = page.locator('button[type="submit"], button:has-text("Войти")').first
            login_button.click()
            
            # Ждем перехода после логина
            try:
                page.wait_for_load_state("networkidle", timeout=10000)
            except Exception:
                pass
            
            # Проверяем наличие ошибок на странице
            error_messages = page.locator('.error, [role="alert"], .toast-error').all()
            if error_messages:
                error_text = " | ".join([msg.inner_text() for msg in error_messages[:3]])
                raise AssertionError(f"Ошибка при логине: {error_text}")
            
            # Проверяем, что мы не на странице логина
            current_url = page.url
            if "/login" in current_url:
                # Ждем еще немного - возможно, редирект задерживается
                page.wait_for_timeout(2000)
                current_url = page.url
                if "/login" in current_url:
                    raise AssertionError(f"Остались на странице логина после попытки входа. URL: {current_url}")
        
        # Переходим на dashboard если нужно
        if "/dashboard" not in page.url:
            page.goto(f"{base_url}/dashboard", wait_until="networkidle")
        
        # Переходим на страницу транзакций
        page.goto(f"{base_url}/transactions", wait_until="networkidle")
        
        # Ждем загрузки страницы
        page.wait_for_load_state("networkidle", timeout=10000)
        
        # Проверяем, что страница загрузилась (ищем любой контент)
        page_content = page.locator("body")
        expect(page_content).to_be_visible(timeout=5000)


@pytest.mark.e2e
class TestDashboard:
    """E2E тесты для дашборда"""
    
    def test_dashboard_loads(self, page: Page, base_url: str):
        """Тест загрузки дашборда"""
        # Сначала логинимся
        page.goto(f"{base_url}/login", wait_until="networkidle")
        
        # Если есть форма логина
        username_input = page.locator('input[name="username"], input[type="text"]').first
        if username_input.count() > 0:
            username_input.wait_for(state="visible", timeout=10000)
            username_input.fill("admin")
            
            password_input = page.locator('input[name="password"], input[type="password"]').first
            password_input.fill("admin")
            
            login_button = page.locator('button[type="submit"], button:has-text("Войти")').first
            login_button.click()
            
            # Ждем перехода после логина
            try:
                page.wait_for_load_state("networkidle", timeout=10000)
            except Exception:
                pass
            
            # Проверяем наличие ошибок на странице
            error_messages = page.locator('.error, [role="alert"], .toast-error').all()
            if error_messages:
                error_text = " | ".join([msg.inner_text() for msg in error_messages[:3]])
                raise AssertionError(f"Ошибка при логине: {error_text}")
            
            # Проверяем, что мы не на странице логина
            current_url = page.url
            if "/login" in current_url:
                # Ждем еще немного - возможно, редирект задерживается
                page.wait_for_timeout(2000)
                current_url = page.url
                if "/login" in current_url:
                    raise AssertionError(f"Остались на странице логина после попытки входа. URL: {current_url}")
        
        # Переходим на dashboard если нужно
        if "/dashboard" not in page.url:
            page.goto(f"{base_url}/dashboard", wait_until="networkidle")
        
        # Ждем загрузки дашборда
        page.wait_for_load_state("networkidle", timeout=10000)
        
        # Проверяем, что страница загрузилась (ищем любой контент)
        page_content = page.locator("body")
        expect(page_content).to_be_visible(timeout=5000)

