# ═══════════════════════════════════════════════════════════════
# СКРИПТ ВОССТАНОВЛЕНИЯ GSM CONVERTER НА НОВОМ WINDOWS СЕРВЕРЕ
# ═══════════════════════════════════════════════════════════════
# 
# Этот скрипт автоматизирует процесс восстановления базы данных
# и проверки работоспособности на новом сервере
#
# ВАЖНО: Запускать ПОСЛЕ того, как:
# 1. Установлен Docker Desktop
# 2. Скопированы файлы проекта
# 3. Восстановлен файл backend\.env
# 4. Запущен docker-compose up -d
#
# ═══════════════════════════════════════════════════════════════

param(
    [string]$BackupFile = "gsm_backup_migration.dump",
    [switch]$SkipRestore,
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"

Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  GSM CONVERTER - ВОССТАНОВЛЕНИЕ НА НОВОМ СЕРВЕРЕ" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Функция для вывода с отметкой времени
function Write-Step {
    param([string]$Message, [string]$Color = "White")
    $timestamp = Get-Date -Format "HH:mm:ss"
    Write-Host "[$timestamp] $Message" -ForegroundColor $Color
}

# Функция для проверки
function Test-Step {
    param([string]$Name, [scriptblock]$Test)
    try {
        $result = & $Test
        if ($result) {
            Write-Step "✓ $Name" -Color Green
            return $true
        } else {
            Write-Step "✗ $Name" -Color Red
            return $false
        }
    } catch {
        Write-Step "✗ $Name - Ошибка: $_" -Color Red
        return $false
    }
}

# ═══════════════════════════════════════════════════════════════
# ЭТАП 1: ПРОВЕРКА ПРЕДВАРИТЕЛЬНЫХ УСЛОВИЙ
# ═══════════════════════════════════════════════════════════════

Write-Step "Этап 1: Проверка предварительных условий..." -Color Yellow
Write-Host ""

# Проверка Docker
$dockerOk = Test-Step "Docker установлен и запущен" {
    $null -ne (Get-Command docker -ErrorAction SilentlyContinue) -and
    (docker ps 2>&1 | Select-String "CONTAINER" -Quiet)
}

if (-not $dockerOk) {
    Write-Host ""
    Write-Host "❌ Docker не установлен или не запущен!" -ForegroundColor Red
    Write-Host "   Установите Docker Desktop: https://www.docker.com/products/docker-desktop" -ForegroundColor Yellow
    exit 1
}

# Проверка контейнеров GSM
$containersOk = Test-Step "GSM контейнеры запущены" {
    (docker ps | Select-String "gsm_backend" -Quiet) -and
    (docker ps | Select-String "gsm_db" -Quiet)
}

if (-not $containersOk) {
    Write-Host ""
    Write-Host "❌ GSM контейнеры не запущены!" -ForegroundColor Red
    Write-Host "   Запустите: docker-compose up -d" -ForegroundColor Yellow
    exit 1
}

# Проверка файла бэкапа
$backupPath = Join-Path $PSScriptRoot $BackupFile
$backupOk = Test-Step "Файл бэкапа существует: $BackupFile" {
    Test-Path $backupPath
}

if (-not $backupOk) {
    Write-Host ""
    Write-Host "❌ Файл бэкапа не найден: $backupPath" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✓ Все предварительные проверки пройдены!" -ForegroundColor Green
Write-Host ""

# ═══════════════════════════════════════════════════════════════
# ЭТАП 2: ВОССТАНОВЛЕНИЕ БАЗЫ ДАННЫХ
# ═══════════════════════════════════════════════════════════════

if (-not $SkipRestore) {
    Write-Step "Этап 2: Восстановление базы данных..." -Color Yellow
    Write-Host ""
    
    # Копирование бэкапа в контейнер
    Write-Step "Копирование бэкапа в контейнер PostgreSQL..."
    docker cp $backupPath gsm_db:/tmp/restore.dump
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Ошибка копирования бэкапа!" -ForegroundColor Red
        exit 1
    }
    
    # Восстановление
    Write-Step "Восстановление данных (это может занять несколько минут)..."
    docker exec gsm_db pg_restore -U gsm_user -d gsm_db -c --if-exists /tmp/restore.dump 2>&1 | Out-Null
    
    # Проверка восстановления
    $recordCount = docker exec gsm_db psql -U gsm_user -d gsm_db -t -c "SELECT COUNT(*) FROM transactions;" 2>&1
    if ($recordCount -match "\d+") {
        Write-Step "✓ База данных восстановлена. Записей в transactions: $($recordCount.Trim())" -Color Green
    } else {
        Write-Step "⚠ Не удалось проверить количество записей" -Color Yellow
    }
    
    Write-Host ""
} else {
    Write-Step "Этап 2: Восстановление БД пропущено (флаг -SkipRestore)" -Color Yellow
    Write-Host ""
}

# ═══════════════════════════════════════════════════════════════
# ЭТАП 3: ПРИМЕНЕНИЕ МИГРАЦИЙ
# ═══════════════════════════════════════════════════════════════

Write-Step "Этап 3: Применение миграций..." -Color Yellow
Write-Host ""

Write-Step "Применение миграций Alembic..."
docker exec gsm_backend alembic upgrade head

Write-Step "Проверка текущей версии миграций..."
$migrationVersion = docker exec gsm_backend alembic current 2>&1
Write-Host "   Текущая версия: $migrationVersion" -ForegroundColor Cyan

Write-Host ""

# ═══════════════════════════════════════════════════════════════
# ЭТАП 4: ПРОВЕРКА РАБОТОСПОСОБНОСТИ
# ═══════════════════════════════════════════════════════════════

Write-Step "Этап 4: Проверка работоспособности..." -Color Yellow
Write-Host ""

# Health check
$healthOk = Test-Step "Backend health check" {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8000/health" -UseBasicParsing -TimeoutSec 5
        $response.StatusCode -eq 200
    } catch {
        $false
    }
}

# Проверка API
$apiOk = Test-Step "API доступен" {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8000/docs" -UseBasicParsing -TimeoutSec 5
        $response.StatusCode -eq 200
    } catch {
        $false
    }
}

# Проверка базы данных
$dbOk = Test-Step "Подключение к базе данных" {
    $result = docker exec gsm_db psql -U gsm_user -d gsm_db -c "\dt" 2>&1
    $result -match "transactions"
}

# Проверка Redis
$redisOk = Test-Step "Redis доступен" {
    $result = docker exec gsm_redis redis-cli ping 2>&1
    $result -match "PONG"
}

Write-Host ""

# ═══════════════════════════════════════════════════════════════
# ИТОГОВЫЙ ОТЧЕТ
# ═══════════════════════════════════════════════════════════════

Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  ИТОГОВЫЙ ОТЧЕТ" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

$allOk = $healthOk -and $apiOk -and $dbOk -and $redisOk

if ($allOk) {
    Write-Host "✓ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ УСПЕШНО!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Сервис готов к использованию:" -ForegroundColor Cyan
    Write-Host "  - Backend API:     http://localhost:8000" -ForegroundColor White
    Write-Host "  - API Docs:        http://localhost:8000/docs" -ForegroundColor White
    Write-Host "  - Health Check:    http://localhost:8000/health" -ForegroundColor White
    Write-Host ""
    Write-Host "Следующие шаги:" -ForegroundColor Yellow
    Write-Host "  1. Собрать frontend: npm run build" -ForegroundColor White
    Write-Host "  2. Настроить веб-сервер (Nginx/IIS)" -ForegroundColor White
    Write-Host "  3. Обновить URL в 1С и настройках провайдеров" -ForegroundColor White
} else {
    Write-Host "⚠ НЕКОТОРЫЕ ПРОВЕРКИ НЕ ПРОЙДЕНЫ" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Проверьте логи:" -ForegroundColor Yellow
    Write-Host "  docker-compose logs -f backend" -ForegroundColor White
    Write-Host "  docker-compose logs -f db" -ForegroundColor White
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
