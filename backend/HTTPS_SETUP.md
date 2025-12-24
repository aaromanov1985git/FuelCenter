# Настройка HTTPS для PPR API

## Обзор

1С может обращаться к API только по HTTPS. Для этого нужно настроить SSL/TLS сертификат.

## Варианты настройки HTTPS

### Вариант 1: Nginx как reverse proxy с SSL (Рекомендуется)

Этот вариант рекомендуется для production, так как Nginx лучше справляется с SSL и может обслуживать статические файлы.

#### Шаг 1: Получение SSL сертификата

**Вариант A: Let's Encrypt (бесплатный, автоматическое обновление)**

```bash
# Установка certbot
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx

# Получение сертификата
sudo certbot --nginx -d your-domain.com

# Автоматическое обновление (добавляется в cron автоматически)
```

**Вариант B: Самоподписанный сертификат (для тестирования)**

```bash
# Создание самоподписанного сертификата
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/gsm-api.key \
  -out /etc/ssl/certs/gsm-api.crt

# Установка прав
sudo chmod 600 /etc/ssl/private/gsm-api.key
sudo chmod 644 /etc/ssl/certs/gsm-api.crt
```

#### Шаг 2: Настройка Nginx

Создайте файл `/etc/nginx/sites-available/gsm-api`:

```nginx
# Редирект HTTP на HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name 10.35.1.200 your-domain.com;
    
    return 301 https://$server_name$request_uri;
}

# HTTPS конфигурация
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name 10.35.1.200 your-domain.com;

    # SSL сертификаты
    ssl_certificate /etc/ssl/certs/gsm-api.crt;  # или /etc/letsencrypt/live/your-domain.com/fullchain.pem
    ssl_certificate_key /etc/ssl/private/gsm-api.key;  # или /etc/letsencrypt/live/your-domain.com/privkey.pem

    # SSL настройки безопасности
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Логирование
    access_log /var/log/nginx/gsm-api-https-access.log;
    error_log /var/log/nginx/gsm-api-https-error.log;

    # Максимальный размер загружаемого файла
    client_max_body_size 50M;

    # Проксирование API запросов к backend
    location /api {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Таймауты для больших файлов
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }

    # Раздача статических файлов (если нужно)
    location / {
        root /var/www/gsm-converter/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Безопасность: скрыть версию nginx
    server_tokens off;

    # Заголовки безопасности
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
}
```

#### Шаг 3: Активация конфигурации

```bash
# Создание символической ссылки
sudo ln -s /etc/nginx/sites-available/gsm-api /etc/nginx/sites-enabled/

# Проверка конфигурации
sudo nginx -t

# Перезагрузка Nginx
sudo systemctl reload nginx
```

### Вариант 2: SSL напрямую в uvicorn (для разработки/тестирования)

Для тестирования можно использовать самоподписанный сертификат:

```bash
# Создание сертификата
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout backend/ssl/key.pem \
  -out backend/ssl/cert.pem \
  -subj "/CN=10.35.1.200"

# Запуск с SSL
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8443 \
  --ssl-keyfile ssl/key.pem \
  --ssl-certfile ssl/cert.pem
```

**Важно:** Для production рекомендуется использовать Nginx с Let's Encrypt сертификатом.

## Обновление конфигурации для 1С

После настройки HTTPS обновите настройки в 1С:

1. **Адрес сервиса:** `https://10.35.1.200/api/public-api/v2` (или `https://your-domain.com/api/public-api/v2`)
2. **Ключ авторизации:** `yzsdzCsjyJpHOHwSwnynQzsGVDEZeXcR` (без изменений)

## Обновление функции ВыполнитьHTTPЗапросППР

Функция уже поддерживает HTTPS (автоматически определяет протокол из URL):

```bsl
URL = "https://10.35.1.200";  // Используйте https://
Ресурс = "/api/public-api/v2/transactions?dateFrom="+dateFrom+"&dateTo="+dateTo+"&format=json";
```

Функция автоматически:
- Определит протокол (http или https)
- Использует SSL для HTTPS соединений
- Использует обычное соединение для HTTP

## Проверка работы HTTPS

### Через PowerShell:

```powershell
# Проверка доступности HTTPS
$apiKey = "yzsdzCsjyJpHOHwSwnynQzsGVDEZeXcR"
$headers = @{
    Authorization = $apiKey
    Content-Type = "application/json"
}

# Игнорируем ошибки самоподписанного сертификата (только для тестирования)
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = {$true}

$url = "https://10.35.1.200/api/public-api/v2/transactions?dateFrom=2025-12-01&dateTo=2025-12-22&format=json"
$response = Invoke-RestMethod -Uri $url -Method Get -Headers $headers
$response | ConvertTo-Json
```

### Через curl:

```bash
# С самоподписанным сертификатом (--insecure только для тестирования)
curl -k -X GET "https://10.35.1.200/api/public-api/v2/transactions?dateFrom=2025-12-01&dateTo=2025-12-22" \
  -H "Authorization: yzsdzCsjyJpHOHwSwnynQzsGVDEZeXcR"
```

## Решение проблем

### Ошибка: "SSL certificate verification failed"

**Для самоподписанного сертификата:**
- В 1С может потребоваться добавить сертификат в доверенные
- Или использовать Let's Encrypt сертификат (рекомендуется)

### Ошибка: "Couldn't resolve host name" с HTTPS

- Проверьте, что URL начинается с `https://`
- Убедитесь, что порт 443 открыт в файрволе
- Проверьте, что сертификат правильно настроен

### Ошибка: "Connection refused" на порту 443

- Проверьте, что Nginx слушает порт 443
- Проверьте настройки файрвола: `sudo ufw allow 443/tcp`
- Проверьте, что сертификат существует и доступен

## Рекомендации

1. **Для production:** Используйте Let's Encrypt сертификат через certbot
2. **Для тестирования:** Можно использовать самоподписанный сертификат
3. **Безопасность:** Настройте автоматическое обновление сертификата Let's Encrypt
4. **Мониторинг:** Настройте мониторинг срока действия сертификата

