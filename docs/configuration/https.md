# Настройка HTTPS для PPR API

## Обзор

1С может обращаться к API только по HTTPS. Для этого нужно настроить SSL/TLS сертификат. Ниже описаны варианты для Linux и Windows.

## Вариант 1: Nginx как reverse proxy с SSL (Рекомендуется)

Этот вариант рекомендуется для production, так как Nginx лучше справляется с SSL и может обслуживать статические файлы.

### Linux

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

### Windows

#### Шаг 1: Установка Nginx для Windows

1. Скачайте Nginx для Windows: https://nginx.org/en/download.html
2. Распакуйте в `C:\nginx\`
3. Запустите командную строку от имени администратора

#### Шаг 2: Создание SSL сертификата

**Для тестирования (самоподписанный сертификат):**

```powershell
# Откройте PowerShell от имени администратора
cd C:\nginx

# Создайте папку для сертификатов
New-Item -ItemType Directory -Path "ssl" -Force

# Создайте самоподписанный сертификат через OpenSSL (если установлен)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 `
  -keyout ssl\gsm-api.key `
  -out ssl\gsm-api.crt `
  -subj "/CN=10.35.1.200"

# Или используйте PowerShell:
$cert = New-SelfSignedCertificate `
  -DnsName "10.35.1.200" `
  -CertStoreLocation "cert:\LocalMachine\My" `
  -KeyExportPolicy Exportable `
  -KeySpec Signature `
  -KeyLength 2048 `
  -KeyAlgorithm RSA `
  -HashAlgorithm SHA256

# Экспорт сертификата
$pwd = ConvertTo-SecureString -String "password" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath "ssl\gsm-api.pfx" -Password $pwd
```

**Для production (Let's Encrypt через win-acme):**

1. Скачайте win-acme: https://www.win-acme.com/
2. Запустите `wacs.exe`
3. Следуйте инструкциям для получения сертификата

#### Шаг 3: Настройка Nginx

Создайте файл `C:\nginx\conf\nginx.conf`:

```nginx
worker_processes  1;

events {
    worker_connections  1024;
}

http {
    include       mime.types;
    default_type  application/octet-stream;
    sendfile        on;
    keepalive_timeout  65;

    # Редирект HTTP на HTTPS
    server {
        listen       80;
        server_name  10.35.1.200;
        
        return 301 https://$server_name$request_uri;
    }

    # HTTPS конфигурация
    server {
        listen       443 ssl;
        server_name  10.35.1.200;

        # SSL сертификаты
        ssl_certificate      ssl/gsm-api.crt;
        ssl_certificate_key  ssl/gsm-api.key;

        # SSL настройки
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;
        ssl_prefer_server_ciphers on;

        # Логирование
        access_log  logs/gsm-api-https-access.log;
        error_log   logs/gsm-api-https-error.log;

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
            
            # Таймауты
            proxy_connect_timeout 300s;
            proxy_send_timeout 300s;
            proxy_read_timeout 300s;
        }

        # Раздача статических файлов (если нужно)
        location / {
            root   html;
            index  index.html index.htm;
        }
    }
}
```

#### Шаг 4: Запуск Nginx

```powershell
# Запуск Nginx
cd C:\nginx
.\nginx.exe

# Проверка статуса
Get-Process nginx

# Остановка
.\nginx.exe -s stop

# Перезагрузка конфигурации
.\nginx.exe -s reload
```

#### Шаг 5: Открытие портов в Windows Firewall

```powershell
# Откройте PowerShell от имени администратора

# Открыть порт 443 для HTTPS
New-NetFirewallRule -DisplayName "HTTPS API" -Direction Inbound -LocalPort 443 -Protocol TCP -Action Allow

# Открыть порт 80 для HTTP (редирект на HTTPS)
New-NetFirewallRule -DisplayName "HTTP API" -Direction Inbound -LocalPort 80 -Protocol TCP -Action Allow
```

## Вариант 2: SSL напрямую в uvicorn (для разработки/тестирования)

### Linux

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

### Windows

```powershell
# Создание самоподписанного сертификата
$cert = New-SelfSignedCertificate `
  -DnsName "10.35.1.200", "localhost" `
  -CertStoreLocation "cert:\LocalMachine\My" `
  -KeyExportPolicy Exportable `
  -KeySpec Signature `
  -KeyLength 2048 `
  -KeyAlgorithm RSA `
  -HashAlgorithm SHA256

# Экспорт сертификата в PFX
$pwd = ConvertTo-SecureString -String "password" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath "backend\ssl\gsm-api.pfx" -Password $pwd

# Конвертация PFX в PEM (нужен Python с pyopenssl или OpenSSL)
# pip install pyopenssl
python -c "
from OpenSSL import crypto
with open('backend/ssl/gsm-api.pfx', 'rb') as f:
    pfx = crypto.load_pkcs12(f.read(), b'password')
cert = pfx.get_certificate()
with open('backend/ssl/cert.pem', 'wb') as f:
    f.write(crypto.dump_certificate(crypto.FILETYPE_PEM, cert))
key = pfx.get_privatekey()
with open('backend/ssl/key.pem', 'wb') as f:
    f.write(crypto.dump_privatekey(crypto.FILETYPE_PEM, key))
"

# Запуск с SSL
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8443 `
  --ssl-keyfile ssl\key.pem `
  --ssl-certfile ssl\cert.pem
```

**Важно:** Для production рекомендуется использовать Nginx с Let's Encrypt сертификатом.

## Обновление конфигурации для 1С

После настройки HTTPS обновите настройки в 1С:

1. **Адрес сервиса:** `https://your-server.com/api/public-api/v2` (или `https://10.35.1.200/api/public-api/v2`)
   - Используйте `https://` (не `http://`)
   - Используйте оригинальный путь `/api/public-api/v2` для максимальной совместимости
2. **Ключ авторизации:** ваш API ключ (без изменений)

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
# Игнорируем ошибки самоподписанного сертификата (только для тестирования)
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = {$true}

$apiKey = "your_api_key"
$headers = @{
    Authorization = $apiKey
    Content-Type = "application/json"
}

# Проверка доступности HTTPS
$url = "https://your-server.com/api/public-api/v2/transactions?dateFrom=2025-12-01&dateTo=2025-12-22&format=json"
try {
    $response = Invoke-RestMethod -Uri $url -Method Get -Headers $headers
    Write-Host "HTTPS работает!" -ForegroundColor Green
    $response | ConvertTo-Json
} catch {
    Write-Host "Ошибка: $($_.Exception.Message)" -ForegroundColor Red
}
```

### Через curl:

```bash
# С самоподписанным сертификатом (--insecure только для тестирования)
curl -k -X GET "https://your-server.com/api/public-api/v2/transactions?dateFrom=2025-12-01&dateTo=2025-12-22" \
  -H "Authorization: your_api_key"
```

## Решение проблем

### Ошибка: "SSL certificate verification failed"

**Для самоподписанного сертификата:**
- В 1С может потребоваться добавить сертификат в доверенные
- Или использовать Let's Encrypt сертификат (рекомендуется)

**На Windows:**
```powershell
# Экспорт сертификата для импорта в 1С
$cert = Get-ChildItem Cert:\LocalMachine\My | Where-Object {$_.Subject -like "*10.35.1.200*"} | Select-Object -First 1
Export-Certificate -Cert $cert -FilePath "gsm-api.cer"
```

### Ошибка: "Couldn't resolve host name" с HTTPS

- Проверьте, что URL начинается с `https://`
- Убедитесь, что порт 443 открыт в файрволе
- Проверьте, что сертификат правильно настроен

### Ошибка: "Connection refused" на порту 443

- Проверьте, что Nginx слушает порт 443: `netstat -an | findstr :443` (Windows) или `sudo netstat -tulpn | grep :443` (Linux)
- Проверьте настройки файрвола
- Проверьте, что сертификат существует и доступен

## Рекомендации

1. **Для production:** Используйте Let's Encrypt сертификат через certbot (Linux) или win-acme (Windows)
2. **Для тестирования:** Можно использовать самоподписанный сертификат
3. **Безопасность:** Настройте автоматическое обновление сертификата Let's Encrypt
4. **Мониторинг:** Настройте мониторинг срока действия сертификата

