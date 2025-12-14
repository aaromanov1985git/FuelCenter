"""
Сервис для работы с организациями
Содержит бизнес-логику для работы с организациями
"""
from sqlalchemy.orm import Session
from typing import Optional, List, Tuple
from app.repositories.organization_repository import OrganizationRepository
from app.models import Organization, User
from app.logger import logger


class OrganizationService:
    """
    Сервис для работы с организациями
    Содержит бизнес-логику поверх репозитория
    """
    
    def __init__(self, db: Session):
        self.organization_repo = OrganizationRepository(db)
        self.db = db
    
    def get_organization(self, organization_id: int) -> Optional[Organization]:
        """
        Получение организации по ID
        """
        return self.organization_repo.get_by_id(organization_id)
    
    def get_organizations(
        self,
        skip: int = 0,
        limit: int = 100,
        is_active: Optional[bool] = None
    ) -> Tuple[List[Organization], int]:
        """
        Получение списка организаций с фильтрацией
        
        Returns:
            tuple: (список организаций, общее количество)
        """
        return self.organization_repo.get_all(
            skip=skip,
            limit=limit,
            is_active=is_active
        )
    
    def create_organization(
        self,
        name: str,
        code: str,
        description: Optional[str] = None,
        inn: Optional[str] = None,
        kpp: Optional[str] = None,
        ogrn: Optional[str] = None,
        legal_address: Optional[str] = None,
        actual_address: Optional[str] = None,
        phone: Optional[str] = None,
        email: Optional[str] = None,
        website: Optional[str] = None,
        contact_person: Optional[str] = None,
        contact_phone: Optional[str] = None,
        bank_name: Optional[str] = None,
        bank_account: Optional[str] = None,
        bank_bik: Optional[str] = None,
        bank_correspondent_account: Optional[str] = None,
        is_active: bool = True
    ) -> Organization:
        """
        Создание новой организации
        """
        # Проверяем уникальность кода
        existing = self.organization_repo.get_by_code(code)
        if existing:
            raise ValueError(f"Организация с кодом '{code}' уже существует")
        
        return self.organization_repo.create(
            name=name,
            code=code,
            description=description,
            inn=inn,
            kpp=kpp,
            ogrn=ogrn,
            legal_address=legal_address,
            actual_address=actual_address,
            phone=phone,
            email=email,
            website=website,
            contact_person=contact_person,
            contact_phone=contact_phone,
            bank_name=bank_name,
            bank_account=bank_account,
            bank_bik=bank_bik,
            bank_correspondent_account=bank_correspondent_account,
            is_active=is_active
        )
    
    def update_organization(
        self,
        organization_id: int,
        name: Optional[str] = None,
        code: Optional[str] = None,
        description: Optional[str] = None,
        inn: Optional[str] = None,
        kpp: Optional[str] = None,
        ogrn: Optional[str] = None,
        legal_address: Optional[str] = None,
        actual_address: Optional[str] = None,
        phone: Optional[str] = None,
        email: Optional[str] = None,
        website: Optional[str] = None,
        contact_person: Optional[str] = None,
        contact_phone: Optional[str] = None,
        bank_name: Optional[str] = None,
        bank_account: Optional[str] = None,
        bank_bik: Optional[str] = None,
        bank_correspondent_account: Optional[str] = None,
        is_active: Optional[bool] = None
    ) -> Optional[Organization]:
        """
        Обновление организации
        """
        # Если обновляется код, проверяем уникальность
        if code is not None:
            existing = self.organization_repo.get_by_code(code)
            if existing and existing.id != organization_id:
                raise ValueError(f"Организация с кодом '{code}' уже существует")
        
        return self.organization_repo.update(
            organization_id=organization_id,
            name=name,
            code=code,
            description=description,
            inn=inn,
            kpp=kpp,
            ogrn=ogrn,
            legal_address=legal_address,
            actual_address=actual_address,
            phone=phone,
            email=email,
            website=website,
            contact_person=contact_person,
            contact_phone=contact_phone,
            bank_name=bank_name,
            bank_account=bank_account,
            bank_bik=bank_bik,
            bank_correspondent_account=bank_correspondent_account,
            is_active=is_active
        )
    
    def delete_organization(self, organization_id: int) -> bool:
        """
        Удаление организации
        """
        return self.organization_repo.delete(organization_id)
    
    def assign_organizations_to_user(self, user_id: int, organization_ids: List[int]) -> bool:
        """
        Назначение организаций пользователю
        """
        return self.organization_repo.assign_to_user(user_id, organization_ids)
    
    def get_user_organizations(self, user_id: int) -> List[Organization]:
        """
        Получение списка организаций пользователя
        """
        return self.organization_repo.get_user_organizations(user_id)
