# Установка клиентской библиотеки Firebird

Для работы с базой данных Firebird необходимо установить клиентскую библиотеку Firebird (fbclient).

## Windows

### Вариант 1: Установка полной версии Firebird Server (рекомендуется)

1. Скачайте установщик Firebird с официального сайта: https://firebirdsql.org/en/downloads/
2. Выберите версию **Firebird 3.0** или **Firebird 4.0** для Windows
3. Запустите установщик и следуйте инструкциям
4. При установке выберите опцию "Client Library Only" (если доступна) или установите полную версию
5. После установки файл `fbclient.dll` будет находиться в папке установки (обычно `C:\Program Files\Firebird\Firebird_3_0\` или `C:\Program Files\Firebird\Firebird_4_0\`)
6. Добавьте папку с `fbclient.dll` в переменную окружения PATH:
   - Откройте "Система" → "Дополнительные параметры системы" → "Переменные среды"
   - В "Системные переменные" найдите `Path` и нажмите "Изменить"
   - Добавьте путь к папке с `fbclient.dll` (например, `C:\Program Files\Firebird\Firebird_3_0`)
   - Нажмите "ОК" и перезапустите приложение

### Вариант 2: Только клиентская библиотека

1. Скачайте архив с клиентской библиотекой Firebird: https://firebirdsql.org/en/downloads/
2. Распакуйте архив
3. Найдите файл `fbclient.dll` в распакованной папке
4. Скопируйте `fbclient.dll` в одну из следующих папок:
   - `C:\Windows\System32\` (для всех пользователей)
   - Или в папку с вашим Python приложением
   - Или добавьте папку с `fbclient.dll` в PATH (см. Вариант 1, шаг 6)

### Вариант 3: Указание пути через переменную окружения

Если вы не хотите добавлять библиотеку в PATH, можно указать путь напрямую:

1. Создайте переменную окружения `FIREBIRD_LIB` со значением пути к `fbclient.dll`:
   ```
   FIREBIRD_LIB=C:\Program Files\Firebird\Firebird_3_0\fbclient.dll
   ```

2. Перезапустите приложение после установки переменной окружения

## Linux

### Ubuntu/Debian

```bash
# Установка клиентской библиотеки Firebird
sudo apt-get update
sudo apt-get install firebird3.0-client

# Или для Firebird 4.0
sudo apt-get install firebird4.0-client
```

### CentOS/RHEL/Fedora

```bash
# Для CentOS/RHEL 7/8
sudo yum install firebird

# Для Fedora
sudo dnf install firebird
```

### Указание пути через переменную окружения

Если библиотека установлена в нестандартное место:

```bash
export FIREBIRD_LIB=/usr/lib/x86_64-linux-gnu/libfbclient.so
# или
export FIREBIRD_LIB=/usr/lib64/libfbclient.so
```

## macOS

```bash
# Установка через Homebrew
brew install firebird

# Или скачайте установщик с официального сайта
# https://firebirdsql.org/en/downloads/
```

## Проверка установки

После установки клиентской библиотеки перезапустите backend приложение и попробуйте подключиться к базе данных Firebird через интерфейс.

Если ошибка сохраняется:

1. Убедитесь, что библиотека установлена правильно
2. Проверьте, что путь к библиотеке добавлен в PATH (Windows) или доступен системе (Linux/macOS)
3. Перезапустите приложение после установки
4. Проверьте логи backend для получения дополнительной информации об ошибке

## Дополнительная информация

- Официальный сайт Firebird: https://firebirdsql.org/
- Документация по установке: https://firebirdsql.org/en/documentation/
- Python библиотека fdb: https://pypi.org/project/fdb/

