# ✅ Исправление: React не распознает проп `keyField`

## 🔴 Проблема

```
Warning: React does not recognize the `keyField` prop on a DOM element. 
If you intentionally want it to appear in the DOM as a custom attribute, 
spell it as lowercase `keyfield` instead. If you accidentally passed it 
from a parent component, remove it from the DOM element.
```

**Причина:** В `CardInfoSchedulesList.jsx` передавался проп `keyField="id"` в компонент `Table`, но компонент `Table` не принимает этот проп и передавал его дальше в DOM элемент через `{...props}`.

---

## ✅ Решение

Удален проп `keyField="id"` из `CardInfoSchedulesList.jsx`, так как компонент `Table` уже использует `row.id` для ключа автоматически.

### До:
```jsx
<Table
  columns={columns}
  data={tableData}
  keyField="id"  // ❌ Не поддерживается
/>
```

### После:
```jsx
<Table
  columns={columns}
  data={tableData}  // ✅ keyField удален
/>
```

---

## ✅ Как работает Table

Компонент `Table` автоматически использует `row.id` для ключа, если он существует, иначе использует `rowIndex`:

```jsx
// Table.jsx, строка 199
<tr
  key={row.id || rowIndex}  // ✅ Автоматическое определение ключа
  ...
>
```

---

## ✅ Проверка

Проверены все файлы на наличие `keyField`:
- ✅ `CardInfoSchedulesList.jsx` — исправлено
- ✅ Других использований `keyField` не найдено

---

**Дата:** 2025-12-26  
**Статус:** ✅ Исправлено

