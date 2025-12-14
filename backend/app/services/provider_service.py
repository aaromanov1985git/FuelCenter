"""
Сервис для работы с провайдерами
Содержит бизнес-логику для работы с провайдерами
"""
from sqlalchemy.orm import Session
from typing import Optional, List, Tuple
from app.models import Provider, ProviderTemplate
from app.logger import logger


class ProviderService:
    """
    Сервис для работы с провайдерами
    Содержит бизнес-логику для работы с провайдерами
    """
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_provider(self, provider_id: int) -> Optional[Provider]:
        """
        Получение провайдера по ID
        """
        return self.db.query(Provider).filter(Provider.id == provider_id).first()
    
    def get_providers(
        self,
        skip: int = 0,
        limit: int = 100,
        is_active: Optional[bool] = None
    ) -> Tuple[List[Provider], int]:
        """
        Получение списка провайдеров с фильтрацией
        
        Returns:
            tuple: (список провайдеров, общее количество)
        """
        query = self.db.query(Provider)
        
        if is_active is not None:
            query = query.filter(Provider.is_active == is_active)
        
        total = query.count()
        providers = query.offset(skip).limit(limit).all()
        
        return providers, total
    
    def create_provider(
        self,
        name: str,
        code: str,
        organization_id: Optional[int] = None,
        is_active: bool = True
    ) -> Provider:
        """
        Создание нового провайдера
        
        Raises:
            ValueError: если провайдер с таким кодом уже существует
        """
        # Проверяем уникальность кода
        existing = self.db.query(Provider).filter(Provider.code == code).first()
        if existing:
            raise ValueError("Провайдер с таким кодом уже существует")
        
        provider = Provider(
            name=name,
            code=code,
            organization_id=organization_id,
            is_active=is_active
        )
        self.db.add(provider)
        self.db.commit()
        self.db.refresh(provider)
        
        logger.info("Провайдер создан", extra={"provider_id": provider.id, "code": code, "organization_id": organization_id})
        
        return provider
    
    def update_provider(
        self,
        provider_id: int,
        name: Optional[str] = None,
        code: Optional[str] = None,
        organization_id: Optional[int] = None,
        is_active: Optional[bool] = None
    ) -> Optional[Provider]:
        """
        Обновление провайдера
        
        Raises:
            ValueError: если провайдер с таким кодом уже существует
        """
        provider = self.get_provider(provider_id)
        if not provider:
            return None
        
        if code is not None and code != provider.code:
            existing = self.db.query(Provider).filter(Provider.code == code).first()
            if existing:
                raise ValueError("Провайдер с таким кодом уже существует")
            provider.code = code
        
        if name is not None:
            provider.name = name
        if organization_id is not None:
            provider.organization_id = organization_id
        if is_active is not None:
            provider.is_active = is_active
        
        self.db.commit()
        self.db.refresh(provider)
        
        logger.info("Провайдер обновлен", extra={"provider_id": provider_id, "organization_id": organization_id})
        
        return provider
    
    def delete_provider(self, provider_id: int) -> bool:
        """
        Удаление провайдера
        
        Returns:
            bool: True если удалено, False если не найдено
        """
        provider = self.get_provider(provider_id)
        if not provider:
            return False
        
        self.db.delete(provider)
        self.db.commit()
        
        logger.info("Провайдер удален", extra={"provider_id": provider_id})
        
        return True
    
    def get_provider_templates(
        self,
        provider_id: int,
        skip: int = 0,
        limit: int = 100,
        is_active: Optional[bool] = None
    ) -> Tuple[List[ProviderTemplate], int]:
        """
        Получение списка шаблонов провайдера
        
        Returns:
            tuple: (список шаблонов, общее количество)
        """
        provider = self.get_provider(provider_id)
        if not provider:
            return [], 0
        
        query = self.db.query(ProviderTemplate).filter(ProviderTemplate.provider_id == provider_id)
        
        if is_active is not None:
            query = query.filter(ProviderTemplate.is_active == is_active)
        
        total = query.count()
        templates = query.offset(skip).limit(limit).all()
        
        return templates, total
