# ✅ Исправление: ImportError: cannot import name 'UserOrganization'

## 🔴 Проблема

```
ImportError: cannot import name 'UserOrganization' from 'app.models'
```

**Причина:** В `app/models.py` используется таблица `user_organizations` (Table), а не модель `UserOrganization`. Это таблица связи many-to-many между пользователями и организациями.

---

## ✅ Решение

Исправлены импорты и использование в тестах:

### 1. test_organizations.py

**До:**
```python
from app.models import Organization, User, UserOrganization

# Назначаем организацию пользователю
user_org = UserOrganization(
    user_id=user.id,
    organization_id=test_organization.id
)
test_db.add(user_org)
test_db.commit()
```

**После:**
```python
from app.models import Organization, User, user_organizations

# Назначаем организацию пользователю через relationship
user.organizations.append(test_organization)
test_db.commit()
test_db.refresh(user)
```

### 2. test_vehicles.py

**До:**
```python
from app.models import Vehicle, Organization, UserOrganization
```

**После:**
```python
from app.models import Vehicle, Organization
```

---

## ✅ Как работает связь User-Organization

В `app/models.py` используется таблица связи:

```python
user_organizations = Table(
    'user_organizations',
    Base.metadata,
    Column('user_id', Integer, ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
    Column('organization_id', Integer, ForeignKey('organizations.id', ondelete='CASCADE'), primary_key=True),
    ...
)
```

И relationship в моделях:

```python
class User(Base):
    organizations = relationship("Organization", secondary=user_organizations, back_populates="users")

class Organization(Base):
    users = relationship("User", secondary=user_organizations, back_populates="organizations")
```

---

## ✅ Проверка

- ✅ Импорты исправлены
- ✅ Использование relationship вместо создания объекта
- ✅ Линтер не нашел ошибок

---

**Дата:** 2025-12-26  
**Статус:** ✅ Исправлено

