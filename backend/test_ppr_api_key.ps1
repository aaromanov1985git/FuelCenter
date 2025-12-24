# Тестовый скрипт для проверки PPR API v1
# Проверяет работу эндпоинта /public-api/v1/transaction-list

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PPR API v1 Test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Параметры запроса
$uri = "https://malignantly-meteoric-stallion.cloudpub.ru/public-api/v1/transaction-list"

$body = @{
    token    = "yzsdzCsjyJpHOHwSwnynQzsGVDEZeXcR"
    dateFrom = "2025-12-01"  # ИСПРАВЛЕНО: было "2025-12-0"
    dateTo   = "2025-12-03"
    format   = "JSON"
} | ConvertTo-Json

Write-Host "URL: $uri" -ForegroundColor Yellow
Write-Host "Body: $body" -ForegroundColor Yellow
Write-Host ""

# Выполнение POST-запроса
try {
    Write-Host "Отправка POST-запроса..." -ForegroundColor Yellow
    
    $response = Invoke-RestMethod -Uri $uri -Method Post -Body $body -ContentType "application/json; charset=utf-8"
    
    # Вывод результата
    Write-Host "Запрос выполнен успешно!" -ForegroundColor Green
    Write-Host ""
    
    if ($response.'array-list') {
        $count = ($response.'array-list').Count
        Write-Host "Найдено транзакций: $count" -ForegroundColor Green
        Write-Host ""
        
        # Выводим первые 3 транзакции для проверки
        $response.'array-list' | Select-Object -First 3 | ForEach-Object {
            Write-Host "--- Транзакция ---" -ForegroundColor Cyan
            Write-Host "idTrans: $($_.idTrans)"
            Write-Host "date: $($_.date)"
            Write-Host "cardNum: $($_.cardNum)"
            Write-Host "amount: $($_.amount) (количество)"
            Write-Host "sum: $($_.sum) (сумма)"
            Write-Host "price: $($_.price) (цена за литр)"
            Write-Host "serviceName: $($_.serviceName)"
            Write-Host "TypeID: $($_.TypeID)"
            Write-Host ""
        }
    } else {
        Write-Host "В ответе отсутствует поле 'array-list'" -ForegroundColor Red
        Write-Host "Ответ: $($response | ConvertTo-Json -Depth 10)" -ForegroundColor Yellow
    }
}
catch {
    Write-Host "Ошибка при выполнении запроса:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response body: $responseBody" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test completed" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
