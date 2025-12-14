"""Тестирование подключения к веб-провайдеру через новый адаптер"""
import asyncio
import sys
import os

# Добавляем путь к backend
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from app.services.api_provider_service import ApiProviderService, WebAdapter
from app.models import ProviderTemplate
from sqlalchemy.orm import Session
from app.database import SessionLocal

async def test_web_adapter():
    """Тестирование WebAdapter напрямую"""
    print("Testing WebAdapter directly...")
    
    base_url = "http://176.222.217.51:8080"
    username = "8614006094т"
    password = "8614006094т"
    
    async with WebAdapter(base_url, username, password) as adapter:
        # Тест healthcheck
        print("\n1. Testing healthcheck...")
        health = await adapter.healthcheck()
        print(f"   Healthcheck result: {health}")
        
        # Тест получения списка карт
        print("\n2. Testing list_cards...")
        cards = await adapter.list_cards()
        print(f"   Found {len(cards)} cards")
        if cards:
            print(f"   First 5 cards: {cards[:5]}")
        
        # Тест получения полей
        print("\n3. Testing get_transaction_fields...")
        fields = await adapter.get_transaction_fields()
        print(f"   Fields: {fields}")

async def test_through_service():
    """Тестирование через ApiProviderService"""
    print("\n\nTesting through ApiProviderService...")
    
    db = SessionLocal()
    try:
        service = ApiProviderService(db)
        
        # Создаем временный шаблон
        template = ProviderTemplate(
            connection_type="web",
            connection_settings='{"base_url": "http://176.222.217.51:8080", "username": "8614006094т", "password": "8614006094т"}',
            field_mapping={},
            provider_id=1
        )
        
        # Тест подключения
        print("\n1. Testing connection...")
        result = await service.test_connection(template)
        print(f"   Connection test: {result}")
        
        # Тест получения полей
        print("\n2. Testing get_api_fields...")
        fields_result = await service.get_api_fields(template)
        print(f"   Fields result: {fields_result}")
        
    finally:
        db.close()

if __name__ == "__main__":
    print("=" * 60)
    print("Testing Web Provider Integration")
    print("=" * 60)
    
    # Тест адаптера напрямую
    asyncio.run(test_web_adapter())
    
    # Тест через сервис
    asyncio.run(test_through_service())
    
    print("\n" + "=" * 60)
    print("Tests completed!")
    print("=" * 60)
