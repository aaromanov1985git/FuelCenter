FROM python:3.11-slim

WORKDIR /app

# Установка системных зависимостей
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    wget \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Установка Firebird Client Library для Linux
# Пробуем установить через пакетный менеджер, если не получается - используем ручную установку
RUN apt-get update && \
    if apt-get install -y libfbclient2 firebird3.0-common 2>&1 | grep -q "Unable to locate package\|Package.*not found"; then \
        echo "Firebird не найден в репозиториях, используем ручную установку"; \
        cd /tmp && \
        wget -q https://github.com/FirebirdSQL/firebird/releases/download/v4.0.4/Firebird-4.0.4.3375-0.amd64.tar.gz -O firebird.tar.gz && \
        tar -xzf firebird.tar.gz && \
        cd Firebird-4.0.4.3375-0.amd64 && \
        ./install.sh -silent && \
        cd / && \
        rm -rf /tmp/firebird.tar.gz /tmp/Firebird-4.0.4.3375-0.amd64; \
    else \
        echo "Firebird установлен через пакетный менеджер"; \
    fi && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Проверяем установку библиотеки
RUN echo "Проверка установки Firebird библиотеки..." && \
    if [ -f /lib/x86_64-linux-gnu/libfbclient.so.2 ]; then \
        echo "✓ Библиотека найдена в /lib/x86_64-linux-gnu/libfbclient.so.2"; \
        ls -lh /lib/x86_64-linux-gnu/libfbclient.so*; \
    elif [ -f /usr/lib/x86_64-linux-gnu/libfbclient.so.2 ]; then \
        echo "✓ Библиотека найдена в /usr/lib/x86_64-linux-gnu/libfbclient.so.2"; \
        ls -lh /usr/lib/x86_64-linux-gnu/libfbclient.so*; \
    elif [ -f /opt/firebird/lib/libfbclient.so ]; then \
        echo "✓ Библиотека найдена в /opt/firebird/lib/libfbclient.so"; \
        ls -lh /opt/firebird/lib/libfbclient.so*; \
    else \
        echo "✗ ВНИМАНИЕ: Библиотека libfbclient не найдена!"; \
        echo "Поиск библиотеки в системе:"; \
        find /lib -name "*fbclient*" 2>/dev/null | head -10 || echo "Не найдено в /lib"; \
        find /usr -name "*fbclient*" 2>/dev/null | head -10 || echo "Не найдено в /usr"; \
        find /opt -name "*fbclient*" 2>/dev/null | head -10 || echo "Не найдено в /opt"; \
        exit 1; \
    fi

# Установка переменных окружения для поиска библиотеки
# Библиотека установлена через пакетный менеджер в /lib/x86_64-linux-gnu/libfbclient.so.2
# Также проверяем альтернативные пути
ENV LD_LIBRARY_PATH=/lib/x86_64-linux-gnu:/usr/lib/x86_64-linux-gnu:/opt/firebird/lib:/usr/lib:${LD_LIBRARY_PATH}
ENV FIREBIRD_LIB=/lib/x86_64-linux-gnu/libfbclient.so.2

# Копирование requirements и установка зависимостей
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копирование кода приложения
COPY ./app /app/app

# Копирование файлов Alembic для миграций
COPY ./alembic /app/alembic
COPY ./alembic.ini /app/alembic.ini

# Создание директории для временных файлов
RUN mkdir -p /app/tmp

# Переменные окружения
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Порт приложения
EXPOSE 8000

# Команда запуска
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

