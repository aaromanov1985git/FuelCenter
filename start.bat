@echo off
REM Скрипт для запуска проекта (Windows)

echo Запуск GSM Converter...

REM Проверка наличия Docker
where docker >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Ошибка: Docker не установлен
    exit /b 1
)

where docker-compose >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Ошибка: Docker Compose не установлен
    exit /b 1
)

REM Запуск через Docker Compose
echo Запуск сервисов через Docker Compose...
docker-compose up -d

echo.
echo Сервисы запущены!
echo Frontend: http://localhost:3002
echo Backend API: http://localhost:8000
echo API Docs: http://localhost:8000/docs
echo.
echo Для просмотра логов: docker-compose logs -f
echo Для плавной остановки: scripts\docker-stop.ps1  или  docker-compose stop -t 30

pause

