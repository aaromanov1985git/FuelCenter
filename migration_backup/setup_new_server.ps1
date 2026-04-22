# ═══════════════════════════════════════════════════════════════
# СКРИПТ НАСТРОЙКИ НОВОГО WINDOWS СЕРВЕРА ДЛЯ GSM CONVERTER
# ═══════════════════════════════════════════════════════════════
# 
# Автоматизирует настройку Windows Firewall и создание директорий
# Запускать от имени администратора!
#
# ═══════════════════════════════════════════════════════════════

param(
    [string]$InstallPath = "C:\GSM",
    [switch]$SkipFirewall
)

# Проверка прав администратора
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "======================================================================" -ForegroundColor Red
    Write-Host "  ОШИБКА: Требуются права администратора!" -ForegroundColor Red
    Write-Host "======================================================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Запустите PowerShell от имени администратора и повторите команду." -ForegroundColor Yellow
    exit 1
}

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  GSM CONVERTER - НАСТРОЙКА НОВОГО СЕРВЕРА" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

# Функция для вывода с отметкой времени
function Write-Step {
    param([string]$Message, [string]$Color = "White")
    $timestamp = Get-Date -Format "HH:mm:ss"
    Write-Host "[$timestamp] $Message" -ForegroundColor $Color
}

# ═══════════════════════════════════════════════════════════════
# ЭТАП 1: СОЗДАНИЕ ДИРЕКТОРИЙ
# ═══════════════════════════════════════════════════════════════

Write-Step "Этап 1: Создание директорий..." -Color Yellow
Write-Host ""

try {
    # Основная директория
    if (-not (Test-Path $InstallPath)) {
        New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null
        Write-Step "✓ Создана директория: $InstallPath" -Color Green
    } else {
        Write-Step "✓ Директория уже существует: $InstallPath" -Color Green
    }
    
    # Поддиректории
    $subdirs = @("backups", "logs", "temp")
    foreach ($subdir in $subdirs) {
        $path = Join-Path $InstallPath $subdir
        if (-not (Test-Path $path)) {
            New-Item -ItemType Directory -Path $path -Force | Out-Null
            Write-Step "✓ Создана директория: $path" -Color Green
        }
    }
} catch {
    Write-Step "✗ Ошибка создания директорий: $_" -Color Red
    exit 1
}

Write-Host ""

# ═══════════════════════════════════════════════════════════════
# ЭТАП 2: НАСТРОЙКА WINDOWS FIREWALL
# ═══════════════════════════════════════════════════════════════

if (-not $SkipFirewall) {
    Write-Step "Этап 2: Настройка Windows Firewall..." -Color Yellow
    Write-Host ""
    
    $ports = @(
        @{Name="GSM Backend API"; Port=8000; Description="FastAPI Backend"},
        @{Name="GSM Frontend"; Port=3000; Description="React Frontend"},
        @{Name="PostgreSQL"; Port=5432; Description="PostgreSQL Database (optional)"},
        @{Name="Redis"; Port=6379; Description="Redis Cache (optional)"},
        @{Name="Grafana"; Port=3001; Description="Grafana Monitoring (optional)"},
        @{Name="Prometheus"; Port=9090; Description="Prometheus Metrics (optional)"}
    )
    
    foreach ($portInfo in $ports) {
        $ruleName = $portInfo.Name
        $port = $portInfo.Port
        
        # Проверка существования правила
        $existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
        
        if ($existingRule) {
            Write-Step "✓ Правило уже существует: $ruleName (порт $port)" -Color Yellow
        } else {
            try {
                New-NetFirewallRule -DisplayName $ruleName `
                    -Direction Inbound `
                    -LocalPort $port `
                    -Protocol TCP `
                    -Action Allow `
                    -Description $portInfo.Description | Out-Null
                Write-Step "✓ Создано правило: $ruleName (порт $port)" -Color Green
            } catch {
                Write-Step "✗ Ошибка создания правила для порта $port : $_" -Color Red
            }
        }
    }
} else {
    Write-Step "Этап 2: Настройка Firewall пропущена (флаг -SkipFirewall)" -Color Yellow
}

Write-Host ""

# ═══════════════════════════════════════════════════════════════
# ЭТАП 3: ПРОВЕРКА УСТАНОВЛЕННОГО ПО
# ═══════════════════════════════════════════════════════════════

Write-Step "Этап 3: Проверка установленного ПО..." -Color Yellow
Write-Host ""

# Проверка Docker
$dockerInstalled = $null -ne (Get-Command docker -ErrorAction SilentlyContinue)
if ($dockerInstalled) {
    $dockerVersion = docker --version
    Write-Step "✓ Docker установлен: $dockerVersion" -Color Green
} else {
    Write-Step "✗ Docker НЕ установлен" -Color Red
    Write-Host "   Скачайте с: https://www.docker.com/products/docker-desktop" -ForegroundColor Yellow
}

# Проверка Docker Compose
$composeInstalled = $null -ne (Get-Command docker-compose -ErrorAction SilentlyContinue)
if ($composeInstalled) {
    $composeVersion = docker-compose --version
    Write-Step "✓ Docker Compose установлен: $composeVersion" -Color Green
} else {
    Write-Step "⚠ Docker Compose НЕ найден (обычно входит в Docker Desktop)" -Color Yellow
}

# Проверка Git
$gitInstalled = $null -ne (Get-Command git -ErrorAction SilentlyContinue)
if ($gitInstalled) {
    $gitVersion = git --version
    Write-Step "✓ Git установлен: $gitVersion" -Color Green
} else {
    Write-Step "✗ Git НЕ установлен" -Color Red
    Write-Host "   Скачайте с: https://git-scm.com/download/win" -ForegroundColor Yellow
}

Write-Host ""

# ═══════════════════════════════════════════════════════════════
# ЭТАП 4: СОЗДАНИЕ ИНФОРМАЦИОННОГО ФАЙЛА
# ═══════════════════════════════════════════════════════════════

Write-Step "Этап 4: Создание информационного файла..." -Color Yellow
Write-Host ""

$infoFile = Join-Path $InstallPath "server_setup_info.txt"
$info = @"
======================================================================
  GSM CONVERTER - ИНФОРМАЦИЯ О НАСТРОЙКЕ СЕРВЕРА
======================================================================

Дата настройки: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
Компьютер: $env:COMPUTERNAME
Пользователь: $env:USERNAME

Директория установки: $InstallPath

Открытые порты:
- 8000: Backend API
- 3000: Frontend
- 5432: PostgreSQL (опционально)
- 6379: Redis (опционально)
- 3001: Grafana (опционально)
- 9090: Prometheus (опционально)

Установленное ПО:
- Docker: $(if ($dockerInstalled) { "Да" } else { "Нет" })
- Docker Compose: $(if ($composeInstalled) { "Да" } else { "Нет" })
- Git: $(if ($gitInstalled) { "Да" } else { "Нет" })

Следующие шаги:
1. Скопируйте файлы проекта в $InstallPath
2. Скопируйте директорию migration_backup
3. Восстановите backend/.env из migration_backup/backend.env.backup
4. Запустите: docker-compose up -d
5. Восстановите БД: .\migration_backup\restore_on_new_server.ps1

======================================================================
"@

$info | Out-File -FilePath $infoFile -Encoding UTF8
Write-Step "✓ Создан файл: $infoFile" -Color Green

Write-Host ""

# ═══════════════════════════════════════════════════════════════
# ИТОГОВЫЙ ОТЧЕТ
# ═══════════════════════════════════════════════════════════════

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  НАСТРОЙКА ЗАВЕРШЕНА" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

$allReady = $dockerInstalled -and $gitInstalled

if ($allReady) {
    Write-Host "✓ Сервер готов к развертыванию GSM Converter!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Следующие шаги:" -ForegroundColor Yellow
    Write-Host "  1. Скопируйте файлы проекта в $InstallPath" -ForegroundColor White
    Write-Host "  2. Скопируйте migration_backup в $InstallPath" -ForegroundColor White
    Write-Host "  3. Восстановите .env: copy migration_backup\backend.env.backup backend\.env" -ForegroundColor White
    Write-Host "  4. Запустите: docker-compose up -d" -ForegroundColor White
    Write-Host "  5. Восстановите БД: .\migration_backup\restore_on_new_server.ps1" -ForegroundColor White
} else {
    Write-Host "⚠ Требуется установка дополнительного ПО:" -ForegroundColor Yellow
    Write-Host ""
    if (-not $dockerInstalled) {
        Write-Host "  - Docker Desktop: https://www.docker.com/products/docker-desktop" -ForegroundColor White
    }
    if (-not $gitInstalled) {
        Write-Host "  - Git для Windows: https://git-scm.com/download/win" -ForegroundColor White
    }
    Write-Host ""
    Write-Host "После установки запустите этот скрипт снова для проверки." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
