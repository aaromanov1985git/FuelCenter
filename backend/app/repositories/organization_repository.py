"""
Репозиторий для работы с организациями
"""
from sqlalchemy.orm import Session
from typing import Optional, List, Tuple
from app.models import Organization, User


class OrganizationRepository:
    """
    Репозиторий для работы с организациями
    Инкапсулирует логику доступа к данным
    """
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_by_id(self, organization_id: int) -> Optional[Organization]:
        """
        Получение организации по ID
        """
        return self.db.query(Organization).filter(Organization.id == organization_id).first()
    
    def get_by_code(self, code: str) -> Optional[Organization]:
        """
        Получение организации по коду
        """
        return self.db.query(Organization).filter(Organization.code == code).first()
    
    def get_all(
        self,
        skip: int = 0,
        limit: int = 100,
        is_active: Optional[bool] = None
    ) -> tuple[List[Organization], int]:
        """
        Получение списка организаций с фильтрацией
        
        Returns:
            tuple: (список организаций, общее количество)
        """
        query = self.db.query(Organization)
        
        if is_active is not None:
            query = query.filter(Organization.is_active == is_active)
        
        total = query.count()
        organizations = query.order_by(Organization.name.asc()).offset(skip).limit(limit).all()
        
        return organizations, total
    
    def create(
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
        organization = Organization(
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
        self.db.add(organization)
        self.db.commit()
        self.db.refresh(organization)
        return organization
    
    def update(
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
        organization = self.get_by_id(organization_id)
        if not organization:
            return None
        
        if name is not None:
            organization.name = name
        if code is not None:
            organization.code = code
        if description is not None:
            organization.description = description
        if inn is not None:
            organization.inn = inn
        if kpp is not None:
            organization.kpp = kpp
        if ogrn is not None:
            organization.ogrn = ogrn
        if legal_address is not None:
            organization.legal_address = legal_address
        if actual_address is not None:
            organization.actual_address = actual_address
        if phone is not None:
            organization.phone = phone
        if email is not None:
            organization.email = email
        if website is not None:
            organization.website = website
        if contact_person is not None:
            organization.contact_person = contact_person
        if contact_phone is not None:
            organization.contact_phone = contact_phone
        if bank_name is not None:
            organization.bank_name = bank_name
        if bank_account is not None:
            organization.bank_account = bank_account
        if bank_bik is not None:
            organization.bank_bik = bank_bik
        if bank_correspondent_account is not None:
            organization.bank_correspondent_account = bank_correspondent_account
        if is_active is not None:
            organization.is_active = is_active
        
        self.db.commit()
        self.db.refresh(organization)
        return organization
    
    def delete(self, organization_id: int) -> bool:
        """
        Удаление организации
        При удалении организации все связанные записи (vehicles, providers, fuel_cards, transactions)
        автоматически получат organization_id = NULL благодаря ondelete='SET NULL' в ForeignKey
        """
        organization = self.get_by_id(organization_id)
        if not organization:
            return False
        
        # Удаляем организацию - связанные записи автоматически обнулят organization_id
        # благодаря ondelete='SET NULL' в ForeignKey
        self.db.delete(organization)
        self.db.commit()
        return True
    
    def assign_to_user(self, user_id: int, organization_ids: List[int]) -> bool:
        """
        Назначение организаций пользователю
        """
        from app.models import User
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user:
            return False
        
        # Получаем организации
        organizations = self.db.query(Organization).filter(Organization.id.in_(organization_ids)).all()
        
        # Очищаем текущие связи и добавляем новые
        user.organizations = organizations
        self.db.commit()
        return True
    
    def get_user_organizations(self, user_id: int) -> List[Organization]:
        """
        Получение списка организаций пользователя
        """
        from app.models import User
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user:
            return []
        
        return list(user.organizations)
