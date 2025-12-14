"""
Сервис для работы с автозаправочными станциями (АЗС)
Содержит бизнес-логику для работы с АЗС
"""
import re
from sqlalchemy.orm import Session
from typing import Optional, List, Tuple
from rapidfuzz import fuzz
from app.repositories.gas_station_repository import GasStationRepository
from app.models import GasStation, Transaction
from app.validators import validate_gas_station_data
from app.logger import logger


class GasStationService:
    """
    Сервис для работы с АЗС
    Содержит бизнес-логику поверх репозитория
    """
    
    def __init__(self, db: Session):
        self.gas_station_repo = GasStationRepository(db)
        self.db = db
    
    def get_gas_station(self, gas_station_id: int) -> Optional[GasStation]:
        """
        Получение АЗС по ID
        """
        return self.gas_station_repo.get_by_id(gas_station_id)
    
    def get_gas_stations(
        self,
        skip: int = 0,
        limit: int = 100,
        is_validated: Optional[str] = None
    ) -> Tuple[List[GasStation], int]:
        """
        Получение списка АЗС с фильтрацией
        
        Returns:
            tuple: (список АЗС, общее количество)
        """
        return self.gas_station_repo.get_all(
            skip=skip,
            limit=limit,
            is_validated=is_validated
        )
    
    def update_gas_station(
        self,
        gas_station_id: int,
        original_name: Optional[str] = None,
        provider_id: Optional[int] = None,
        azs_number: Optional[str] = None,
        location: Optional[str] = None,
        region: Optional[str] = None,
        settlement: Optional[str] = None,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        is_validated: Optional[str] = None
    ) -> Optional[GasStation]:
        """
        Обновление данных АЗС с валидацией
        
        Returns:
            GasStation: обновленная АЗС или None если не найдено
        """
        gas_station = self.gas_station_repo.get_by_id(gas_station_id)
        if not gas_station:
            return None
        
        # original_name нельзя изменять - это поле только для чтения
        # Оно устанавливается только при создании записи из загружаемых файлов
        # Игнорируем попытки изменения original_name при обновлении
        # if original_name is not None:
        #     gas_station.original_name = original_name
        if provider_id is not None:
            gas_station.provider_id = provider_id
        if azs_number is not None:
            gas_station.azs_number = azs_number
        if location is not None:
            gas_station.location = location
        if region is not None:
            gas_station.region = region
        if settlement is not None:
            gas_station.settlement = settlement
        if latitude is not None:
            gas_station.latitude = latitude
        if longitude is not None:
            gas_station.longitude = longitude
        if is_validated is not None:
            gas_station.is_validated = is_validated
        
        # Валидация при обновлении
        validation_result = validate_gas_station_data(
            azs_number=gas_station.azs_number,
            location=gas_station.location,
            region=gas_station.region,
            settlement=gas_station.settlement
        )
        
        if validation_result["errors"]:
            gas_station.is_validated = "invalid"
            gas_station.validation_errors = "; ".join(validation_result["errors"])
        elif validation_result["warnings"]:
            gas_station.is_validated = "pending"
            gas_station.validation_errors = None
        else:
            gas_station.is_validated = "valid"
            gas_station.validation_errors = None
        
        self.db.commit()
        self.db.refresh(gas_station)
        
        logger.info("АЗС обновлена", extra={"gas_station_id": gas_station_id})
        
        return gas_station
    
    def get_stats_summary(self) -> dict:
        """
        Получение статистики по АЗС

        Returns:
            dict: статистика по статусам валидации
        """
        total = self.db.query(GasStation).count()
        valid = self.db.query(GasStation).filter(GasStation.is_validated == "valid").count()
        invalid = self.db.query(GasStation).filter(GasStation.is_validated == "invalid").count()
        pending = self.db.query(GasStation).filter(GasStation.is_validated == "pending").count()

        return {
            "total": total,
            "valid": valid,
            "invalid": invalid,
            "pending": pending
        }

    def get_or_create_gas_station(
        self,
        original_name: str,
        azs_number: Optional[str] = None,
        location: Optional[str] = None,
        region: Optional[str] = None,
        settlement: Optional[str] = None,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None
    ) -> Tuple[GasStation, List[str]]:
        """
        Получить или создать автозаправочную станцию в справочнике

        Использует нормализацию для поиска дублей и fuzzy matching для похожих записей.
        Возвращает АЗС и список предупреждений.

        Args:
            original_name: Исходное название АЗС
            azs_number: Номер АЗС (опционально)
            location: Местоположение (опционально)
            region: Регион (опционально)
            settlement: Населенный пункт (опционально)

        Returns:
            Tuple[GasStation, List[str]]: АЗС и список предупреждений

        Examples:
            >>> gas_station_service = GasStationService(db)
            >>> station, warnings = gas_station_service.get_or_create_gas_station("АЗС №123", azs_number="123")
            >>> print(f"Station: {station.original_name}, Warnings: {warnings}")
        """
        warnings = []

        # Нормализуем название для поиска (убираем лишние пробелы, приводим к нижнему регистру)
        normalized_name = re.sub(r'\s+', ' ', original_name.strip()).lower()

        # Сначала ищем по точному совпадению исходного названия
        gas_station = self.db.query(GasStation).filter(GasStation.original_name == original_name).first()

        # Если не найдено, ищем по нормализованному названию
        if not gas_station:
            all_gas_stations = self.db.query(GasStation).all()
            for gs in all_gas_stations:
                if re.sub(r'\s+', ' ', gs.original_name.strip()).lower() == normalized_name:
                    gas_station = gs
                    break

        # Если не найдено по названию и есть номер АЗС, ищем по номеру АЗС
        # Это помогает найти ту же АЗС, даже если original_name был изменен вручную
        if not gas_station and azs_number and azs_number.strip():
            gas_station = self.db.query(GasStation).filter(GasStation.azs_number == azs_number.strip()).first()
            if gas_station:
                # Если нашли по номеру, но название не совпадает - предупреждаем
                if gas_station.original_name != original_name:
                    warnings.append(
                        f"АЗС найдена по номеру '{azs_number}', но название в файле '{original_name}' "
                        f"отличается от сохраненного '{gas_station.original_name}'. "
                        f"Будет использована существующая запись."
                    )

        # Если все еще не найдено, проверяем на похожие записи
        if not gas_station:
            similar_gas_stations = []
            all_gas_stations = self.db.query(GasStation).all()
            for gs in all_gas_stations:
                score = fuzz.ratio(normalized_name, re.sub(r'\s+', ' ', gs.original_name.strip()).lower())
                if score >= 85:
                    similar_gas_stations.append((gs, score))

            similar_gas_stations.sort(key=lambda x: x[1], reverse=True)

            if similar_gas_stations:
                # Берем самую похожую запись, если схожесть >= 95%
                best_match, score = similar_gas_stations[0]
                if score >= 95:
                    gas_station = best_match
                    warnings.append(
                        f"АЗС '{original_name}' объединена с существующей '{best_match.original_name}' "
                        f"(схожесть: {score}%)"
                    )
                elif score >= 85:
                    # Предупреждаем о возможном дубле
                    warnings.append(
                        f"Возможный дубль АЗС: найдена похожая запись '{best_match.original_name}' "
                        f"(схожесть: {score}%). Проверьте вручную."
                    )

        if not gas_station:
            # Создаем новую АЗС
            gas_station = GasStation(
                original_name=original_name,
                azs_number=azs_number,
                location=location,
                region=region,
                settlement=settlement,
                latitude=latitude,
                longitude=longitude,
                is_validated="pending"
            )
            self.db.add(gas_station)
            self.db.flush()
        else:
            # Обновляем данные, если они были пустыми
            updated = False
            if not gas_station.azs_number and azs_number:
                gas_station.azs_number = azs_number
                updated = True
            if not gas_station.location and location:
                gas_station.location = location
                updated = True
            if not gas_station.region and region:
                gas_station.region = region
                updated = True
            if not gas_station.settlement and settlement:
                gas_station.settlement = settlement
                updated = True
            if gas_station.latitude is None and latitude is not None:
                gas_station.latitude = latitude
                updated = True
            if gas_station.longitude is None and longitude is not None:
                gas_station.longitude = longitude
                updated = True

            if updated:
                self.db.flush()

        # Валидация данных
        validation_result = validate_gas_station_data(
            azs_number=gas_station.azs_number,
            location=gas_station.location,
            region=gas_station.region,
            settlement=gas_station.settlement
        )

        if validation_result["errors"]:
            gas_station.is_validated = "invalid"
            gas_station.validation_errors = "; ".join(validation_result["errors"])
            warnings.extend([f"АЗС '{original_name}': {err}" for err in validation_result["errors"]])
        elif validation_result["warnings"]:
            gas_station.is_validated = "pending"
            warnings.extend([f"АЗС '{original_name}': {warn}" for warn in validation_result["warnings"]])
        else:
            gas_station.is_validated = "valid"
            gas_station.validation_errors = None

        return gas_station, warnings

