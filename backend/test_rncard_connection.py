#!/usr/bin/env python3
"""
Тестовый скрипт для проверки подключения к API РН-Карт
Сравнение с рабочим PowerShell скриптом
"""
import asyncio
import httpx
import hashlib
import base64
import uuid

async def test_rncard_connection():
    """Тест подключения к API РН-Карт"""
    
    # Параметры из PowerShell скрипта
    login = "UTT_engineer"
    contract = "ISS155717"
    password = "ZAQ!2wsx"
    base_url = "https://lkapi.rn-card.ru"
    
    # Формируем MD5-хеш как в PowerShell
    # $md5 = [System.Security.Cryptography.MD5]::Create()
    # $bytes = [System.Text.Encoding]::UTF8.GetBytes($password)
    # $hashBytes = $md5.ComputeHash($bytes)
    # $hashHex = -join ($hashBytes | ForEach-Object { "{0:x2}" -f $_ })
    # $base64Auth = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($hashHex))
    
    password_bytes = password.encode('utf-8')
    hash_bytes = hashlib.md5(password_bytes).digest()
    hash_hex = ''.join(f'{b:02x}' for b in hash_bytes)
    base64_auth = base64.b64encode(hash_hex.encode('utf-8')).decode('utf-8')
    
    print("="*60)
    print("Параметры подключения:")
    print(f"Login: {login}")
    print(f"Contract: {contract}")
    print(f"Password length: {len(password)}")
    print(f"MD5 hex: {hash_hex}")
    print(f"Base64 auth: {base64_auth}")
    print("="*60)
    
    # Формируем заголовки
    headers = {
        "RnCard-Identity-Account-Pass": base64_auth,
        "Accept": "application/json",
        "RnCard-RequestId": str(uuid.uuid4())
    }
    
    # Формируем URL
    url = f"{base_url}/api/emv/v1/GetCardsByContract"
    params = {
        "u": login,
        "contract": contract,
        "type": "json"
    }
    
    print(f"\nURL: {url}")
    print(f"Params: {params}")
    print(f"Headers keys: {list(headers.keys())}")
    print(f"Auth header length: {len(headers['RnCard-Identity-Account-Pass'])}")
    print(f"Auth header preview: {headers['RnCard-Identity-Account-Pass'][:30]}...")
    print("="*60)
    
    # Определяем IP-адрес для проверки
    try:
        async with httpx.AsyncClient(timeout=10.0) as ip_client:
            ip_response = await ip_client.get("https://api.ipify.org?format=json")
            ip_data = ip_response.json()
            server_ip = ip_data.get("ip", "unknown")
            print(f"\nIP-адрес сервера: {server_ip}")
            print("ВАЖНО: Этот IP должен быть добавлен в белый список в ЛК РН-Карт!")
    except:
        print("\nНе удалось определить IP-адрес сервера")
    
    # Выполняем запрос
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            print("\nОтправка запроса...")
            response = await client.get(url, headers=headers, params=params)
            
            print(f"\nСтатус: {response.status_code}")
            print(f"Заголовки ответа: {dict(response.headers)}")
            
            if response.status_code == 200:
                data = response.json()
                print(f"\n[SUCCESS] Успешно! Получено карт: {len(data) if isinstance(data, list) else 'N/A'}")
                if isinstance(data, list) and len(data) > 0:
                    print(f"\nПервая карта: {data[0]}")
                    print(f"\nВсего карт в ответе: {len(data)}")
            else:
                print(f"\n[ERROR] Ошибка {response.status_code}")
                print(f"Ответ: {response.text[:500]}")
                
        except httpx.HTTPStatusError as e:
            print(f"\n[ERROR] HTTP ошибка: {e.response.status_code}")
            print(f"Ответ: {e.response.text[:1000]}")
            print(f"Заголовки запроса: {dict(e.request.headers)}")
        except Exception as e:
            print(f"\n[ERROR] Ошибка: {type(e).__name__}: {str(e)}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_rncard_connection())
