"""
Роутер для работы с организациями
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.auth import get_current_active_user, require_admin
from app.models import User
from app.schemas import (
    OrganizationCreate,
    OrganizationUpdate,
    OrganizationResponse,
    OrganizationListResponse,
    UserOrganizationAssign
)
from app.services.organization_service import OrganizationService
from app.logger import logger
from app.services.logging_service import logging_service

router = APIRouter(prefix="/api/v1/organizations", tags=["organizations"])


@router.get("", response_model=OrganizationListResponse)
async def get_organizations(
    skip: int = Query(0, ge=0, description="Количество пропущенных записей"),
    limit: int = Query(100, ge=1, le=1000, description="Максимальное количество записей"),
    is_active: Optional[bool] = Query(None, description="Фильтр по активности"),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_active_user)
):
    """
    Получение списка организаций
    """
    try:
        service = OrganizationService(db)
        organizations, total = service.get_organizations(
            skip=skip,
            limit=limit,
            is_active=is_active
        )
        
        return OrganizationListResponse(
            total=total,
            items=[OrganizationResponse.model_validate(org) for org in organizations]
        )
    except Exception as e:
        logger.error(f"Ошибка при получении списка организаций: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при получении списка организаций: {str(e)}"
        )


@router.get("/{organization_id}", response_model=OrganizationResponse)
async def get_organization(
    organization_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_active_user)
):
    """
    Получение организации по ID
    """
    try:
        service = OrganizationService(db)
        organization = service.get_organization(organization_id)
        
        if not organization:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Организация с ID {organization_id} не найдена"
            )
        
        return OrganizationResponse.model_validate(organization)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка при получении организации: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при получении организации: {str(e)}"
        )


@router.post("", response_model=OrganizationResponse, status_code=status.HTTP_201_CREATED)
async def create_organization(
    organization: OrganizationCreate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_admin)
):
    """
    Создание новой организации (только для администраторов)
    """
    try:
        service = OrganizationService(db)
        new_organization = service.create_organization(
            name=organization.name,
            code=organization.code,
            description=organization.description,
            inn=organization.inn,
            kpp=organization.kpp,
            ogrn=organization.ogrn,
            legal_address=organization.legal_address,
            actual_address=organization.actual_address,
            phone=organization.phone,
            email=organization.email,
            website=organization.website,
            contact_person=organization.contact_person,
            contact_phone=organization.contact_phone,
            bank_name=organization.bank_name,
            bank_account=organization.bank_account,
            bank_bik=organization.bank_bik,
            bank_correspondent_account=organization.bank_correspondent_account,
            is_active=organization.is_active if organization.is_active is not None else True
        )
        
        logger.info(f"Создана организация: {new_organization.name} (ID: {new_organization.id})")
        
        # Логируем действие пользователя
        if current_user:
            try:
                logging_service.log_user_action(
                    db=db,
                    user_id=current_user.id,
                    username=current_user.username,
                    action_type="create",
                    action_description=f"Создана организация: {new_organization.name}",
                    action_category="organization",
                    entity_type="Organization",
                    entity_id=new_organization.id,
                    status="success"
                )
            except Exception as e:
                logger.error(f"Ошибка при логировании действия пользователя: {e}", exc_info=True)
        
        return OrganizationResponse.model_validate(new_organization)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Ошибка при создании организации: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при создании организации: {str(e)}"
        )


@router.put("/{organization_id}", response_model=OrganizationResponse)
async def update_organization(
    organization_id: int,
    organization: OrganizationUpdate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_admin)
):
    """
    Обновление организации (только для администраторов)
    """
    try:
        service = OrganizationService(db)
        updated_organization = service.update_organization(
            organization_id=organization_id,
            name=organization.name,
            code=organization.code,
            description=organization.description,
            inn=organization.inn,
            kpp=organization.kpp,
            ogrn=organization.ogrn,
            legal_address=organization.legal_address,
            actual_address=organization.actual_address,
            phone=organization.phone,
            email=organization.email,
            website=organization.website,
            contact_person=organization.contact_person,
            contact_phone=organization.contact_phone,
            bank_name=organization.bank_name,
            bank_account=organization.bank_account,
            bank_bik=organization.bank_bik,
            bank_correspondent_account=organization.bank_correspondent_account,
            is_active=organization.is_active
        )
        
        if not updated_organization:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Организация с ID {organization_id} не найдена"
            )
        
        logger.info(f"Обновлена организация: {updated_organization.name} (ID: {updated_organization.id})")
        
        # Логируем действие пользователя
        if current_user:
            try:
                logging_service.log_user_action(
                    db=db,
                    user_id=current_user.id,
                    username=current_user.username,
                    action_type="update",
                    action_description=f"Обновлена организация: {updated_organization.name}",
                    action_category="organization",
                    entity_type="Organization",
                    entity_id=updated_organization.id,
                    status="success"
                )
            except Exception as e:
                logger.error(f"Ошибка при логировании действия пользователя: {e}", exc_info=True)
        
        return OrganizationResponse.model_validate(updated_organization)
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Ошибка при обновлении организации: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при обновлении организации: {str(e)}"
        )


@router.delete("/{organization_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_organization(
    organization_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_admin)
):
    """
    Удаление организации (только для администраторов)
    """
    try:
        service = OrganizationService(db)
        success = service.delete_organization(organization_id)
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Организация с ID {organization_id} не найдена"
            )
        
        logger.info(f"Удалена организация с ID: {organization_id}")
        
        # Логируем действие пользователя
        if current_user:
            try:
                logging_service.log_user_action(
                    db=db,
                    user_id=current_user.id,
                    username=current_user.username,
                    action_type="delete",
                    action_description=f"Удалена организация с ID: {organization_id}",
                    action_category="organization",
                    entity_type="Organization",
                    entity_id=organization_id,
                    status="success"
                )
            except Exception as e:
                logger.error(f"Ошибка при логировании действия пользователя: {e}", exc_info=True)
        
        return None
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка при удалении организации: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при удалении организации: {str(e)}"
        )


@router.post("/assign", status_code=status.HTTP_200_OK)
async def assign_organizations_to_user(
    assignment: UserOrganizationAssign,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(require_admin)
):
    """
    Назначение организаций пользователю (только для администраторов)
    """
    try:
        service = OrganizationService(db)
        success = service.assign_organizations_to_user(
            user_id=assignment.user_id,
            organization_ids=assignment.organization_ids
        )
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Пользователь с ID {assignment.user_id} не найден"
            )
        
        logger.info(f"Назначены организации пользователю ID: {assignment.user_id}")
        
        # Логируем действие пользователя
        if current_user:
            try:
                logging_service.log_user_action(
                    db=db,
                    user_id=current_user.id,
                    username=current_user.username,
                    action_type="assign",
                    action_description=f"Назначены организации пользователю ID: {assignment.user_id}",
                    action_category="organization",
                    entity_type="User",
                    entity_id=assignment.user_id,
                    status="success",
                    extra_data={"organization_ids": assignment.organization_ids}
                )
            except Exception as e:
                logger.error(f"Ошибка при логировании действия пользователя: {e}", exc_info=True)
        
        return {"success": True, "message": "Организации успешно назначены пользователю"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка при назначении организаций: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при назначении организаций: {str(e)}"
        )


@router.get("/user/{user_id}/organizations", response_model=OrganizationListResponse)
async def get_user_organizations(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_active_user)
):
    """
    Получение списка организаций пользователя
    """
    try:
        service = OrganizationService(db)
        organizations = service.get_user_organizations(user_id)
        
        return OrganizationListResponse(
            total=len(organizations),
            items=[OrganizationResponse.model_validate(org) for org in organizations]
        )
    except Exception as e:
        logger.error(f"Ошибка при получении организаций пользователя: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при получении организаций пользователя: {str(e)}"
        )
