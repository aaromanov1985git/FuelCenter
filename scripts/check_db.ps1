# Скрипт для проверки подключения к базе данных
Write-Host "Проверка подключения к базе данных..." -ForegroundColor Cyan

# Проверяем, что контейнеры запущены
Write-Host "`n1. Проверка контейнеров:" -ForegroundColor Yellow
docker-compose ps

# Проверяем базы данных
Write-Host "`n2. Список баз данных:" -ForegroundColor Yellow
docker-compose exec -T db psql -U gsm_user -d postgres -c "\l" 2>&1

# Проверяем подключение от имени gsm_user
Write-Host "`n3. Проверка подключения от имени gsm_user:" -ForegroundColor Yellow
docker-compose exec -T db psql -U gsm_user -d gsm_db -c "SELECT current_database(), current_user;" 2>&1

# Проверяем переменную окружения DATABASE_URL в backend
Write-Host "`n4. DATABASE_URL в backend контейнере:" -ForegroundColor Yellow
docker-compose exec -T backend python -c "import os; print('DATABASE_URL:', os.getenv('DATABASE_URL', 'NOT SET'))" 2>&1

# Проверяем логи backend
Write-Host "`n5. Последние логи backend (DATABASE_URL, подключение):" -ForegroundColor Yellow
docker-compose logs backend --tail=50 2>&1 | Select-String -Pattern "DATABASE_URL|Подключение|ОШИБКА|FATAL|database" -Context 2

Write-Host "`nПроверка завершена." -ForegroundColor Green
