# 🧪 Запуск тестов

## Команда для запуска тестов

```bash
docker exec gsm_backend pytest tests/ -v --tb=short
```

Или через docker compose:

```bash
docker compose exec backend pytest tests/ -v --tb=short
```

## Доступные тесты

- `test_auth.py` - Тесты аутентификации
- `test_api.py` - Общие API тесты
- `test_cache_service.py` - Тесты кэширования
- `test_circuit_breaker.py` - Тесты Circuit Breaker
- `test_dashboard.py` - Тесты дашборда
- `test_fuel_cards.py` - Тесты топливных карт
- `test_fuel_types_router.py` - Тесты типов топлива
- `test_gas_stations.py` - Тесты АЗС
- `test_health.py` - Тесты health checks
- `test_organizations.py` - Тесты организаций
- `test_providers.py` - Тесты провайдеров
- `test_transactions.py` - Тесты транзакций
- `test_vehicles.py` - Тесты транспортных средств

## E2E тесты

```bash
docker exec gsm_backend pytest tests/e2e/ -v --tb=short
```

## Запуск конкретного теста

```bash
docker exec gsm_backend pytest tests/test_auth.py::test_login -v
```

## Запуск с покрытием

```bash
docker exec gsm_backend pytest tests/ --cov=app --cov-report=html -v
```

