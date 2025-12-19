"""
Репозитории для работы с данными
"""
from .vehicle_refuel_repository import VehicleRefuelRepository
from .vehicle_location_repository import VehicleLocationRepository
from .fuel_card_analysis_repository import FuelCardAnalysisRepository

__all__ = [
    "VehicleRefuelRepository",
    "VehicleLocationRepository",
    "FuelCardAnalysisRepository"
]
