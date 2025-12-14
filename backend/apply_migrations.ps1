# Скрипт для применения миграций БД
# Использование: .\apply_migrations.ps1

Write-Host "Проверка виртуального окружения..." -ForegroundColor Yellow

# Проверяем наличие виртуального окружения
if (Test-Path "venv\Scripts\Activate.ps1") {
    Write-Host "Активация виртуального окружения venv..." -ForegroundColor Green
    & .\venv\Scripts\Activate.ps1
} elseif (Test-Path ".venv\Scripts\Activate.ps1") {
    Write-Host "Активация виртуального окружения .venv..." -ForegroundColor Green
    & .\.venv\Scripts\Activate.ps1
} else {
    Write-Host "Виртуальное окружение не найдено. Создание нового..." -ForegroundColor Yellow
    python -m venv venv
    Write-Host "Активация виртуального окружения..." -ForegroundColor Green
    & .\venv\Scripts\Activate.ps1
    Write-Host "Установка зависимостей..." -ForegroundColor Yellow
    pip install -r requirements.txt
}

Write-Host "Применение миграций..." -ForegroundColor Yellow
alembic upgrade head

Write-Host "Миграции применены успешно!" -ForegroundColor Green
