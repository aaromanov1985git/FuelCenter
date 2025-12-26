"""
E2E тесты для критических пользовательских сценариев
Требуется Playwright: pip install playwright && playwright install
"""
import pytest
from playwright.sync_api import Page, expect


@pytest.fixture(scope="module")
def base_url():
    """Базовый URL приложения"""
    return "http://localhost:3000"


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
        # Предполагаем, что пользователь уже авторизован
        # В реальном тесте нужно сначала выполнить логин
        
        page.goto(f"{base_url}/transactions")
        
        # Ждем загрузки списка
        page.wait_for_selector('table, .transaction-list, [data-testid="transactions"]', timeout=10000)
        
        # Проверяем наличие элементов списка
        # Это зависит от вашей реализации UI
        transactions = page.locator('tr, .transaction-item, [data-testid="transaction"]')
        expect(transactions.first).to_be_visible(timeout=5000)


@pytest.mark.e2e
class TestDashboard:
    """E2E тесты для дашборда"""
    
    def test_dashboard_loads(self, page: Page, base_url: str):
        """Тест загрузки дашборда"""
        page.goto(base_url)
        
        # Ждем загрузки дашборда
        page.wait_for_selector('.dashboard, [data-testid="dashboard"]', timeout=10000)
        
        # Проверяем наличие статистики
        stats = page.locator('.stat, [data-testid="stat"]')
        expect(stats.first).to_be_visible(timeout=5000)

