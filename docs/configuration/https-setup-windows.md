# Настройка HTTPS для PPR API на Windows

## Обзор

1С может обращаться к API только по HTTPS. Для Windows есть несколько вариантов настройки SSL/TLS.

## Варианты настройки HTTPS на Windows

### Вариант 1: Nginx для Windows с SSL (Рекомендуется)

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

# Создайте самоподписанный сертификат
openssl req -x509 -nodes -days 365 -newkey rsa:2048 `
  -keyout ssl\gsm-api.key `
  -out ssl\gsm-api.crt `
  -subj "/CN=10.35.1.200"

# Если openssl не установлен, используйте PowerShell:
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

# Конвертация в PEM формат (если нужен для Nginx)
# Используйте OpenSSL или другой инструмент для конвертации
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

#### Шаг 5: Настройка автозапуска Nginx

Создайте файл `nginx-service.ps1`:

```powershell
# Создание службы Windows для Nginx
$serviceName = "Nginx"
$nginxPath = "C:\nginx\nginx.exe"

# Установка службы через NSSM (Non-Sucking Service Manager)
# Скачайте NSSM: https://nssm.cc/download
# nssm install Nginx "C:\nginx\nginx.exe"
# nssm set Nginx AppDirectory "C:\nginx"
# nssm start Nginx
```

### Вариант 2: SSL напрямую в uvicorn (для разработки)

#### Шаг 1: Создание сертификата через PowerShell

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

# Конвертация PFX в PEM (нужен OpenSSL или другой инструмент)
# Или используйте Python для конвертации
```

#### Шаг 2: Конвертация PFX в PEM (если нужен для uvicorn)

Создайте скрипт `convert-cert.ps1`:

```powershell
# Установите OpenSSL для Windows или используйте Python
# pip install pyopenssl

python -c "
from OpenSSL import crypto
import sys

# Чтение PFX
with open('backend/ssl/gsm-api.pfx', 'rb') as f:
    pfx = crypto.load_pkcs12(f.read(), b'password')

# Экспорт сертификата
cert = pfx.get_certificate()
with open('backend/ssl/cert.pem', 'wb') as f:
    f.write(crypto.dump_certificate(crypto.FILETYPE_PEM, cert))

# Экспорт ключа
key = pfx.get_privatekey()
with open('backend/ssl/key.pem', 'wb') as f:
    f.write(crypto.dump_privatekey(crypto.FILETYPE_PEM, key))
"
```

#### Шаг 3: Запуск uvicorn с SSL

```powershell
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8443 `
  --ssl-keyfile ssl\key.pem `
  --ssl-certfile ssl\cert.pem
```

### Вариант 3: IIS как reverse proxy (для production Windows Server)

Если у вас Windows Server с IIS:

1. Установите URL Rewrite и Application Request Routing модули для IIS
2. Настройте reverse proxy к `http://localhost:8000`
3. Настройте SSL сертификат в IIS

## Обновление настроек в 1С

После настройки HTTPS обновите адрес в 1С:

1. **Адрес сервиса:** `https://10.35.1.200/api/public-api/v2`
   - Используйте `https://` (не `http://`)
   - Порт 443 используется по умолчанию для HTTPS
2. **Ключ авторизации:** `yzsdzCsjyJpHOHwSwnynQzsGVDEZeXcR` (без изменений)

## Обновление функции ВыполнитьHTTPЗапросППР

Функция уже поддерживает HTTPS (автоматически определяет протокол):

```bsl
URL = "https://10.35.1.200";  // Используйте https://
Ресурс = "/api/public-api/v2/transactions?dateFrom="+dateFrom+"&dateTo="+dateTo+"&format=json";
```

## Проверка работы HTTPS

### Через PowerShell:

```powershell
# Игнорируем ошибки самоподписанного сертификата (только для тестирования)
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = {$true}

$apiKey = "yzsdzCsjyJpHOHwSwnynQzsGVDEZeXcR"
$headers = @{
    Authorization = $apiKey
    Content-Type = "application/json"
}

# Проверка доступности HTTPS
$url = "https://10.35.1.200/api/public-api/v2"
try {
    $response = Invoke-RestMethod -Uri $url -Method Get -Headers $headers
    Write-Host "HTTPS работает!" -ForegroundColor Green
    $response | ConvertTo-Json
} catch {
    Write-Host "Ошибка: $($_.Exception.Message)" -ForegroundColor Red
}
```

## Открытие портов в Windows Firewall

```powershell
# Откройте PowerShell от имени администратора

# Открыть порт 443 для HTTPS
New-NetFirewallRule -DisplayName "HTTPS API" -Direction Inbound -LocalPort 443 -Protocol TCP -Action Allow

# Открыть порт 80 для HTTP (редирект на HTTPS)
New-NetFirewallRule -DisplayName "HTTP API" -Direction Inbound -LocalPort 80 -Protocol TCP -Action Allow

# Проверка правил
Get-NetFirewallRule -DisplayName "*API*"
```

## Решение проблем

### Ошибка: "SSL certificate verification failed" в 1С

**Для самоподписанного сертификата:**
1. Экспортируйте сертификат из Windows:
   ```powershell
   # Найдите сертификат
   Get-ChildItem Cert:\LocalMachine\My | Where-Object {$_.Subject -like "*10.35.1.200*"}
   
   # Экспорт в CER
   $cert = Get-ChildItem Cert:\LocalMachine\My | Where-Object {$_.Subject -like "*10.35.1.200*"} | Select-Object -First 1
   Export-Certificate -Cert $cert -FilePath "gsm-api.cer"
   ```
2. Импортируйте сертификат в 1С или добавьте в доверенные корневые сертификаты Windows

### Ошибка: "Couldn't resolve host name" с HTTPS

- Проверьте, что URL начинается с `https://`
- Убедитесь, что порт 443 открыт в Windows Firewall
- Проверьте, что сертификат правильно настроен

### Ошибка: "Connection refused" на порту 443

- Проверьте, что Nginx или uvicorn слушает порт 443
- Проверьте настройки Windows Firewall
- Проверьте, что сертификат существует и доступен

## Рекомендации

1. **Для production:** Используйте Let's Encrypt через win-acme или купленный SSL сертификат
2. **Для тестирования:** Можно использовать самоподписанный сертификат
3. **Безопасность:** Настройте автоматическое обновление сертификата
4. **Мониторинг:** Настройте мониторинг срока действия сертификата

## Быстрый старт (самоподписанный сертификат)

```powershell
# 1. Создание сертификата
$cert = New-SelfSignedCertificate `
  -DnsName "10.35.1.200" `
  -CertStoreLocation "cert:\LocalMachine\My"

# 2. Экспорт в PFX
$pwd = ConvertTo-SecureString -String "password" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath "C:\nginx\ssl\gsm-api.pfx" -Password $pwd

# 3. Конвертация в PEM (если нужен для Nginx)
# Используйте OpenSSL или Python с pyopenssl

# 4. Настройка Nginx (см. выше)

# 5. Запуск Nginx
cd C:\nginx
.\nginx.exe

# 6. Открытие портов
New-NetFirewallRule -DisplayName "HTTPS API" -Direction Inbound -LocalPort 443 -Protocol TCP -Action Allow
```

