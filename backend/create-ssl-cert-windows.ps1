# Скрипт для создания SSL сертификата на Windows
# Запустите от имени администратора: .\create-ssl-cert-windows.ps1

param(
    [string]$DnsName = "10.35.1.200",
    [string]$OutputPath = "ssl",
    [string]$Password = "password"
)

Write-Host "=== Создание SSL сертификата для PPR API ===" -ForegroundColor Cyan
Write-Host ""

# Создание папки для сертификатов
if (-not (Test-Path $OutputPath)) {
    New-Item -ItemType Directory -Path $OutputPath -Force | Out-Null
    Write-Host "Создана папка: $OutputPath" -ForegroundColor Green
}

try {
    Write-Host "Создание самоподписанного сертификата..." -ForegroundColor Yellow
    
    # Создание сертификата
    $cert = New-SelfSignedCertificate `
        -DnsName $DnsName, "localhost" `
        -CertStoreLocation "cert:\LocalMachine\My" `
        -KeyExportPolicy Exportable `
        -KeySpec Signature `
        -KeyLength 2048 `
        -KeyAlgorithm RSA `
        -HashAlgorithm SHA256 `
        -NotAfter (Get-Date).AddYears(1)
    
    Write-Host "✓ Сертификат создан: $($cert.Thumbprint)" -ForegroundColor Green
    Write-Host "  Субъект: $($cert.Subject)" -ForegroundColor Gray
    Write-Host "  Действителен до: $($cert.NotAfter)" -ForegroundColor Gray
    Write-Host ""
    
    # Экспорт в PFX
    Write-Host "Экспорт сертификата в PFX..." -ForegroundColor Yellow
    $pwd = ConvertTo-SecureString -String $Password -Force -AsPlainText
    $pfxPath = Join-Path $OutputPath "gsm-api.pfx"
    Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $pwd | Out-Null
    Write-Host "✓ Сертификат экспортирован: $pfxPath" -ForegroundColor Green
    Write-Host ""
    
    # Экспорт сертификата (публичная часть)
    Write-Host "Экспорт публичной части сертификата..." -ForegroundColor Yellow
    $cerPath = Join-Path $OutputPath "gsm-api.cer"
    Export-Certificate -Cert $cert -FilePath $cerPath -Type CERT | Out-Null
    Write-Host "✓ Сертификат экспортирован: $cerPath" -ForegroundColor Green
    Write-Host ""
    
    # Конвертация в PEM (если установлен OpenSSL)
    $opensslPath = Get-Command openssl -ErrorAction SilentlyContinue
    if ($opensslPath) {
        Write-Host "Конвертация в PEM формат (OpenSSL)..." -ForegroundColor Yellow
        
        $keyPath = Join-Path $OutputPath "key.pem"
        $certPath = Join-Path $OutputPath "cert.pem"
        
        # Конвертация PFX в PEM
        & openssl pkcs12 -in $pfxPath -nocerts -nodes -out $keyPath -passin pass:$Password
        & openssl pkcs12 -in $pfxPath -clcerts -nokeys -out $certPath -passin pass:$Password
        
        if (Test-Path $keyPath -and Test-Path $certPath) {
            Write-Host "✓ Сертификаты конвертированы в PEM:" -ForegroundColor Green
            Write-Host "  Ключ: $keyPath" -ForegroundColor Gray
            Write-Host "  Сертификат: $certPath" -ForegroundColor Gray
        }
    } else {
        Write-Host "⚠ OpenSSL не найден. Для конвертации в PEM установите OpenSSL или используйте Python с pyopenssl" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "=== Готово ===" -ForegroundColor Green
    Write-Host ""
    Write-Host "Следующие шаги:" -ForegroundColor Cyan
    Write-Host "1. Настройте Nginx с сертификатом из папки $OutputPath" -ForegroundColor White
    Write-Host "2. Или используйте uvicorn с SSL:" -ForegroundColor White
    Write-Host "   uvicorn app.main:app --host 0.0.0.0 --port 8443 --ssl-keyfile $OutputPath\key.pem --ssl-certfile $OutputPath\cert.pem" -ForegroundColor Gray
    Write-Host "3. Откройте порт 443 в Windows Firewall:" -ForegroundColor White
    Write-Host "   New-NetFirewallRule -DisplayName 'HTTPS API' -Direction Inbound -LocalPort 443 -Protocol TCP -Action Allow" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Для импорта сертификата в 1С используйте файл: $cerPath" -ForegroundColor Yellow
    
} catch {
    Write-Host ""
    Write-Host "✗ Ошибка при создании сертификата:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Убедитесь, что вы запустили скрипт от имени администратора" -ForegroundColor Yellow
    exit 1
}

