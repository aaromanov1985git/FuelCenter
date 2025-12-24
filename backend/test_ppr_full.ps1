# Полный скрипт тестирования PPR API
# Использование: .\test_ppr_full.ps1

# Устанавливаем кодировку UTF-8 для корректного отображения русских символов
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
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
    Write-Host "   ✓ API доступен!" -ForegroundColor Green
    Write-Host "   Сервис: $($health.service)" -ForegroundColor Gray
    Write-Host "   Версия: $($health.version)" -ForegroundColor Gray
} catch {
    Write-Host "   ✗ Ошибка: $_" -ForegroundColor Red
    exit
}

# 2. Получение токена
Write-Host "`n2. Получение токена..." -ForegroundColor Green
$body = @{
    username = $username
    password = $password
} | ConvertTo-Json

try {
    $login = Invoke-RestMethod -Uri "$baseUrl/login" -Method Post -Body $body -ContentType "application/json"
    if ($login.success) {
        $token = $login.token
        Write-Host "   ✓ Токен получен!" -ForegroundColor Green
        Write-Host "   Токен: $($token.Substring(0,30))..." -ForegroundColor Gray
        Write-Host "   Действителен: $($login.expires_in) секунд" -ForegroundColor Gray
    } else {
        Write-Host "   ✗ Ошибка авторизации: $($login.message)" -ForegroundColor Red
        exit
    }
} catch {
    Write-Host "   ✗ Ошибка: $_" -ForegroundColor Red
    exit
}

$headers = @{
    Authorization = "Bearer $token"
}

# 3. Получение списка провайдеров
Write-Host "`n3. Получение списка провайдеров..." -ForegroundColor Green
try {
    $providers = Invoke-RestMethod -Uri "$baseUrl/providers" -Method Get -Headers $headers
    if ($providers.success) {
        Write-Host "   ✓ Найдено провайдеров: $($providers.total)" -ForegroundColor Green
        if ($providers.total -gt 0) {
            Write-Host "   Список провайдеров:" -ForegroundColor Gray
            foreach ($provider in $providers.data) {
                $name = [System.Text.Encoding]::UTF8.GetString([System.Text.Encoding]::Default.GetBytes($provider.name))
                $code = [System.Text.Encoding]::UTF8.GetString([System.Text.Encoding]::Default.GetBytes($provider.code))
                Write-Host "     - ID: $($provider.id), Название: $name, Код: $code" -ForegroundColor Gray
            }
            $firstProviderId = $providers.data[0].id
        } else {
            Write-Host "   ⚠ В базе нет провайдеров. Создайте провайдера через веб-интерфейс." -ForegroundColor Yellow
            $firstProviderId = $null
        }
    } else {
        Write-Host "   ✗ Ошибка: $($providers.message)" -ForegroundColor Red
        $firstProviderId = $null
    }
} catch {
    Write-Host "   ✗ Ошибка: $_" -ForegroundColor Red
    $firstProviderId = $null
}

# 4. Получение транзакций
Write-Host "`n4. Получение транзакций..." -ForegroundColor Green
if ($firstProviderId) {
    try {
        $transactions = Invoke-RestMethod -Uri "$baseUrl/transaction-list?provider_id=$firstProviderId&limit=10" -Method Get -Headers $headers
        if ($transactions.success) {
            Write-Host "   ✓ Всего транзакций: $($transactions.total)" -ForegroundColor Green
            Write-Host "   Получено: $($transactions.data.Count)" -ForegroundColor Gray
            if ($transactions.total -eq 0) {
                Write-Host "   ⚠ Транзакций нет. Загрузите данные через веб-интерфейс или API." -ForegroundColor Yellow
            } else {
                Write-Host "   Первые транзакции:" -ForegroundColor Gray
                $transactions.data | Select-Object -First 3 | ForEach-Object {
                    $date = $_.Дата
                    $qty = $_.Количество
                    $sum = $_.Сумма
                    Write-Host "     - $date : $qty л, $sum руб." -ForegroundColor Gray
                }
            }
        } else {
            Write-Host "   ✗ Ошибка: $($transactions.message)" -ForegroundColor Red
        }
    } catch {
        Write-Host "   ✗ Ошибка: $_" -ForegroundColor Red
    }
} else {
    Write-Host "   ⚠ Пропущено (нет провайдеров)" -ForegroundColor Yellow
}

# 5. Получение карт
Write-Host "`n5. Получение карт..." -ForegroundColor Green
try {
    $cards = Invoke-RestMethod -Uri "$baseUrl/card-list?limit=10" -Method Get -Headers $headers
    if ($cards.success) {
        Write-Host "   ✓ Всего карт: $($cards.total)" -ForegroundColor Green
        Write-Host "   Получено: $($cards.data.Count)" -ForegroundColor Gray
        if ($cards.total -eq 0) {
            Write-Host "   ⚠ Карт нет. Они будут созданы автоматически при загрузке транзакций." -ForegroundColor Yellow
        } else {
            Write-Host "   Первые карты:" -ForegroundColor Gray
            $cards.data | Select-Object -First 3 | ForEach-Object {
                $number = $_.Номер
                $status = $_.Статус
                $owner = $_.Владелец
                Write-Host "     - $number : $status, Владелец: $owner" -ForegroundColor Gray
            }
        }
    } else {
        Write-Host "   ✗ Ошибка: $($cards.message)" -ForegroundColor Red
    }
} catch {
    Write-Host "   ✗ Ошибка: $_" -ForegroundColor Red
}

Write-Host "`n=== Тестирование завершено ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Следующие шаги:" -ForegroundColor Yellow
Write-Host "1. Если нет провайдеров - создайте их через веб-интерфейс" -ForegroundColor Gray
Write-Host "2. Если нет транзакций - загрузите Excel файлы через веб-интерфейс" -ForegroundColor Gray
Write-Host "3. После загрузки данных повторите тест" -ForegroundColor Gray

