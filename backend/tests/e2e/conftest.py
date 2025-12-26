"""
Конфигурация для E2E тестов
"""
import pytest
from playwright.sync_api import sync_playwright, Browser, BrowserContext, Page


@pytest.fixture(scope="session")
def browser():
    """Создание браузера для всех тестов"""
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

