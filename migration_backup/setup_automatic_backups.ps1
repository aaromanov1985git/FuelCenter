# ═══════════════════════════════════════════════════════════════
# СКРИПТ НАСТРОЙКИ АВТОМАТИЧЕСКИХ БЭКАПОВ GSM CONVERTER
# ═══════════════════════════════════════════════════════════════
# 
# Создает скрипт бэкапа и настраивает Task Scheduler
# Запускать от имени администратора!
#
# ═══════════════════════════════════════════════════════════════

param(
    [string]$InstallPath = "C:\GSM",
    [string]$BackupTime = "02:00",
    [int]$RetentionDays = 7
)

# Проверка прав администратора
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "======================================================================" -ForegroundColor Red
    Write-Host "  ОШИБКА: Требуются права администратора!" -ForegroundColor Red
    Write-Host "======================================================================" -ForegroundColor Red
    exit 1
}

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  GSM CONVERTER - НАСТРОЙКА АВТОМАТИЧЕСКИХ БЭКАПОВ" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

function Write-Step {
    param([string]$Message, [string]$Color = "White")
    $timestamp = Get-Date -Format "HH:mm:ss"
    Write-Host "[$timestamp] $Message" -ForegroundColor $Color
}

# ═══════════════════════════════════════════════════════════════
# ЭТАП 1: СОЗДАНИЕ СКРИПТА БЭКАПА
# ═══════════════════════════════════════════════════════════════

Write-Step "Этап 1: Создание скрипта бэкапа..." -Color Yellow
Write-Host ""

$backupScriptPath = Join-Path $InstallPath "backup_database.ps1"
$backupScript = @"
# Automatic Database Backup Script for GSM Converter
# Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')

`$ErrorActionPreference = "Stop"
`$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
`$backupDir = "$InstallPath\backups"
`$logFile = "$InstallPath\logs\backup_log.txt"

# Функция логирования
function Write-Log {
    param([string]`$Message)
    `$logMessage = "[`$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] `$Message"
    `$logMessage | Out-File -FilePath `$logFile -Append -Encoding UTF8
    Write-Host `$logMessage
}

Write-Log "=========================================="
Write-Log "Starting database backup"

try {
    # Создание бэкапа
    Write-Log "Creating backup: gsm_backup_`${timestamp}.dump"
    docker exec gsm_db pg_dump -U gsm_user -d gsm_db -F c -f /tmp/gsm_backup_`${timestamp}.dump
    
    if (`$LASTEXITCODE -ne 0) {
        throw "pg_dump failed with exit code `$LASTEXITCODE"
    }
    
    # Копирование из контейнера
    Write-Log "Copying backup from container"
    docker cp gsm_db:/tmp/gsm_backup_`${timestamp}.dump `$backupDir\
    
    if (`$LASTEXITCODE -ne 0) {
        throw "docker cp failed with exit code `$LASTEXITCODE"
    }
    
    # Проверка размера файла
    `$backupFile = Join-Path `$backupDir "gsm_backup_`${timestamp}.dump"
    `$fileSize = (Get-Item `$backupFile).Length / 1MB
    Write-Log "Backup created successfully. Size: `$([math]::Round(`$fileSize, 2)) MB"
    
    # Очистка старых бэкапов
    Write-Log "Cleaning up old backups (older than $RetentionDays days)"
    `$cutoffDate = (Get-Date).AddDays(-$RetentionDays)
    `$oldBackups = Get-ChildItem `$backupDir\gsm_backup_*.dump | Where-Object { `$_.LastWriteTime -lt `$cutoffDate }
    
    foreach (`$oldBackup in `$oldBackups) {
        Remove-Item `$oldBackup.FullName -Force
        Write-Log "Deleted old backup: `$(`$oldBackup.Name)"
    }
    
    # Подсчет оставшихся бэкапов
    `$backupCount = (Get-ChildItem `$backupDir\gsm_backup_*.dump).Count
    Write-Log "Total backups: `$backupCount"
    
    Write-Log "Backup completed successfully"
    
} catch {
    Write-Log "ERROR: Backup failed - `$_"
    exit 1
}

Write-Log "=========================================="
"@

$backupScript | Out-File -FilePath $backupScriptPath -Encoding UTF8
Write-Step "✓ Создан скрипт: $backupScriptPath" -Color Green

Write-Host ""

# ═══════════════════════════════════════════════════════════════
# ЭТАП 2: НАСТРОЙКА TASK SCHEDULER
# ═══════════════════════════════════════════════════════════════

Write-Step "Этап 2: Настройка Task Scheduler..." -Color Yellow
Write-Host ""

try {
    # Проверка существования задачи
    $taskName = "GSM Database Backup"
    $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    
    if ($existingTask) {
        Write-Step "⚠ Задача '$taskName' уже существует. Удаляем старую..." -Color Yellow
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    }
    
    # Создание действия
    $action = New-ScheduledTaskAction `
        -Execute "powershell.exe" `
        -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$backupScriptPath`"" `
        -WorkingDirectory $InstallPath
    
    # Создание триггера
    $trigger = New-ScheduledTaskTrigger -Daily -At $BackupTime
    
    # Создание настроек
    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -RunOnlyIfNetworkAvailable:$false
    
    # Создание principal (от имени SYSTEM)
    $principal = New-ScheduledTaskPrincipal `
        -UserId "SYSTEM" `
        -LogonType ServiceAccount `
        -RunLevel Highest
    
    # Регистрация задачи
    Register-ScheduledTask `
        -TaskName $taskName `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -Principal $principal `
        -Description "Automatic daily backup of GSM Converter PostgreSQL database" | Out-Null
    
    Write-Step "✓ Задача '$taskName' создана успешно" -Color Green
    Write-Step "  Расписание: Ежедневно в $BackupTime" -Color Cyan
    Write-Step "  Retention: $RetentionDays дней" -Color Cyan
    
} catch {
    Write-Step "✗ Ошибка создания задачи: $_" -Color Red
    exit 1
}

Write-Host ""

# ═══════════════════════════════════════════════════════════════
# ЭТАП 3: ТЕСТОВЫЙ ЗАПУСК
# ═══════════════════════════════════════════════════════════════

Write-Step "Этап 3: Тестовый запуск бэкапа..." -Color Yellow
Write-Host ""

$response = Read-Host "Запустить тестовый бэкап сейчас? (y/n)"

if ($response -eq "y" -or $response -eq "Y") {
    Write-Step "Запуск тестового бэкапа..." -Color Cyan
    
    try {
        & $backupScriptPath
        Write-Step "✓ Тестовый бэкап выполнен успешно" -Color Green
        
        # Показать последние бэкапы
        Write-Host ""
        Write-Step "Последние бэкапы:" -Color Cyan
        Get-ChildItem "$InstallPath\backups\gsm_backup_*.dump" | 
            Sort-Object LastWriteTime -Descending | 
            Select-Object -First 5 | 
            Format-Table Name, @{Name="Size(MB)";Expression={[math]::Round($_.Length/1MB, 2)}}, LastWriteTime -AutoSize
        
    } catch {
        Write-Step "✗ Ошибка тестового бэкапа: $_" -Color Red
    }
} else {
    Write-Step "Тестовый бэкап пропущен" -Color Yellow
}

Write-Host ""

# ═══════════════════════════════════════════════════════════════
# ИТОГОВЫЙ ОТЧЕТ
# ═══════════════════════════════════════════════════════════════

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  НАСТРОЙКА ЗАВЕРШЕНА" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "✓ Автоматические бэкапы настроены!" -ForegroundColor Green
Write-Host ""
Write-Host "Параметры:" -ForegroundColor Yellow
Write-Host "  - Скрипт бэкапа: $backupScriptPath" -ForegroundColor White
Write-Host "  - Директория бэкапов: $InstallPath\backups" -ForegroundColor White
Write-Host "  - Расписание: Ежедневно в $BackupTime" -ForegroundColor White
Write-Host "  - Retention: $RetentionDays дней" -ForegroundColor White
Write-Host "  - Лог файл: $InstallPath\logs\backup_log.txt" -ForegroundColor White
Write-Host ""
Write-Host "Управление задачей:" -ForegroundColor Yellow
Write-Host "  - Просмотр: Get-ScheduledTask -TaskName 'GSM Database Backup'" -ForegroundColor White
Write-Host "  - Запуск вручную: Start-ScheduledTask -TaskName 'GSM Database Backup'" -ForegroundColor White
Write-Host "  - Отключение: Disable-ScheduledTask -TaskName 'GSM Database Backup'" -ForegroundColor White
Write-Host "  - Удаление: Unregister-ScheduledTask -TaskName 'GSM Database Backup'" -ForegroundColor White
Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
