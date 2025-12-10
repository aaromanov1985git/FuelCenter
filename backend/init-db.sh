#!/bin/bash
set -e

# Создаем базу данных gsm_user, если она не существует
# Это нужно для устранения ошибок в логах PostgreSQL,
# когда какие-то подключения пытаются использовать базу данных с именем пользователя

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "postgres" <<-EOSQL
    SELECT 'CREATE DATABASE gsm_user WITH OWNER = gsm_user'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'gsm_user')\gexec
EOSQL

echo "База данных gsm_user проверена/создана"
