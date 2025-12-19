"""
Утилиты для работы с геолокацией
"""
import math
from typing import Optional, Tuple
from decimal import Decimal


def calculate_distance_haversine(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float
) -> float:
    """
    Вычисляет расстояние между двумя точками на Земле в метрах
    Использует формулу гаверсинуса
    
    Args:
        lat1, lon1: координаты первой точки (широта, долгота)
        lat2, lon2: координаты второй точки (широта, долгота)
    
    Returns:
        Расстояние в метрах
    """
    if not all([lat1 is not None, lon1 is not None, lat2 is not None, lon2 is not None]):
        return float('inf')
    
    try:
        lat1 = float(lat1)
        lon1 = float(lon1)
        lat2 = float(lat2)
        lon2 = float(lon2)
    except (ValueError, TypeError):
        return float('inf')
    
    R = 6371000  # Радиус Земли в метрах
    
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    
    a = math.sin(delta_phi/2)**2 + \
        math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    
    distance = R * c
    return distance


def calculate_distance_with_accuracy(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
    accuracy1: Optional[float] = None,
    accuracy2: Optional[float] = None
) -> Tuple[float, float]:
    """
    Вычисляет расстояние между двумя точками с учетом точности определения местоположения
    
    Args:
        lat1, lon1: координаты первой точки
        lat2, lon2: координаты второй точки
        accuracy1: точность первой точки в метрах
        accuracy2: точность второй точки в метрах
    
    Returns:
        Tuple: (расстояние в метрах, эффективный радиус с учетом точности)
    """
    distance = calculate_distance_haversine(lat1, lon1, lat2, lon2)
    
    # Эффективный радиус с учетом точности
    effective_radius = 0
    if accuracy1:
        effective_radius += float(accuracy1)
    if accuracy2:
        effective_radius += float(accuracy2)
    
    return distance, effective_radius


def is_point_in_radius(
    center_lat: float,
    center_lon: float,
    point_lat: float,
    point_lon: float,
    radius_meters: float,
    point_accuracy: Optional[float] = None
) -> bool:
    """
    Проверяет, находится ли точка в радиусе от центра
    
    Args:
        center_lat, center_lon: координаты центра
        point_lat, point_lon: координаты точки
        radius_meters: радиус в метрах
        point_accuracy: точность определения местоположения точки в метрах
    
    Returns:
        True, если точка находится в радиусе (с учетом точности)
    """
    distance, effective_radius = calculate_distance_with_accuracy(
        center_lat, center_lon, point_lat, point_lon,
        accuracy2=point_accuracy
    )
    
    effective_radius_meters = radius_meters + effective_radius
    return distance <= effective_radius_meters


def validate_coordinates(latitude: Optional[float], longitude: Optional[float]) -> bool:
    """
    Проверяет валидность координат
    
    Args:
        latitude: широта (-90 до 90)
        longitude: долгота (-180 до 180)
    
    Returns:
        True, если координаты валидны
    """
    if latitude is None or longitude is None:
        return False
    
    try:
        lat = float(latitude)
        lon = float(longitude)
        return -90 <= lat <= 90 and -180 <= lon <= 180
    except (ValueError, TypeError):
        return False


def format_distance(distance_meters: float) -> str:
    """
    Форматирует расстояние для отображения
    
    Args:
        distance_meters: расстояние в метрах
    
    Returns:
        Отформатированная строка
    """
    if distance_meters < 1000:
        return f"{distance_meters:.0f} м"
    elif distance_meters < 10000:
        return f"{distance_meters / 1000:.2f} км"
    else:
        return f"{distance_meters / 1000:.1f} км"
