# Плавная остановка стека GSM (SIGTERM, затем удаление контейнеров)
# Использование: .\scripts\docker-stop.ps1

$ErrorActionPreference = "Stop"
$ProjectPath = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $ProjectPath "docker-compose.yml"))) { $ProjectPath = $PSScriptRoot }

Set-Location $ProjectPath

# Сначала плавная остановка (stop_grace_period из compose даёт время на завершение)
docker compose stop -t 30
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Затем удаление контейнеров (сеть и тома не трогаем при down)
docker compose down
exit $LASTEXITCODE
