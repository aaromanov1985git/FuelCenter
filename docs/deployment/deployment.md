# Инструкция по деплою приложения

## Подготовка к деплою

### 1. Сборка frontend

```bash
# Установка зависимостей
npm install

# Сборка для production
npm run build
```

После сборки файлы будут в папке `dist/`.

### 2. Настройка переменных окружения

#### Frontend (опционально)

Если приложение развернуто не в корне домена, установите `VITE_BASE_PATH`:

```bash
# Для корня домена (по умолчанию)
export VITE_BASE_PATH=/

# Для подпути (например, /app/)
export VITE_BASE_PATH=/app/
```

Затем пересоберите:
```bash
npm run build
```

#### Backend

Убедитесь, что в `docker-compose.yml` или `.env` файле настроены:

```env
# URL вашего frontend для CORS
ALLOWED_ORIGINS=https://defectively-nimble-rattail.cloudpub.ru,https://defectively-nimble-rattail.cloudpub.ru/api

# Остальные настройки...
DATABASE_URL=postgresql://gsm_user:gsm_password@db:5432/gsm_db
```

### 3. Настройка Nginx

1. Скопируйте пример конфигурации:
```bash
cp nginx.conf.example /etc/nginx/sites-available/gsm-converter
```

2. Отредактируйте конфигурацию:
```bash
sudo nano /etc/nginx/sites-available/gsm-converter
```

3. Обновите пути:
   - `root` - путь к папке `dist/` с собранными файлами
   - `server_name` - ваш домен
   - `proxy_pass` - URL вашего backend (если не localhost:8000)

4. Создайте символическую ссылку:
```bash
sudo ln -s /etc/nginx/sites-available/gsm-converter /etc/nginx/sites-enabled/
```

5. Проверьте конфигурацию:
```bash
sudo nginx -t
```

6. Перезагрузите Nginx:
```bash
sudo systemctl reload nginx
```

### 4. Запуск Backend

#### Вариант 1: Docker Compose

```bash
docker-compose up -d
```

#### Вариант 2: Ручной запуск

```bash
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 5. Проверка работы

1. Откройте в браузере: `https://defectively-nimble-rattail.cloudpub.ru`
2. Проверьте, что статические файлы загружаются
3. Проверьте, что API запросы работают (откройте DevTools → Network)

## Решение проблем

### Проблема: Белый экран или 404

**Причина:** Неправильный base path или неправильная конфигурация nginx.

**Решение:**
1. Проверьте, что в `vite.config.js` установлен правильный `base`
2. Убедитесь, что nginx правильно раздает файлы из `dist/`
3. Проверьте, что `try_files` в nginx настроен на `/index.html`

### Проблема: API запросы не работают (CORS ошибки)

**Причина:** Backend не разрешает запросы с вашего домена.

**Решение:**
1. Обновите `ALLOWED_ORIGINS` в настройках backend
2. Перезапустите backend
3. Проверьте заголовки CORS в ответах API

### Проблема: Статические файлы не загружаются (404 на .js/.css)

**Причина:** Неправильный base path в Vite или неправильные пути в nginx.

**Решение:**
1. Пересоберите frontend с правильным `VITE_BASE_PATH`
2. Проверьте, что nginx правильно раздает файлы из `dist/assets/`

### Проблема: Ошибки при загрузке больших файлов

**Причина:** Недостаточные лимиты в nginx.

**Решение:**
Увеличьте в nginx.conf:
```nginx
client_max_body_size 100M;
proxy_read_timeout 600s;
proxy_send_timeout 600s;
```

## Структура файлов на сервере

```
/var/www/gsm-converter/
├── dist/              # Собранные файлы frontend (из npm run build)
│   ├── index.html
│   └── assets/
├── backend/           # Backend приложение (если не в Docker)
└── nginx.conf         # Конфигурация nginx
```

## Мониторинг

Проверьте логи для диагностики:

```bash
# Логи nginx
sudo tail -f /var/log/nginx/gsm-converter-error.log

# Логи backend (если в Docker)
docker logs -f gsm_backend

# Логи backend (если не в Docker)
# Зависит от вашей конфигурации (systemd, supervisor и т.д.)
```
