"""
Утилиты для работы с файлами
"""
from fastapi import UploadFile, HTTPException
from typing import Optional
import tempfile
import os
from app.logger import logger


def validate_excel_file(file: UploadFile) -> None:
    """
    Валидация загружаемого Excel файла
    
    Проверяет:
    - Расширение файла (.xlsx, .xls)
    - MIME type (если указан)
    
    Args:
        file: Загружаемый файл
    
    Raises:
        HTTPException: Если файл не соответствует требованиям
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Имя файла не указано")
    
    if not file.filename.endswith((".xlsx", ".xls")):
        logger.warning(f"Попытка загрузить файл неподдерживаемого формата: {file.filename}")
        raise HTTPException(status_code=400, detail="Поддерживаются только файлы Excel (.xlsx, .xls)")
    
    # Проверка MIME type (не строгая, так как некоторые браузеры могут отправлять неправильный MIME type)
    if file.content_type and "excel" not in file.content_type.lower() and "spreadsheet" not in file.content_type.lower():
        # Проверяем только если MIME type явно не Excel
        if file.content_type not in [
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel",
            "application/octet-stream"  # Некоторые браузеры отправляют так
        ]:
            raise HTTPException(
                status_code=400,
                detail=f"Неверный тип файла. Ожидается Excel файл, получен: {file.content_type}"
            )


def validate_file_size(content: bytes, max_size: int) -> None:
    """
    Валидация размера файла
    
    Args:
        content: Содержимое файла в байтах
        max_size: Максимальный размер файла в байтах
    
    Raises:
        HTTPException: Если размер файла превышает максимальный
    """
    file_size = len(content)
    
    if file_size > max_size:
        logger.warning(
            f"Файл превышает максимальный размер",
            extra={"file_size_bytes": file_size, "max_size_bytes": max_size}
        )
        raise HTTPException(
            status_code=400,
            detail=f"Размер файла превышает максимально допустимый ({max_size / 1024 / 1024:.0f}MB). "
                   f"Размер загружаемого файла: {file_size / 1024 / 1024:.2f}MB"
        )


def create_temp_file(content: bytes, suffix: str = ".xlsx") -> str:
    """
    Создание временного файла
    
    Args:
        content: Содержимое файла
        suffix: Суффикс файла (по умолчанию .xlsx)
    
    Returns:
        str: Путь к созданному временному файлу
    """
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
        tmp_file.write(content)
        return tmp_file.name


def cleanup_temp_file(file_path: str) -> None:
    """
    Удаление временного файла
    
    Args:
        file_path: Путь к файлу для удаления
    """
    if file_path and os.path.exists(file_path):
        try:
            os.unlink(file_path)
            logger.debug(f"Временный файл удален: {file_path}")
        except Exception as e:
            logger.warning(f"Не удалось удалить временный файл: {file_path}", extra={"error": str(e)})

