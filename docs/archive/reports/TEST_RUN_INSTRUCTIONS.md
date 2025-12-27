# 🧪 Инструкции по запуску тестов

## Проблема с выводом команд

Команды `docker exec` могут не возвращать вывод в PowerShell. Используйте один из следующих способов:

## Способ 1: Через Docker Desktop или терминал контейнера

1. Откройте Docker Desktop
2. Найдите контейнер `gsm_backend`
3. Нажмите "Exec" или "Open in Terminal"
4. Выполните:
```bash
cd /app
pytest tests/ -v --tb=short
```

## Способ 2: Через PowerShell с перенаправлением

```powershell
docker exec gsm_backend pytest tests/ -v --tb=short > test_results.txt 2>&1
Get-Content test_results.txt
```

## Способ 3: Через docker compose exec

```powershell
docker compose exec backend pytest tests/ -v --tb=short
```

## Способ 4: Запуск конкретного теста

```powershell
docker exec gsm_backend pytest tests/test_auth.py::TestPasswordHashing::test_password_hash_is_different_from_plain -v
```

## Доступные тесты

- ✅ `test_auth.py` - Тесты аутентификации
- ✅ `test_api.py` - Общие API тесты
- ✅ `test_cache_service.py` - Тесты кэширования
- ✅ `test_circuit_breaker.py` - Тесты Circuit Breaker
- ✅ `test_dashboard.py` - Тесты дашборда
- ✅ `test_fuel_cards.py` - Тесты топливных карт
- ✅ `test_fuel_types_router.py` - Тесты типов топлива
- ✅ `test_gas_stations.py` - Тесты АЗС
- ✅ `test_health.py` - Тесты health checks
- ✅ `test_organizations.py` - Тесты организаций
- ✅ `test_providers.py` - Тесты провайдеров
- ✅ `test_transactions.py` - Тесты транзакций
- ✅ `test_vehicles.py` - Тесты транспортных средств
- ✅ `tests/e2e/test_auth_flow.py` - E2E тесты аутентификации
- ✅ `tests/e2e/test_file_upload.py` - E2E тесты загрузки файлов

## Запуск с покрытием

```powershell
docker exec gsm_backend pytest tests/ --cov=app --cov-report=term-missing -v
```

## Запуск только быстрых тестов (без E2E)

```powershell
docker exec gsm_backend pytest tests/ -v --ignore=tests/e2e
```

## Отладка проблем

Если тесты не запускаются:

1. Проверьте, что контейнер запущен:
```powershell
docker ps | Select-String "gsm_backend"
```

2. Проверьте логи контейнера:
```powershell
docker logs gsm_backend --tail 50
```

3. Проверьте, что pytest установлен:
```powershell
docker exec gsm_backend pip list | Select-String "pytest"
```

4. Проверьте структуру тестов:
```powershell
docker exec gsm_backend ls -la /app/tests/
```

