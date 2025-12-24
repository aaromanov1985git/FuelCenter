# Тестовый скрипт для диагностики PPR API
# Проверяет, доходят ли запросы до API

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PPR API Diagnostic Test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$baseUrl = "http://10.35.1.200:8000"
$apiKey = "yzsdzCsjyJpHOHwSwnynQzsGVDEZeXcR"

# Тест 1: Проверка доступности сервера
Write-Host "Test 1: Checking server availability..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/health" -Method Get -UseBasicParsing -ErrorAction Stop
    Write-Host "  OK: Server is running" -ForegroundColor Green
    Write-Host "  Status: $($response.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Server is not accessible" -ForegroundColor Red
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Тест 2: Проверка корневого эндпоинта PPR API (без авторизации)
Write-Host "Test 2: Testing PPR API root endpoint (no auth)..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/public-api/v2" -Method Get -ErrorAction Stop
    Write-Host "  OK: Root endpoint is accessible" -ForegroundColor Green
    Write-Host "  Response: $($response | ConvertTo-Json -Compress)" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Root endpoint failed" -ForegroundColor Red
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "  Response: $responseBody" -ForegroundColor Red
    }
}

Write-Host ""

# Тест 3: Проверка корневого эндпоинта с API ключом
Write-Host "Test 3: Testing PPR API root endpoint (with API key)..." -ForegroundColor Yellow
try {
    $headers = @{
        "Authorization" = $apiKey
        "Content-Type" = "application/json"
    }
    $response = Invoke-RestMethod -Uri "$baseUrl/api/public-api/v2" -Method Get -Headers $headers -ErrorAction Stop
    Write-Host "  OK: Root endpoint with auth is accessible" -ForegroundColor Green
    Write-Host "  Response: $($response | ConvertTo-Json -Compress)" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Root endpoint with auth failed" -ForegroundColor Red
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "  Response: $responseBody" -ForegroundColor Red
    }
}

Write-Host ""

# Тест 4: Проверка эндпоинта транзакций (с авторизацией)
Write-Host "Test 4: Testing transactions endpoint (with API key)..." -ForegroundColor Yellow
try {
    $headers = @{
        "Authorization" = $apiKey
        "Content-Type" = "application/json"
    }
    $url = "$baseUrl/api/public-api/v2/transactions?dateFrom=2025-12-01&dateTo=2025-12-22&format=json&limit=1"
    $response = Invoke-RestMethod -Uri $url -Method Get -Headers $headers -ErrorAction Stop
    Write-Host "  OK: Transactions endpoint is accessible" -ForegroundColor Green
    Write-Host "  Total transactions: $($response.total)" -ForegroundColor Green
    Write-Host "  Transactions count: $($response.transactions.Count)" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Transactions endpoint failed" -ForegroundColor Red
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "  Response: $responseBody" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Diagnostic test completed" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Check server logs for detailed request information" -ForegroundColor Yellow

