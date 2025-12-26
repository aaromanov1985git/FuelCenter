# Установка Firebird Client Library в Docker контейнере

## Проблема
Приложение работает в Docker контейнере (Linux), а библиотека `fbclient.dll` установлена на Windows хосте. Библиотека должна быть установлена **внутри контейнера**.

## Решение

### 1. Пересоберите Docker образ

Выполните команду для пересборки образа с установкой Firebird Client Library:

```bash
docker-compose build backend
```

Это установит библиотеку `libfbclient.so` внутри контейнера.

### 2. Перезапустите контейнер

После пересборки перезапустите контейнер:

```bash
docker-compose down
docker-compose up -d
```

### 3. Проверка установки

Проверьте, что библиотека установлена в контейнере:

```bash
docker-compose exec backend ls -la /usr/lib/x86_64-linux-gnu/libfbclient.so*
```

Или проверьте переменные окружения:

```bash
docker-compose exec backend env | grep FIREBIRD
```

### 4. Альтернативный вариант (если автоматическая установка не работает)

Если автоматическая установка через пакетный менеджер не работает, можно вручную установить библиотеку:

1. Скачайте Firebird Client Library для Linux:
   ```bash
   wget https://github.com/FirebirdSQL/firebird/releases/download/v4.0.4/Firebird-4.0.4.3375-0.amd64.tar.gz
   ```

2. Распакуйте и установите:
   ```bash
   tar -xzf Firebird-4.0.4.3375-0.amd64.tar.gz
   cd Firebird-4.0.4.3375-0.amd64
   ./install.sh -silent
   ```

3. Установите переменную окружения в `docker-compose.yml`:
   ```yaml
   environment:
     FIREBIRD_LIB: /opt/firebird/lib/libfbclient.so
     LD_LIBRARY_PATH: /opt/firebird/lib:${LD_LIBRARY_PATH}
   ```

### 5. Проверка подключения

После пересборки и перезапуска попробуйте протестировать подключение к Firebird через интерфейс приложения.

## Примечания

- Библиотека должна быть установлена **внутри Docker контейнера**, а не на Windows хосте
- После установки библиотеки в контейнере переменная окружения `FIREBIRD_LIB` будет автоматически настроена
- Если библиотека установлена в другом месте, укажите путь через переменную окружения `FIREBIRD_LIB` в `docker-compose.yml`

