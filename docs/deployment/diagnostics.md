# Диагностика проблемы "Failed to fetch" на production

## Миграции применены ✅

Текущая версия миграций: `20251214_000000 (head)`

Все миграции применены, включая:
- ✅ Удаление organization_id из gas_stations
- ✅ Добавление provider_id в gas_stations
- ✅ Удаление organization_id из fuel_cards
- ✅ Добавление координат (latitude, longitude) в gas_stations

## Проверка на production сервере

### 1. Проверить, запущен ли бэкенд

```bash
# Проверка через systemd
systemctl status gsm_backend

# Или через Docker
docker ps | grep backend

# Проверка доступности API
curl http://localhost:8000/health
```

### 2. Проверить логи бэкенда

```bash
# Если через systemd
journalctl -u gsm_backend -n 50

# Или через Docker
docker logs gsm_backend --tail 50
```

### 3. Проверить конфигурацию Nginx

Убедитесь, что в `/etc/nginx/sites-available/gsm-converter` (или аналогичном файле) есть:

```nginx
location /api {
    proxy_pass http://localhost:8000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

### 4. Проверить доступность API через домен

```bash
curl https://defectively-nimble-rattail.cloudpub.ru/api/v1/config
```

### 5. Проверить CORS настройки

В `backend/.env` или переменных окружения должно быть:

```env
ALLOWED_ORIGINS=https://defectively-nimble-rattail.cloudpub.ru,http://defectively-nimble-rattail.cloudpub.ru
```

### 6. Перезапустить сервисы

```bash
# Перезапуск бэкенда
systemctl restart gsm_backend
# Или
docker restart gsm_backend

# Перезагрузка Nginx
sudo nginx -t  # Проверка конфигурации
sudo systemctl reload nginx
```

## Быстрое решение

Если бэкенд не запущен, запустите его:

```bash
cd /path/to/backend
# Если через systemd
systemctl start gsm_backend

# Или если через Docker
docker-compose up -d backend

# Или вручную
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Применение миграций на production

Если миграции не применены на production:

```bash
cd /path/to/backend
python -m alembic upgrade head
```

Или через Docker:

```bash
docker exec -it gsm_backend python -m alembic upgrade head
```
