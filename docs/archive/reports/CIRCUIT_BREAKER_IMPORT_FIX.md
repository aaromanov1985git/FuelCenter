# ✅ Исправление: name 'get_circuit_breaker' is not defined

## 🔴 Проблема

```
name 'get_circuit_breaker' is not defined
```

**Причина:** В `api_provider_service.py` использовалась функция `get_circuit_breaker`, но она не была импортирована.

---

## ✅ Решение

Добавлен импорт `get_circuit_breaker` в `backend/app/services/api_provider_service.py`:

### До:
```python
from datetime import datetime, timezone, date, timedelta
from decimal import Decimal
from typing import Optional, List, Dict, Any
import httpx
import hashlib
import base64
import json
import xml.etree.ElementTree as ET
from sqlalchemy.orm import Session
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from app.logger import logger
from app.models import Provider, ProviderTemplate
```

### После:
```python
from datetime import datetime, timezone, date, timedelta
from decimal import Decimal
from typing import Optional, List, Dict, Any
import httpx
import hashlib
import base64
import json
import xml.etree.ElementTree as ET
from sqlalchemy.orm import Session
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from app.logger import logger
from app.models import Provider, ProviderTemplate
from app.utils.circuit_breaker import get_circuit_breaker  # ✅ Добавлен импорт
```

---

## ✅ Использование get_circuit_breaker

Функция используется в трех местах:

1. **PetrolPlusAdapter** (строка 37):
```python
self.circuit_breaker = get_circuit_breaker(
    "petrolplus_api",
    failure_threshold=5,
    recovery_timeout=60,
    expected_exception=(httpx.RequestError, httpx.HTTPStatusError)
)
```

2. **WebAdapter** (строка 359):
```python
self.circuit_breaker = get_circuit_breaker(
    "web_api",
    failure_threshold=5,
    recovery_timeout=60,
    expected_exception=(httpx.RequestError, httpx.HTTPStatusError)
)
```

3. **RnCardAdapter** (строка 3039):
```python
self.circuit_breaker = get_circuit_breaker(
    "rncard_api",
    failure_threshold=5,
    recovery_timeout=60,
    expected_exception=(httpx.RequestError, httpx.HTTPStatusError)
)
```

---

## ✅ Проверка

- ✅ Импорт добавлен
- ✅ Все три использования проверены
- ✅ Линтер не нашел ошибок

---

**Дата:** 2025-12-26  
**Статус:** ✅ Исправлено

