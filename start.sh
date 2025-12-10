#!/bin/bash
# Скрипт для запуска проекта

echo "Запуск GSM Converter..."

# Проверка наличия Docker
if ! command -v docker &> /dev/null; then
    echo "Ошибка: Docker не установлен"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "Ошибка: Docker Compose не установлен"
    exit 1
fi

# Запуск через Docker Compose
echo "Запуск сервисов через Docker Compose..."
docker-compose up -d

echo ""
echo "Сервисы запущены!"
echo "Frontend: http://localhost:3000"
echo "Backend API: http://localhost:8000"
echo "API Docs: http://localhost:8000/docs"
echo ""
echo "Для просмотра логов: docker-compose logs -f"
echo "Для остановки: docker-compose down"

