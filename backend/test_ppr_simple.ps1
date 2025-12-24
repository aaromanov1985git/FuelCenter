# Упрощенный скрипт тестирования PPR API с правильной кодировкой
# Использование: .\test_ppr_simple.ps1

# Устанавливаем кодировку UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['*:Encoding'] = 'utf8'
chcp 65001 | Out-Null

$baseUrl = "http://10.35.1.200:8000/api/ppr"
$username = "admin"
$password = "admin123"

Write-Host "=== Тестирование PPR API ===" -ForegroundColor Cyan
Write-Host ""

# 1. Проверка доступности
Write-Host "1. Проверка доступности API..." -ForegroundColor Green
try {
    $health = Invoke-RestMethod -Uri "$baseUrl" -Method Get
    Write-Host "   OK - API доступен" -ForegroundColor Green
} catch {
    Write-Host "   ERROR: $_" -ForegroundColor Red
    exit
}

# 2. Получение токена
Write-Host "`n2. Получение токена..." -ForegroundColor Green
$body = @{username=$username; password=$password} | ConvertTo-Json -Compress
try {
    $login = Invoke-RestMethod -Uri "$baseUrl/login" -Method Post -Body $body -ContentType "application/json; charset=utf-8"
    if ($login.success) {
        $token = $login.token
        Write-Host "   OK - Токен получен" -ForegroundColor Green
    } else {
        Write-Host "   ERROR: $($login.message)" -ForegroundColor Red
        exit
    }
} catch {
    Write-Host "   ERROR: $_" -ForegroundColor Red
    exit
}

$headers = @{
    Authorization = "Bearer $token"
    "Content-Type" = "application/json; charset=utf-8"
}

# 3. Получение провайдеров
Write-Host "`n3. Получение списка провайдеров..." -ForegroundColor Green
try {
    $providers = Invoke-RestMethod -Uri "$baseUrl/providers" -Method Get -Headers $headers
    if ($providers.success) {
        Write-Host "   OK - Найдено провайдеров: $($providers.total)" -ForegroundColor Green
        if ($providers.total -gt 0) {
            $providers.data | ForEach-Object {
                Write-Host "      ID $($_.id): $($_.name) ($($_.code))" -ForegroundColor Gray
            }
            $firstProviderId = $providers.data[0].id
        } else {
            Write-Host "   WARNING: Нет провайдеров" -ForegroundColor Yellow
            $firstProviderId = $null
        }
    }
} catch {
    Write-Host "   ERROR: $_" -ForegroundColor Red
    $firstProviderId = $null
}

# 4. Получение транзакций
Write-Host "`n4. Получение транзакций..." -ForegroundColor Green
if ($firstProviderId) {
    try {
        $transactions = Invoke-RestMethod -Uri "$baseUrl/transaction-list?provider_id=$firstProviderId&limit=5" -Method Get -Headers $headers
        if ($transactions.success) {
            Write-Host "   OK - Всего транзакций: $($transactions.total)" -ForegroundColor Green
            if ($transactions.total -eq 0) {
                Write-Host "   INFO: Транзакций нет. Загрузите данные через веб-интерфейс." -ForegroundColor Yellow
            }
        } else {
            Write-Host "   ERROR: $($transactions.message)" -ForegroundColor Red
        }
    } catch {
        Write-Host "   ERROR: $_" -ForegroundColor Red
    }
} else {
    Write-Host "   SKIP - Нет провайдеров" -ForegroundColor Yellow
}

# 5. Получение карт
Write-Host "`n5. Получение карт..." -ForegroundColor Green
try {
    $cards = Invoke-RestMethod -Uri "$baseUrl/card-list?limit=5" -Method Get -Headers $headers
    if ($cards.success) {
        Write-Host "   OK - Всего карт: $($cards.total)" -ForegroundColor Green
        if ($cards.total -eq 0) {
            Write-Host "   INFO: Карт нет. Они создадутся при загрузке транзакций." -ForegroundColor Yellow
        }
    } else {
        Write-Host "   ERROR: $($cards.message)" -ForegroundColor Red
    }
} catch {
    Write-Host "   ERROR: $_" -ForegroundColor Red
}

Write-Host "`n=== Готово ===" -ForegroundColor Cyan
