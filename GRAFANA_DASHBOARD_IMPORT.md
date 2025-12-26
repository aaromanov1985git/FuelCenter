# Импорт дашборда в Grafana

## Быстрый старт

1. Откройте Grafana: http://localhost:3001
2. Войдите с учетными данными:
   - **Username:** `admin`
   - **Password:** `admin` (измените при первом входе)

## Импорт дашборда

### Вариант 1: Через UI

1. В левом меню выберите **Dashboards** → **Import**
2. Нажмите **Upload JSON file**
3. Выберите файл: `monitoring/grafana/dashboards/gsm-overview.json`
4. Нажмите **Load**
5. Выберите **Prometheus** в качестве datasource
6. Нажмите **Import**

### Вариант 2: Через API

```bash
# Получите API ключ из Grafana UI (Configuration → API Keys)
export GRAFANA_API_KEY="your-api-key"
export GRAFANA_URL="http://localhost:3001"

# Импортируйте дашборд
curl -X POST \
  -H "Authorization: Bearer $GRAFANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d @monitoring/grafana/dashboards/gsm-overview.json \
  "$GRAFANA_URL/api/dashboards/db"
```

## Проверка

После импорта:
1. Откройте дашборд **GSM Overview**
2. Убедитесь, что все панели отображают данные
3. Если панели пустые, проверьте:
   - Prometheus datasource настроен и работает
   - Backend отправляет метрики на `/metrics`
   - Время range выбрано правильно

## Создание дополнительных дашбордов

### Database Metrics

Создайте новый дашборд с панелями:
- **DB Connections:** `gsm_db_connections_active`
- **Query Duration:** `rate(http_request_duration_seconds{endpoint=~"/api/v1/.*"}[5m])`

### Redis Metrics

Создайте новый дашборд с панелями:
- **Memory Usage:** `redis_memory_used_bytes`
- **Commands:** `rate(redis_commands_total[5m])`
- **Keys:** `redis_keyspace_keys`

## Troubleshooting

### Дашборд не загружается

1. Проверьте формат JSON (валидный JSON)
2. Убедитесь, что datasource `prometheus` существует
3. Проверьте логи Grafana: `docker logs gsm_grafana`

### Панели пустые

1. Проверьте Prometheus targets: http://localhost:9090/targets
2. Убедитесь, что backend доступен: http://localhost:8000/metrics
3. Проверьте time range в дашборде (выберите "Last 5 minutes")

### Метрики не отображаются

1. Проверьте, что метрики есть в Prometheus:
   ```bash
   curl http://localhost:9090/api/v1/query?query=http_requests_total
   ```
2. Убедитесь, что Prometheus scrape backend:
   ```bash
   curl http://localhost:9090/api/v1/targets | grep gsm-backend
   ```

