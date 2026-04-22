# Запуск стека GSM (для автозапуска при старте системы)
# Использование: .\scripts\docker-start.ps1
# Для добавления в автозагрузку: Планировщик заданий -> Создать задачу -> Триггер "При запуске"

$ErrorActionPreference = "Stop"
$ProjectPath = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $ProjectPath "docker-compose.yml"))) { $ProjectPath = $PSScriptRoot }

Set-Location $ProjectPath

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "Docker не найден. Установите Docker Desktop и запустите его."
    exit 1
}

# Сеть для мониторинга (если используется)
$net = docker network inspect gsm_network 2>$null
if ($LASTEXITCODE -ne 0) {
    docker network create gsm_network | Out-Null
}

docker compose up -d
exit $LASTEXITCODE
