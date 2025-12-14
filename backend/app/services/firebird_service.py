"""
Сервис для работы с базой данных Firebird
Обеспечивает подключение и чтение данных из Firebird Database (FDB)
"""
from typing import List, Dict, Optional, Any
from sqlalchemy.orm import Session
from decimal import Decimal
from datetime import datetime
import json
import os
from app.logger import logger

# Опциональный импорт библиотеки Firebird
try:
    import fdb
    FDB_AVAILABLE = True
    
    # Пытаемся найти библиотеку в стандартных местах
    possible_paths = [
        '/lib/x86_64-linux-gnu/libfbclient.so.2',  # Debian/Ubuntu через пакетный менеджер
        '/lib/x86_64-linux-gnu/libfbclient.so',
        '/usr/lib/x86_64-linux-gnu/libfbclient.so.2',
        '/usr/lib/x86_64-linux-gnu/libfbclient.so',
        '/opt/firebird/lib/libfbclient.so',
        '/usr/lib/libfbclient.so.2',
        '/usr/lib/libfbclient.so'
    ]
    
    firebird_lib = os.environ.get('FIREBIRD_LIB')
    if not firebird_lib:
        # Ищем библиотеку в стандартных местах
        for path in possible_paths:
            if os.path.exists(path):
                firebird_lib = path
                os.environ['FIREBIRD_LIB'] = path
                logger.info("Найдена Firebird библиотека", extra={"path": path})
                break
    
    if firebird_lib:
        os.environ['FIREBIRD_LIB'] = firebird_lib
        logger.info("Используется Firebird библиотека", extra={"path": firebird_lib})
    else:
        logger.warning("Firebird библиотека не найдена в стандартных местах. Убедитесь, что она установлена.")
        
except ImportError:
    FDB_AVAILABLE = False
    fdb = None


class FirebirdService:
    """
    Сервис для работы с базой данных Firebird
    """
    
    def __init__(self, db: Session):
        self.db = db
    
    def connect(self, connection_settings: Dict[str, Any]):
        """
        Подключение к базе данных Firebird
        
        Args:
            connection_settings: Словарь с настройками подключения:
                - host: хост сервера (по умолчанию localhost)
                - database: путь к файлу базы данных или имя базы
                - user: имя пользователя (по умолчанию SYSDBA)
                - password: пароль (по умолчанию masterkey)
                - port: порт (по умолчанию 3050)
                - charset: кодировка (по умолчанию UTF8)
        
        Returns:
            Объект подключения к Firebird
        """
        if not FDB_AVAILABLE:
            raise ImportError(
                "Библиотека fdb не установлена. Установите её командой: pip install fdb==2.0.2"
            )
        
        try:
            host = connection_settings.get("host", "localhost")
            database = connection_settings.get("database")
            
            # Обрабатываем user: если не указан или пустая строка, используем значение по умолчанию
            user = connection_settings.get("user")
            if not user or (isinstance(user, str) and not user.strip()):
                user = "SYSDBA"
                logger.debug("Используется пользователь по умолчанию: SYSDBA")
            
            # Обрабатываем password: если не указан (None), используем значение по умолчанию
            # Если указана пустая строка "", используем её (это валидное значение для некоторых конфигураций)
            password = connection_settings.get("password")
            if password is None:
                password = "masterkey"
                logger.debug("Используется пароль по умолчанию: masterkey")
            elif password == "":
                logger.debug("Используется пустой пароль")
            # Если password - пустая строка, оставляем её как есть
            
            port = connection_settings.get("port", 3050)
            charset = connection_settings.get("charset", "UTF8")
            
            if not database:
                raise ValueError("Не указан путь к базе данных Firebird")
            
            # Проверяем, что user не пустой (после обработки)
            if not user or not user.strip():
                raise ValueError("Не указано имя пользователя для подключения к Firebird. Укажите 'user' в настройках подключения.")
            
            # Логируем информацию о настройках подключения (без пароля для безопасности)
            logger.debug("Подключение к Firebird", extra={
                "host": host,
                "database": database,
                "port": port,
                "user": user,
                "charset": charset,
                "has_password": password is not None,
                "password_is_empty": password == ""
            })
            
            # Формируем строку подключения для Firebird
            # Формат DSN для Firebird:
            # - Локальное подключение к файлу: путь к файлу (например, /path/to/db.fdb или C:\path\to\db.fdb)
            # - Удаленное подключение: host/port:database (например, 192.168.1.1/3050:/path/to/db.fdb)
            # - Удаленное подключение (стандартный порт): host:database (например, 192.168.1.1:/path/to/db.fdb)
            
            # Определяем тип подключения
            is_remote_host = host and host not in ("localhost", "127.0.0.1", "")
            
            if is_remote_host:
                # Удаленное подключение к серверу Firebird
                # Формат: host/port:database
                if port and port != 3050:
                    dsn = f"{host}/{port}:{database}"
                else:
                    # Используем стандартный порт 3050 (можно не указывать)
                    dsn = f"{host}:{database}"
            else:
                # Локальное подключение к файлу базы данных
                dsn = database
            
            logger.debug("Формирование строки подключения Firebird", extra={
                "host": host,
                "port": port,
                "database": database,
                "dsn": dsn,
                "is_remote": is_remote_host,
                "user": user,
                "has_password": password is not None,
                "password_is_empty": password == "",
                "charset": charset
            })
            
            try:
                conn = fdb.connect(
                    dsn=dsn,
                    user=user,
                    password=password,
                    charset=charset
                )
            except Exception as connect_error:
                # Логируем детали ошибки подключения
                logger.error("Ошибка при вызове fdb.connect", extra={
                    "dsn": dsn,
                    "user": user,
                    "has_password": password is not None,
                    "password_is_empty": password == "",
                    "charset": charset,
                    "error": str(connect_error),
                    "error_type": type(connect_error).__name__
                }, exc_info=True)
                raise
            
            logger.info("Подключение к Firebird установлено", extra={
                "host": host,
                "database": database,
                "user": user
            })
            
            return conn
            
        except Exception as e:
            error_message = str(e)
            error_code = None
            
            # Извлекаем SQLCODE из ошибки, если есть
            if "SQLCODE" in error_message:
                import re
                match = re.search(r'SQLCODE:\s*(-?\d+)', error_message)
                if match:
                    error_code = int(match.group(1))
            
            # Проверяем специфическую ошибку отсутствия клиентской библиотеки
            if "Firebird Client Library" in error_message or "fbclient" in error_message.lower():
                error_message = (
                    "Не найдена клиентская библиотека Firebird (fbclient).\n"
                    "Для Windows: скачайте и установите Firebird Client Library с https://firebirdsql.org/en/downloads/\n"
                    "Или установите полную версию Firebird Server.\n"
                    "После установки убедитесь, что fbclient.dll находится в PATH или укажите путь через переменную окружения FIREBIRD_LIB.\n"
                    f"Оригинальная ошибка: {error_message}"
                )
            # Проверяем ошибки аутентификации
            elif (error_code == -902 or 
                  "Your user name and password are not defined" in error_message or
                  "Not authenticated" in error_message or
                  "authentication" in error_message.lower() or
                  "login" in error_message.lower() and "failed" in error_message.lower()):
                # Проверяем, были ли указаны учетные данные в настройках
                user_provided = connection_settings.get("user") and connection_settings.get("user").strip()
                password_provided = connection_settings.get("password") is not None
                
                # Получаем фактические значения для диагностики
                actual_user = connection_settings.get("user", "")
                actual_password_set = connection_settings.get("password") is not None
                actual_password_empty = connection_settings.get("password") == ""
                
                if not user_provided or not password_provided:
                    # Учетные данные не указаны
                    if not user_provided:
                        user_status = "не указан"
                    else:
                        user_status = f'"{actual_user}" (пусто)'
                    password_status = "не указан" if not password_provided else ("указан (пустая строка)" if actual_password_empty else "указан")
                    original_error = error_message
                    error_message = (
                        "Ошибка аутентификации в Firebird.\n\n"
                        "Имя пользователя и/или пароль не указаны в настройках подключения.\n\n"
                        f"Текущие настройки:\n"
                        f"- Пользователь: {user_status}\n"
                        f"- Пароль: {password_status}\n\n"
                        "Решение:\n"
                        "1. В разделе 'Настройки подключения' укажите:\n"
                        "   - Пользователь: имя пользователя (например, SYSDBA)\n"
                        "   - Пароль: пароль пользователя (если пароль пустой, оставьте поле пустым)\n"
                        "2. Нажмите 'Тестировать подключение' для проверки\n"
                        "3. Сохраните шаблон после успешного тестирования\n\n"
                        f"Оригинальная ошибка: {original_error}"
                    )
                else:
                    # Учетные данные указаны, но неверны
                    user_display = actual_user if user_provided else "не указан"
                    password_display = "указан" if actual_password_set and not actual_password_empty else "пустая строка" if actual_password_empty else "не указан"
                    
                    error_message = (
                        "Ошибка аутентификации в Firebird.\n\n"
                        "Указанные имя пользователя и/или пароль неверны или пользователь не существует в базе данных.\n\n"
                        f"Используемые учетные данные:\n"
                        f"- Пользователь: \"{user_display}\"\n"
                        f"- Пароль: {password_display}\n\n"
                        "Возможные причины:\n"
                        "1. Неверный пароль для указанного пользователя\n"
                        "2. Пользователь не существует в базе данных Firebird\n"
                        "3. Пользователь не имеет прав доступа к указанной базе данных\n"
                        "4. Для Firebird 3.0+ может потребоваться указать роль (ROLE)\n"
                        "5. База данных может требовать другого пользователя (не SYSDBA)\n\n"
                        "Решение:\n"
                        "1. Проверьте правильность имени пользователя и пароля\n"
                        "2. Убедитесь, что пользователь существует в базе данных Firebird\n"
                        "3. Проверьте права доступа пользователя к базе данных\n"
                        "4. Для Firebird 3.0+ попробуйте использовать пользователя с ролью RDB$ADMIN\n"
                        "5. Обратитесь к администратору базы данных для настройки учетных данных\n\n"
                        f"Оригинальная ошибка: {error_message}"
                    )
            
            logger.error("Ошибка подключения к Firebird", extra={
                "error": error_message,
                "error_code": error_code,
                "host": connection_settings.get("host"),
                "database": connection_settings.get("database"),
                "user_provided": bool(connection_settings.get("user")),
                "password_provided": bool(connection_settings.get("password"))
            }, exc_info=True)
            
            # Преобразуем в более понятное исключение
            raise ConnectionError(error_message) from e
    
    def read_data(
        self,
        connection_settings: Dict[str, Any],
        source_table: Optional[str] = None,
        source_query: Optional[str] = None,
        field_mapping: Optional[Dict[str, str]] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        date_column: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Чтение данных из базы данных Firebird
        
        Args:
            connection_settings: Настройки подключения к Firebird
            source_table: Имя таблицы для чтения данных
            source_query: SQL запрос для получения данных (приоритет над source_table)
            field_mapping: Маппинг полей из БД на поля системы
            date_from: Начальная дата для фильтрации (опционально)
            date_to: Конечная дата для фильтрации (опционально)
            date_column: Имя колонки с датой для фильтрации (по умолчанию ищется автоматически)
        
        Returns:
            Список словарей с данными транзакций
        """
        conn = None
        try:
            # Подключаемся к БД
            conn = self.connect(connection_settings)
            cursor = conn.cursor()
            
            # Формируем SQL запрос
            if source_query:
                query = source_query
            elif source_table:
                query = f"SELECT * FROM {source_table}"
            else:
                raise ValueError("Не указаны source_table или source_query")
            
            # Добавляем фильтрацию по дате, если указана
            if date_from or date_to:
                query_upper = query.upper().strip()
                query_original = query.strip()
                
                # Определяем имя колонки с датой
                if not date_column:
                    import re
                    mapped_alias = None
                    
                    # Пробуем найти колонку с датой в маппинге
                    # ВАЖНО: db_field в маппинге может быть алиасом (например, "Дата и время"),
                    # поэтому мы должны найти реальное имя колонки в SELECT запросе
                    if field_mapping:
                        for sys_field, db_field in field_mapping.items():
                            if sys_field.lower() in ['date', 'transaction_date', 'дата']:
                                # db_field может быть алиасом, сохраняем его для поиска реального имени колонки
                                mapped_alias = db_field
                                break
                    
                    # Ищем реальное имя колонки в SELECT части запроса
                    # Извлекаем SELECT часть (до FROM) - ищем реальное имя колонки ДО AS
                    select_match = re.search(r'SELECT\s+(.*?)\s+FROM', query, re.IGNORECASE | re.DOTALL)
                    if select_match:
                        select_part = select_match.group(1)
                        
                        # Если у нас есть mapped_alias из маппинга, ищем колонку с таким алиасом
                        if mapped_alias:
                            # Ищем колонку, которая имеет AS алиас, совпадающий с mapped_alias
                            # Паттерн: rg."Date" AS "Дата и время" или "Date" AS "Дата и время"
                            alias_pattern = rf'(\w+\."Date"|"\w+"\."Date"|"Date"|Date)\s+AS\s+"{re.escape(mapped_alias)}"'
                            match = re.search(alias_pattern, select_part, re.IGNORECASE)
                            if match:
                                matched_col = match.group(1).strip()
                                # Извлекаем имя колонки без алиаса таблицы
                                if '.' in matched_col:
                                    date_column = matched_col.split('.')[-1].strip('"')
                                else:
                                    date_column = matched_col.strip('"')
                                logger.info("Найдена колонка с датой по алиасу из маппинга", extra={
                                    "mapped_alias": mapped_alias,
                                    "date_column": date_column
                                })
                        
                        # Если не нашли по алиасу, ищем колонки с датой в SELECT части (до AS алиаса)
                        if not date_column:
                            # Паттерны: rg."Date" AS "Дата и время", "Date" AS "Дата", Date AS "Дата"
                            date_patterns = [
                                r'(?:rg\.|"rg"\.)?"Date"\s+AS',  # rg."Date" AS или "rg"."Date" AS
                                r'(?:rg\.|"rg"\.)?Date\s+AS',     # rg.Date AS
                                r'"Date"\s+AS',                    # "Date" AS
                                r'\bDate\s+AS',                    # Date AS
                            ]
                            
                            for pattern in date_patterns:
                                match = re.search(pattern, select_part, re.IGNORECASE)
                                if match:
                                    matched_col = match.group(0).replace(' AS', '').strip()
                                    # Извлекаем имя колонки без алиаса таблицы
                                    if '.' in matched_col:
                                        date_column = matched_col.split('.')[-1].strip('"')
                                    else:
                                        date_column = matched_col.strip('"')
                                    logger.info("Найдена колонка с датой по паттерну", extra={
                                        "date_column": date_column,
                                        "matched_col": matched_col
                                    })
                                    break
                        
                        # Если не нашли через AS, ищем просто колонки с Date
                        if not date_column:
                            simple_patterns = [
                                r'(?:rg\.|"rg"\.)?"Date"',  # rg."Date" или "rg"."Date"
                                r'(?:rg\.|"rg"\.)?Date',     # rg.Date
                                r'"Date"',                    # "Date"
                                r'\bDate\b',                  # Date
                            ]
                            for pattern in simple_patterns:
                                match = re.search(pattern, select_part, re.IGNORECASE)
                                if match:
                                    matched_col = match.group(0)
                                    # Извлекаем имя колонки без алиаса таблицы
                                    if '.' in matched_col:
                                        date_column = matched_col.split('.')[-1].strip('"')
                                    else:
                                        date_column = matched_col.strip('"')
                                    logger.info("Найдена колонка с датой без AS", extra={
                                        "date_column": date_column,
                                        "matched_col": matched_col
                                    })
                                    break
                    
                    # Если не нашли через регулярные выражения, пробуем простой поиск
                    if not date_column:
                        possible_date_columns = ['rg."Date"', '"rg"."Date"', 'rg.Date', 'Date', '"Date"']
                        for col in possible_date_columns:
                            if col in query:
                                # Извлекаем имя колонки без алиаса таблицы
                                if '.' in col:
                                    date_column = col.split('.')[-1].strip('"')
                                else:
                                    date_column = col.strip('"')
                                logger.info("Найдена колонка с датой простым поиском", extra={
                                    "date_column": date_column,
                                    "found_in": col
                                })
                                break
                
                if date_column:
                    # Определяем полное имя колонки с учетом алиаса таблицы из запроса
                    # Ищем, какой алиас таблицы используется в SELECT части
                    table_alias = None
                    if 'rg.' in query_upper or 'rg ' in query_upper:
                        table_alias = 'rg'
                    
                    # Формируем условие WHERE для фильтрации по дате
                    date_conditions = []
                    
                    if date_from:
                        # Форматируем дату для Firebird
                        date_from_str = date_from.strftime('%Y-%m-%d %H:%M:%S')
                        # Используем имя колонки с учетом возможного алиаса таблицы
                        if table_alias:
                            date_conditions.append(f'{table_alias}."{date_column}" >= \'{date_from_str}\'')
                        else:
                            date_conditions.append(f'"{date_column}" >= \'{date_from_str}\'')
                    
                    if date_to:
                        # Форматируем дату для Firebird (конец дня)
                        date_to_str = date_to.strftime('%Y-%m-%d 23:59:59')
                        # Используем имя колонки с учетом возможного алиаса таблицы
                        if table_alias:
                            date_conditions.append(f'{table_alias}."{date_column}" <= \'{date_to_str}\'')
                        else:
                            date_conditions.append(f'"{date_column}" <= \'{date_to_str}\'')
                    
                    if date_conditions:
                        date_filter = ' AND '.join(date_conditions)
                        
                        # Убираем точку с запятой и лишние пробелы в конце запроса
                        query_clean = query_original.rstrip(';').rstrip()
                        query_clean_upper = query_clean.upper()
                        
                        # Добавляем WHERE или AND в зависимости от наличия WHERE в запросе
                        if "WHERE" in query_clean_upper:
                            # Находим позицию WHERE
                            where_pos = query_clean_upper.find("WHERE")
                            # Находим позицию ORDER BY после WHERE
                            order_by_pos = query_clean_upper.find("ORDER BY", where_pos)
                            
                            if order_by_pos >= 0:
                                # Есть ORDER BY - добавляем AND перед ORDER BY
                                # Берем часть запроса от WHERE до ORDER BY
                                where_clause_end = order_by_pos
                                where_part = query_clean[where_pos:where_clause_end].strip()
                                
                                # Проверяем, что WHERE не пустое (если пустое, это ошибка)
                                if len(where_part) <= 5:  # "WHERE" = 5 символов
                                    # WHERE пустое - заменяем на WHERE с условием
                                    query = query_clean[:where_pos] + f"WHERE {date_filter} " + query_clean[order_by_pos:]
                                else:
                                    # WHERE не пустое - добавляем AND
                                    query = query_clean[:order_by_pos].rstrip() + f" AND {date_filter} " + query_clean[order_by_pos:]
                            else:
                                # Нет ORDER BY - добавляем AND в конец WHERE условия
                                # Проверяем, что после WHERE есть условие
                                where_part = query_clean[where_pos:].strip()
                                if len(where_part) <= 5:  # "WHERE" = 5 символов
                                    # WHERE пустое - заменяем на WHERE с условием
                                    query = query_clean[:where_pos] + f"WHERE {date_filter}"
                                else:
                                    # WHERE не пустое - добавляем AND
                                    query = query_clean + f" AND {date_filter}"
                        else:
                            # Нет WHERE - добавляем WHERE перед ORDER BY или в конец
                            order_by_pos = query_clean_upper.find("ORDER BY")
                            if order_by_pos >= 0:
                                query = query_clean[:order_by_pos].rstrip() + f" WHERE {date_filter} " + query_clean[order_by_pos:]
                            else:
                                query = query_clean + f" WHERE {date_filter}"
                        
                        logger.info("Добавлена фильтрация по дате", extra={
                            "date_from": date_from_str if date_from else None,
                            "date_to": date_to_str if date_to else None,
                            "date_column": date_column,
                            "table_alias": table_alias,
                            "date_filter": date_filter,
                            "query_preview": query[:300] if len(query) > 300 else query
                        })
                else:
                    logger.warning("Не удалось определить колонку с датой для фильтрации", extra={
                        "date_from": date_from.isoformat() if date_from else None,
                        "date_to": date_to.isoformat() if date_to else None,
                        "query_preview": query[:300] if len(query) > 300 else query,
                        "field_mapping": field_mapping
                    })
                    # Если не удалось определить колонку, просто не применяем фильтрацию
                    logger.info("Фильтрация по дате не применена - колонка с датой не найдена")
            
            # Выполняем запрос
            cursor.execute(query)
            
            # Получаем названия колонок
            columns = [desc[0] for desc in cursor.description]
            
            # Читаем данные
            rows = cursor.fetchall()
            
            logger.info("Данные прочитаны из Firebird", extra={
                "rows_count": len(rows),
                "columns_count": len(columns)
            })
            
            # Преобразуем данные в список словарей
            data = []
            for row in rows:
                row_dict = dict(zip(columns, row))
                data.append(row_dict)
            
            # Применяем маппинг полей, если указан
            if field_mapping:
                mapped_data = []
                for row in data:
                    mapped_row = {}
                    for system_field, db_field in field_mapping.items():
                        # Ищем поле в данных (регистронезависимо)
                        value = None
                        for key, val in row.items():
                            if key.lower() == db_field.lower():
                                value = val
                                break
                        
                        mapped_row[system_field] = value
                    mapped_data.append(mapped_row)
                data = mapped_data
            
            return data
            
        except Exception as e:
            logger.error("Ошибка чтения данных из Firebird", extra={
                "error": str(e),
                "source_table": source_table,
                "has_query": bool(source_query)
            }, exc_info=True)
            raise
        finally:
            if conn:
                try:
                    conn.close()
                    logger.debug("Подключение к Firebird закрыто")
                except Exception as e:
                    logger.warning("Ошибка при закрытии подключения к Firebird", extra={"error": str(e)})
    
    def get_table_columns(
        self,
        connection_settings: Dict[str, Any],
        table_name: str
    ) -> List[str]:
        """
        Получение списка колонок таблицы из базы данных Firebird
        
        Args:
            connection_settings: Настройки подключения к Firebird
            table_name: Имя таблицы
        
        Returns:
            Список имен колонок
        """
        conn = None
        try:
            conn = self.connect(connection_settings)
            cursor = conn.cursor()
            
            # Получаем список колонок таблицы
            # В Firebird имена таблиц могут быть в разных регистрах, пробуем несколько вариантов
            table_name_upper = table_name.upper()
            table_name_lower = table_name.lower()
            
            logger.info("Запрос колонок таблицы", extra={
                "table_name": table_name,
                "table_name_upper": table_name_upper,
                "table_name_lower": table_name_lower
            })
            
            # В Firebird имена таблиц хранятся в верхнем регистре в системных таблицах
            # Используем параметризованный запрос для безопасности и правильной обработки регистра
            try:
                # Пробуем точное совпадение в верхнем регистре (стандарт Firebird)
                cursor.execute("""
                    SELECT RDB$FIELD_NAME
                    FROM RDB$RELATION_FIELDS
                    WHERE RDB$RELATION_NAME = ?
                    ORDER BY RDB$FIELD_POSITION
                """, (table_name_upper,))
                result = cursor.fetchall()
                columns = [row[0].strip() for row in result] if result else []
                
                if not columns:
                    # Пробуем без преобразования регистра (если таблица создана с кавычками)
                    logger.debug("Колонки не найдены в верхнем регистре, пробуем оригинальное имя", extra={
                        "table_name": table_name
                    })
                    cursor.execute("""
                        SELECT RDB$FIELD_NAME
                        FROM RDB$RELATION_FIELDS
                        WHERE RDB$RELATION_NAME = ?
                        ORDER BY RDB$FIELD_POSITION
                    """, (table_name,))
                    result = cursor.fetchall()
                    columns = [row[0].strip() for row in result] if result else []
                    
                    if not columns:
                        # Пробуем case-insensitive поиск
                        logger.debug("Пробуем case-insensitive поиск", extra={
                            "table_name": table_name
                        })
                        cursor.execute("""
                            SELECT RDB$FIELD_NAME
                            FROM RDB$RELATION_FIELDS
                            WHERE UPPER(RDB$RELATION_NAME) = UPPER(?)
                            ORDER BY RDB$FIELD_POSITION
                        """, (table_name,))
                        result = cursor.fetchall()
                        columns = [row[0].strip() for row in result] if result else []
                        
            except Exception as e:
                logger.error("Ошибка при выполнении запроса колонок", extra={
                    "table_name": table_name,
                    "error": str(e)
                }, exc_info=True)
                raise
            
            logger.info("Колонки таблицы загружены", extra={
                "table_name": table_name,
                "columns_count": len(columns),
                "columns": columns[:10] if columns else []  # Первые 10 для отладки
            })
            
            return columns
            
        except Exception as e:
            logger.error("Ошибка при получении колонок таблицы", extra={
                "error": str(e),
                "table_name": table_name
            }, exc_info=True)
            raise
        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass
    
    def get_query_columns(
        self,
        connection_settings: Dict[str, Any],
        query: str
    ) -> List[str]:
        """
        Получение списка колонок из результата SQL запроса
        
        Args:
            connection_settings: Настройки подключения к Firebird
            query: SQL запрос (SELECT)
        
        Returns:
            Список имен колонок из результата запроса
        """
        conn = None
        try:
            conn = self.connect(connection_settings)
            cursor = conn.cursor()
            
            logger.info("Получение колонок из SQL запроса", extra={
                "query_preview": query[:200] if len(query) > 200 else query
            })
            
            # Очищаем запрос от лишних пробелов и точек с запятой
            query_clean = query.strip().rstrip(';').strip()
            query_upper = query_clean.upper()
            
            # Базовая валидация SQL запроса
            if not query_upper.startswith("SELECT"):
                raise ValueError("SQL запрос должен начинаться с SELECT")
            
            # Проверяем наличие FROM
            if "FROM" not in query_upper:
                raise ValueError("SQL запрос должен содержать ключевое слово FROM")
            
            # В Firebird для получения метаданных используем WHERE 1=0 или FIRST 1
            # Это безопаснее, чем ROWS, который может не работать с JOIN
            try:
                # Проверяем, есть ли уже FIRST или ROWS в запросе
                has_limit = "FIRST" in query_upper or ("ROWS" in query_upper and "ROWS" not in ["WHERE", "FROM"])
                
                if has_limit:
                    # Если уже есть ограничение, используем запрос как есть
                    test_query = query_clean
                else:
                    # Используем WHERE 1=0 для получения только метаданных без данных
                    # Это самый надежный способ для запросов с JOIN
                    if "WHERE" in query_upper:
                        # Добавляем AND 1=0 к существующему WHERE
                        # Находим позицию WHERE
                        where_pos = query_upper.find("WHERE")
                        if where_pos >= 0:
                            # Ищем конец условия WHERE (до ORDER BY или конца запроса)
                            order_by_pos = query_upper.find("ORDER BY", where_pos)
                            if order_by_pos >= 0:
                                # Добавляем AND 1=0 перед ORDER BY
                                test_query = query_clean[:order_by_pos].rstrip() + " AND 1=0 " + query_clean[order_by_pos:]
                            else:
                                # Добавляем AND 1=0 в конец
                                test_query = query_clean.rstrip() + " AND 1=0"
                        else:
                            test_query = query_clean
                    else:
                        # Добавляем WHERE 1=0 перед ORDER BY или в конец
                        order_by_pos = query_upper.find("ORDER BY")
                        if order_by_pos >= 0:
                            test_query = query_clean[:order_by_pos].rstrip() + " WHERE 1=0 " + query_clean[order_by_pos:]
                        else:
                            test_query = query_clean + " WHERE 1=0"
                
                logger.debug("Выполнение запроса для получения метаданных", extra={
                    "test_query_preview": test_query[:300] if len(test_query) > 300 else test_query
                })
                
                cursor.execute(test_query)
                
                # Получаем описание колонок из курсора
                columns = []
                if hasattr(cursor, 'description') and cursor.description:
                    # Извлекаем имена колонок из описания
                    # В Firebird имена колонок могут быть в верхнем регистре или как указано в AS
                    columns = [desc[0].strip() if desc[0] else f"COL_{i}" for i, desc in enumerate(cursor.description)]
                    
                    # Если колонки не получены, пробуем получить первую строку
                    if not columns:
                        row = cursor.fetchone()
                        if row and cursor.description:
                            columns = [desc[0].strip() if desc[0] else f"COL_{i}" for i, desc in enumerate(cursor.description)]
                else:
                    # Альтернативный способ - получаем первую строку
                    row = cursor.fetchone()
                    if row and cursor.description:
                        columns = [desc[0].strip() if desc[0] else f"COL_{i}" for i, desc in enumerate(cursor.description)]
                
                logger.info("Колонки из SQL запроса получены", extra={
                    "columns_count": len(columns),
                    "columns": columns[:10] if columns else []
                })
                
                if not columns:
                    raise ValueError("Не удалось получить описание колонок из запроса")
                
                return columns
                
            except Exception as e:
                error_msg = str(e)
                logger.warning("Ошибка при выполнении запроса с WHERE 1=0, пробуем выполнить запрос как есть", extra={
                    "error": error_msg,
                    "query_preview": query_clean[:200] if len(query_clean) > 200 else query_clean
                })
                
                # Если запрос содержит ошибку (например, неверное имя колонки), 
                # пробуем выполнить оригинальный запрос с FIRST 1 для получения метаданных
                try:
                    # Пробуем добавить FIRST 1 после SELECT
                    if query_upper.startswith("SELECT"):
                        # Вставляем FIRST 1 после SELECT
                        select_pos = query_clean.upper().find("SELECT")
                        if select_pos >= 0:
                            # Проверяем, нет ли уже DISTINCT или других модификаторов
                            after_select = query_clean[select_pos + 6:].lstrip()
                            if after_select.upper().startswith("DISTINCT"):
                                # Если есть DISTINCT, вставляем FIRST 1 после него
                                distinct_pos = after_select.upper().find("DISTINCT")
                                test_query = query_clean[:select_pos + 6] + " " + after_select[:distinct_pos + 8] + " FIRST 1 " + after_select[distinct_pos + 8:]
                            else:
                                # Просто вставляем FIRST 1 после SELECT
                                test_query = query_clean[:select_pos + 6] + " FIRST 1 " + after_select
                        else:
                            test_query = query_clean
                    else:
                        test_query = query_clean
                    
                    logger.debug("Пробуем выполнить запрос с FIRST 1", extra={
                        "test_query_preview": test_query[:300] if len(test_query) > 300 else test_query
                    })
                    
                    cursor.execute(test_query)
                    if cursor.description:
                        columns = [desc[0].strip() if desc[0] else f"COL_{i}" for i, desc in enumerate(cursor.description)]
                        if columns:
                            logger.info("Колонки получены через FIRST 1", extra={
                                "columns_count": len(columns)
                            })
                            return columns
                except Exception as e2:
                    error_msg2 = str(e2)
                    logger.error("Ошибка при выполнении запроса с FIRST 1", extra={
                        "error": error_msg2
                    })
                    
                    # Определяем тип ошибки и формируем понятное сообщение
                    if "SQLCODE: -206" in error_msg2 or "Column unknown" in error_msg2:
                        # Извлекаем имя колонки/таблицы из ошибки для более понятного сообщения
                        unknown_name = ""
                        if "Column unknown" in error_msg2:
                            # Пытаемся найти имя колонки в ошибке (например, "DCCARDS.CardID")
                            import re
                            match = re.search(r'Column unknown\s*-\s*([A-Z_][A-Z0-9_.]*)', error_msg2, re.IGNORECASE)
                            if match:
                                unknown_name = match.group(1)
                        
                        error_hint = ""
                        if unknown_name:
                            if "." in unknown_name:
                                table_name, col_name = unknown_name.split(".", 1)
                                error_hint = (
                                    f"\n\nВозможные причины:\n"
                                    f"1. Таблица '{table_name}' не существует или имеет другое имя\n"
                                    f"2. Колонка '{col_name}' не существует в таблице '{table_name}'\n"
                                    f"3. Проблема с регистром: в Firebird имена с кавычками чувствительны к регистру\n"
                                    f"   - Если таблица создана как \"dcCards\", используйте \"dcCards\"\n"
                                    f"   - Если таблица создана без кавычек, используйте DCCARDS (верхний регистр)\n"
                                    f"4. Проверьте правильность кавычек в JOIN условии\n"
                                )
                        
                        raise ValueError(
                            f"Ошибка в SQL запросе: не найдена указанная колонка или таблица.\n"
                            f"Проверьте правильность имен таблиц и колонок в запросе.{error_hint}"
                            f"Оригинальная ошибка: {error_msg2}"
                        )
                    elif "SQLCODE: -104" in error_msg2 or "Token unknown" in error_msg2 or "SQL error code = -104" in error_msg2:
                        raise ValueError(
                            f"Синтаксическая ошибка в SQL запросе.\n"
                            f"Проверьте правильность синтаксиса: запятые между колонками, правильность ключевых слов, кавычки.\n"
                            f"Пример правильного запроса:\n"
                            f"SELECT\n"
                            f"    dcCards.\"Name\" AS \"Наименование карты\",\n"
                            f"    rg.\"AZSCode\" AS \"АЗС\"\n"
                            f"FROM \"rgAmountRests\" rg\n"
                            f"LEFT JOIN \"dcCards\" ON rg.\"CardID\" = dcCards.\"CardID\"\n"
                            f"Оригинальная ошибка: {error_msg2}"
                        )
                    elif "SQLCODE: -206" in error_msg or "Column unknown" in error_msg:
                        raise ValueError(
                            f"Ошибка в SQL запросе: не найдена указанная колонка или таблица.\n"
                            f"Проверьте правильность имен таблиц и колонок в запросе.\n"
                            f"Оригинальная ошибка: {error_msg}"
                        )
                    elif "SQLCODE: -104" in error_msg or "Token unknown" in error_msg or "SQL error code = -104" in error_msg:
                        raise ValueError(
                            f"Синтаксическая ошибка в SQL запросе.\n"
                            f"Проверьте правильность синтаксиса: запятые между колонками, правильность ключевых слов, кавычки.\n"
                            f"Пример правильного запроса:\n"
                            f"SELECT\n"
                            f"    dcCards.\"Name\" AS \"Наименование карты\",\n"
                            f"    rg.\"AZSCode\" AS \"АЗС\"\n"
                            f"FROM \"rgAmountRests\" rg\n"
                            f"LEFT JOIN \"dcCards\" ON rg.\"CardID\" = dcCards.\"CardID\"\n"
                            f"Оригинальная ошибка: {error_msg}"
                        )
                
                # Если ничего не помогло, пробрасываем исходную ошибку с понятным сообщением
                if "SQLCODE: -206" in error_msg or "Column unknown" in error_msg:
                    # Извлекаем имя колонки/таблицы из ошибки для более понятного сообщения
                    unknown_name = ""
                    if "Column unknown" in error_msg:
                        # Пытаемся найти имя колонки в ошибке (например, "DCCARDS.CardID")
                        import re
                        match = re.search(r'Column unknown\s*-\s*([A-Z_][A-Z0-9_.]*)', error_msg, re.IGNORECASE)
                        if match:
                            unknown_name = match.group(1)
                    
                    error_hint = ""
                    if unknown_name:
                        if "." in unknown_name:
                            table_name, col_name = unknown_name.split(".", 1)
                            error_hint = (
                                f"\n\nВозможные причины:\n"
                                f"1. Таблица '{table_name}' не существует или имеет другое имя\n"
                                f"2. Колонка '{col_name}' не существует в таблице '{table_name}'\n"
                                f"3. Проблема с регистром: в Firebird имена с кавычками чувствительны к регистру\n"
                                f"   - Если таблица создана как \"dcCards\", используйте \"dcCards\"\n"
                                f"   - Если таблица создана без кавычек, используйте DCCARDS (верхний регистр)\n"
                                f"4. Проверьте правильность кавычек в JOIN условии\n"
                            )
                    
                    raise ValueError(
                        f"Ошибка в SQL запросе: не найдена указанная колонка или таблица.\n"
                        f"Проверьте правильность имен таблиц и колонок в запросе.{error_hint}"
                        f"Оригинальная ошибка: {error_msg}"
                    )
                elif "SQLCODE: -104" in error_msg or "Token unknown" in error_msg or "SQL error code = -104" in error_msg:
                    raise ValueError(
                        f"Синтаксическая ошибка в SQL запросе.\n"
                        f"Проверьте правильность синтаксиса: запятые между колонками, правильность ключевых слов, кавычки.\n"
                        f"Пример правильного запроса:\n"
                        f"SELECT\n"
                        f"    dcCards.\"Name\" AS \"Наименование карты\",\n"
                        f"    rg.\"AZSCode\" AS \"АЗС\"\n"
                        f"FROM \"rgAmountRests\" rg\n"
                        f"LEFT JOIN \"dcCards\" ON rg.\"CardID\" = dcCards.\"CardID\"\n"
                        f"Оригинальная ошибка: {error_msg}"
                    )
                else:
                    raise ValueError(f"Не удалось получить описание колонок из запроса: {error_msg}")
            
        except Exception as e:
            logger.error("Ошибка при получении колонок из SQL запроса", extra={
                "error": str(e),
                "query_preview": query[:200] if len(query) > 200 else query
            }, exc_info=True)
            raise
        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass
    
    def test_connection(self, connection_settings: Dict[str, Any]) -> Dict[str, Any]:
        """
        Тестирование подключения к базе данных Firebird
        
        Args:
            connection_settings: Настройки подключения
        
        Returns:
            Словарь с результатом теста:
                - success: успешность подключения
                - message: сообщение о результате
                - tables: список таблиц (если успешно)
        """
        conn = None
        try:
            conn = self.connect(connection_settings)
            cursor = conn.cursor()
            
            # Получаем список таблиц
            cursor.execute("""
                SELECT RDB$RELATION_NAME
                FROM RDB$RELATIONS
                WHERE RDB$SYSTEM_FLAG = 0
                AND RDB$RELATION_TYPE = 0
                ORDER BY RDB$RELATION_NAME
            """)
            
            tables = [row[0].strip() for row in cursor.fetchall()]
            
            return {
                "success": True,
                "message": "Подключение успешно установлено",
                "tables": tables
            }
            
        except Exception as e:
            error_message = str(e)
            
            # Проверяем специфическую ошибку отсутствия клиентской библиотеки
            if "Firebird Client Library" in error_message or "fbclient" in error_message.lower():
                error_message = (
                    "Не найдена клиентская библиотека Firebird (fbclient).\n\n"
                    "Инструкция по установке:\n"
                    "1. Для Windows: скачайте Firebird Client Library с https://firebirdsql.org/en/downloads/\n"
                    "2. Распакуйте архив и скопируйте fbclient.dll в системную папку (например, C:\\Windows\\System32)\n"
                    "   ИЛИ добавьте папку с fbclient.dll в переменную окружения PATH\n"
                    "   ИЛИ установите полную версию Firebird Server\n"
                    "3. Перезапустите приложение после установки\n\n"
                    f"Оригинальная ошибка: {error_message}"
                )
            
            logger.error("Ошибка тестирования подключения к Firebird", extra={
                "error": error_message
            }, exc_info=True)
            
            return {
                "success": False,
                "message": error_message,
                "tables": []
            }
        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass

