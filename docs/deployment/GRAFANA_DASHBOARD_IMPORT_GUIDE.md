# 📊 РУКОВОДСТВО ПО ИМПОРТУ GRAFANA ДАШБОРДА

**Дата:** 2025-12-26

---

## 📋 ОБЗОР

Пример дашборда создан и находится в `monitoring/grafana/dashboards/gsm-overview.json`.

---

## 🔧 СПОСОБ 1: ИМПОРТ ЧЕРЕЗ UI GRAFANA

### Шаги:

1. **Открыть Grafana**
   ```
   http://localhost:3001
   ```

2. **Войти в систему**
   - Логин: `admin`
   - Пароль: `admin` (по умолчанию, измените при первом входе)

3. **Импортировать дашборд**
   - Перейти в **Dashboards** → **Import**
   - Нажать **Upload JSON file**
   - Выбрать файл `monitoring/grafana/dashboards/gsm-overview.json`
   - Нажать **Load**
   - Выбрать **Prometheus** как источник данных
   - Нажать **Import**

4. **Проверить дашборд**
   - Дашборд должен отобразиться с метриками системы

---

## 🔧 СПОСОБ 2: АВТОМАТИЧЕСКИЙ ИМПОРТ (Provisioning)

### Текущая конфигурация:

Файл `monitoring/grafana/provisioning/dashboards/dashboards.yml` уже настроен:

```yaml
apiVersion: 1

providers:
  - name: 'GSM Dashboards'
    orgId: 1
    folder: ''
    type: file
    disableDeletion: false
    updateIntervalSeconds: 10
    allowUiUpdates: true
    options:
      path: /etc/grafana/provisioning/dashboards
      foldersFromFilesStructure: true
```

### Для автоматического импорта:

1. **Убедиться, что дашборд в правильной директории**
   ```
   monitoring/grafana/dashboards/gsm-overview.json
   ```

2. **Перезапустить Grafana**
   ```bash
   docker compose -f docker-compose.monitoring.yml restart grafana
   ```

3. **Проверить логи**
   ```bash
   docker compose -f docker-compose.monitoring.yml logs grafana | grep dashboard
   ```

4. **Проверить дашборд в UI**
   - Дашборд должен появиться автоматически в списке дашбордов

---

## 🔧 СПОСОБ 3: ИМПОРТ ЧЕРЕЗ API

### Использовать Grafana API:

```bash
# Получить API ключ (создать в UI: Configuration → API Keys)
API_KEY="your-api-key"

# Импортировать дашборд
curl -X POST \
  http://localhost:3001/api/dashboards/db \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d @monitoring/grafana/dashboards/gsm-overview.json
```

---

## 📊 СОДЕРЖИМОЕ ДАШБОРДА

Дашборд включает:

1. **HTTP Метрики**
   - Requests per second
   - Request duration
   - Error rate
   - Status codes

2. **Системные метрики**
   - CPU usage
   - Memory usage
   - Disk I/O

3. **Redis метрики**
   - Connections
   - Memory usage
   - Commands per second

4. **База данных**
   - Connection pool
   - Query duration

---

## ✅ ПРОВЕРКА

### 1. Проверить статус Grafana

```bash
docker compose -f docker-compose.monitoring.yml ps grafana
```

### 2. Проверить логи

```bash
docker compose -f docker-compose.monitoring.yml logs grafana
```

### 3. Проверить дашборд

- Открыть Grafana UI
- Перейти в **Dashboards**
- Найти дашборд **GSM Overview**
- Проверить, что метрики отображаются

---

## 🔧 НАСТРОЙКА ДАТАСОРСА

### Если датасорс не настроен:

1. **Перейти в Configuration → Data Sources**
2. **Добавить Prometheus**
   - URL: `http://prometheus:9090`
   - Access: Server (default)
   - Нажать **Save & Test**

### Автоматическая настройка:

Файл `monitoring/grafana/provisioning/datasources/datasources.yml` уже настроен:

```yaml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: true
```

При перезапуске Grafana датасорс должен появиться автоматически.

---

## 📝 ПРИМЕЧАНИЯ

1. **Первый запуск:** При первом запуске Grafana может потребоваться время для инициализации.

2. **Права доступа:** Убедитесь, что файл дашборда доступен для чтения контейнером Grafana.

3. **Обновления:** При изменении дашборда через UI, изменения сохраняются в БД Grafana, а не в JSON файле.

---

**Дата:** 2025-12-26  
**Статус:** ✅ Готово к импорту

