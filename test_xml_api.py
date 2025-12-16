#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Скрипт для быстрого тестирования XML API подключения
"""
import requests
import json
import sys
import os
from datetime import date, timedelta

# Устанавливаем кодировку для Windows
if sys.platform == 'win32':
    os.system('chcp 65001 >nul 2>&1')
    sys.stdout.reconfigure(encoding='utf-8') if hasattr(sys.stdout, 'reconfigure') else None

# Настройки
API_BASE_URL = "http://localhost:8000"  # Измените на ваш URL бэкенда
TEMPLATE_ID = None  # Укажите ID шаблона, если он уже создан

# Параметры подключения к XML API
CONNECTION_SETTINGS = {
    "base_url": "http://176.222.217.51:1342",
    "certificate": "545.1AFB41693CD79C72796D7B56F2D727B8B343BF17",
    "pos_code": 23,
    "endpoint": "http://176.222.217.51:1342/sncapi/sale"  # Полный URL endpoint для получения транзакций
}

def test_connection():
    """Тест подключения к XML API"""
    print("=" * 80)
    print("ТЕСТ 1: Проверка подключения к XML API")
    print("=" * 80)
    
    url = f"{API_BASE_URL}/api/v1/templates/test-api-connection?connection_type=web"
    
    try:
        response = requests.post(
            url,
            json=CONNECTION_SETTINGS,
            headers={"Content-Type": "application/json"}
        )
        
        print(f"Статус: {response.status_code}")
        print(f"Ответ: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")
        
        if response.status_code == 200:
            result = response.json()
            if result.get("success"):
                print("[OK] Подключение успешно!")
                return True
            else:
                print(f"[ERROR] Ошибка подключения: {result.get('message', 'Неизвестная ошибка')}")
                return False
        else:
            print(f"[ERROR] Ошибка HTTP: {response.status_code}")
            print(f"Детали: {response.text}")
            return False
            
    except Exception as e:
        print(f"[ERROR] Исключение: {str(e)}")
        return False

def test_load_transactions(template_id, date_from=None, date_to=None, card_numbers=None):
    """Тест загрузки транзакций"""
    if not template_id:
        print("⚠️  Пропущен тест загрузки транзакций: не указан template_id")
        return False
    
    print("\n" + "=" * 80)
    print("ТЕСТ 2: Загрузка транзакций через XML API")
    print("=" * 80)
    
    # По умолчанию используем последние 7 дней
    if not date_from:
        date_from = (date.today() - timedelta(days=7)).strftime("%Y-%m-%d")
    if not date_to:
        date_to = date.today().strftime("%Y-%m-%d")
    
    url = f"{API_BASE_URL}/api/v1/transactions/load-from-api"
    params = {
        "template_id": template_id,
        "date_from": date_from,
        "date_to": date_to
    }
    
    if card_numbers:
        params["card_numbers"] = card_numbers
    
    try:
        response = requests.post(url, params=params)
        
        print(f"Статус: {response.status_code}")
        print(f"Параметры: {params}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"Ответ: {json.dumps(result, indent=2, ensure_ascii=False)}")
            
            if result.get("success"):
                print(f"[OK] Загружено транзакций: {result.get('transactions_created', 0)}")
                return True
            else:
                print(f"[ERROR] Ошибка загрузки: {result.get('message', 'Неизвестная ошибка')}")
                return False
        else:
            print(f"[ERROR] Ошибка HTTP: {response.status_code}")
            print(f"Детали: {response.text}")
            return False
            
    except Exception as e:
        print(f"[ERROR] Исключение: {str(e)}")
        return False

def main():
    """Главная функция"""
    print("\n" + "=" * 80)
    print("ТЕСТИРОВАНИЕ XML API С СЕРТИФИКАТОМ")
    print("=" * 80)
    print(f"\nНастройки подключения:")
    print(f"  Базовый URL: {CONNECTION_SETTINGS['base_url']}")
    print(f"  Сертификат: {CONNECTION_SETTINGS['certificate'][:30]}...")
    print(f"  POS Code: {CONNECTION_SETTINGS['pos_code']}")
    print(f"\nAPI Backend: {API_BASE_URL}")
    
    # Тест 1: Проверка подключения
    connection_ok = test_connection()
    
    if not connection_ok:
        print("\n[ERROR] Тест подключения не пройден. Проверьте настройки и логи.")
        sys.exit(1)
    
    # Тест 2: Загрузка транзакций (если указан template_id)
    if TEMPLATE_ID:
        load_ok = test_load_transactions(
            template_id=TEMPLATE_ID,
            card_numbers="3000000110013446,3000000100000227"  # Тестовые карты из примера
        )
        
        if not load_ok:
            print("\n[WARNING] Тест загрузки транзакций не пройден.")
    else:
        print("\n[INFO] Для теста загрузки транзакций укажите TEMPLATE_ID в скрипте")
    
    print("\n" + "=" * 80)
    print("ТЕСТИРОВАНИЕ ЗАВЕРШЕНО")
    print("=" * 80)

if __name__ == "__main__":
    main()
