# Стандарты дизайна проекта GSM

**Дата:** 2025-01-27  
**Версия:** 1.0  
**Статус:** ✅ Актуально

---

## 📋 Содержание

1. [Система отступов и размеров](#система-отступов-и-размеров)
2. [Цветовая система](#цветовая-система)
3. [Типографика](#типографика)
4. [Компоненты UI](#компоненты-ui)
5. [Модальные окна и подтверждения](#модальные-окна-и-подтверждения)
6. [Таблицы](#таблицы)
7. [Формы и инпуты](#формы-и-инпуты)
8. [Кнопки](#кнопки)
9. [Статусные индикаторы](#статусные-индикаторы)
10. [Адаптивность](#адаптивность)

---

## 📏 Система отступов и размеров

### Базовые единицы

Проект использует **8px grid system** для всех отступов и размеров.

- **Базовый размер:** `8px`
- **Множители:** `1x`, `2x`, `3x`, `4x`, `6x`, `8x`
- **Значения:** `8px`, `16px`, `24px`, `32px`, `48px`, `64px`

### Стандартные отступы

```css
/* Отступы между секциями */
--spacing-section: 32px;        /* 4x = 32px */
--spacing-block: 24px;           /* 3x = 24px */
--spacing-element: 16px;         /* 2x = 16px */
--spacing-small: 8px;            /* 1x = 8px */
--spacing-tiny: 4px;             /* 0.5x = 4px */

/* Внутренние отступы компонентов */
--padding-card: 24px;             /* 3x = 24px */
--padding-section: 20px;         /* 2.5x = 20px */
--padding-element: 16px;          /* 2x = 16px */
--padding-small: 12px;            /* 1.5x = 12px */
--padding-tiny: 8px;              /* 1x = 8px */
```

### Радиусы скругления

```css
--radius-small: 6px;              /* Маленькие элементы (кнопки, инпуты) */
--radius-medium: 8px;             /* Средние элементы (карточки) */
--radius-large: 12px;             /* Большие элементы (модальные окна) */
--radius-badge: 12px;             /* Бейджи статусов */
```

### Тени

```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
--shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
--shadow-lg: 0 10px 25px rgba(0, 0, 0, 0.1);
--shadow-xl: 0 20px 40px rgba(0, 0, 0, 0.15);
```

---

## 🎨 Цветовая система

### Обязательное использование CSS переменных

**❌ Запрещено:**
```css
/* Хардкод цветов */
background: #ffffff;
color: #111827;
border: 1px solid #d1d5db;
```

**✅ Разрешено:**
```css
/* CSS переменные */
background: var(--color-bg-card);
color: var(--color-text-primary);
border: 1px solid var(--color-border-light);
```

### Доступные CSS переменные

Все цвета определены в `src/index.css` и автоматически адаптируются к темам:

#### Фоны
- `--color-bg-primary` - основной фон страницы
- `--color-bg-secondary` - вторичный фон (секции, ховер)
- `--color-bg-card` - фон карточек и модальных окон
- `--color-bg-hover` - фон при наведении

#### Текст
- `--color-text-primary` - основной текст
- `--color-text-secondary` - второстепенный текст
- `--color-text-tertiary` - третичный текст (подсказки)

#### Границы
- `--color-border` - основная граница
- `--color-border-light` - светлая граница

#### Акцентные цвета
- `--color-primary` - основной акцентный цвет
- `--color-primary-hover` - акцентный цвет при наведении
- `--color-primary-light` - светлый акцентный цвет (фон)

#### Статусные цвета
- `--color-success` - успех
- `--color-success-light` - светлый фон успеха
- `--color-success-dark` - темный оттенок успеха
- `--color-error` - ошибка
- `--color-error-light` - светлый фон ошибки
- `--color-error-dark` - темный оттенок ошибки
- `--color-warning` - предупреждение
- `--color-warning-light` - светлый фон предупреждения
- `--color-info` - информация
- `--color-info-light` - светлый фон информации

---

## 📝 Типографика

### Размеры шрифтов

```css
--font-size-xs: 0.75rem;         /* 12px - мелкий текст */
--font-size-sm: 0.875rem;          /* 14px - маленький текст */
--font-size-base: 1rem;           /* 16px - базовый текст */
--font-size-lg: 1.125rem;          /* 18px - большой текст */
--font-size-xl: 1.5rem;            /* 24px - заголовки секций */
--font-size-2xl: 2rem;             /* 32px - главные заголовки */
```

### Веса шрифтов

```css
--font-weight-normal: 500;        /* Обычный текст */
--font-weight-semibold: 600;      /* Акцентный текст */
--font-weight-bold: 700;           /* Заголовки */
```

### Высота строк

```css
--line-height-tight: 1.2;         /* Заголовки */
--line-height-normal: 1.5;         /* Обычный текст */
--line-height-relaxed: 1.75;      /* Длинный текст */
```

---

## 🧩 Компоненты UI

### Карточки (Cards)

```css
.card {
  background: var(--color-bg-card);
  border-radius: var(--radius-medium);
  padding: var(--padding-card);
  box-shadow: var(--shadow-lg);
  margin-bottom: var(--spacing-block);
}
```

**Стандартные отступы:**
- Внутренний отступ: `24px` (`--padding-card`)
- Внешний отступ снизу: `24px` (`--spacing-block`)
- Радиус скругления: `8px` (`--radius-medium`)

### Секции (Sections)

```css
.section {
  margin-bottom: var(--spacing-section);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-element);
  flex-wrap: wrap;
  gap: var(--spacing-element);
}
```

**Стандартные отступы:**
- Отступ между секциями: `32px` (`--spacing-section`)
- Отступ заголовка: `16px` (`--spacing-element`)

---

## 🪟 Модальные окна и подтверждения

### Обязательное использование компонента ConfirmModal

**❌ Запрещено:**
```javascript
// Использование window.confirm()
if (window.confirm('Вы уверены?')) {
  // действие
}
```

**✅ Разрешено:**
```javascript
// Использование компонента ConfirmModal
<ConfirmModal
  isOpen={showConfirm}
  title="Подтверждение действия"
  message="Вы уверены, что хотите выполнить это действие?"
  onConfirm={handleConfirm}
  onCancel={() => setShowConfirm(false)}
  confirmText="Подтвердить"
  cancelText="Отмена"
  variant="danger" // или "warning", "info"
/>
```

### Стандартные размеры модальных окон

- **Ширина:** `500px` (маленькие), `600px` (средние), `800px` (большие)
- **Максимальная ширина:** `90vw` (на мобильных)
- **Отступы:** `24px` (`--padding-card`)
- **Радиус:** `12px` (`--radius-large`)

### Структура модального окна

```css
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--color-bg-card);
  border-radius: var(--radius-large);
  padding: var(--padding-card);
  max-width: 500px;
  width: 90vw;
  box-shadow: var(--shadow-xl);
}
```

---

## 📊 Таблицы

### Стандартные стили таблиц

```css
.table-wrapper {
  background: var(--color-bg-card);
  border-radius: var(--radius-medium);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  overflow-x: auto;
}

.table {
  width: 100%;
  border-collapse: collapse;
  min-width: 800px;
}

.table thead {
  background: var(--color-bg-hover);
}

.table th {
  padding: 12px 16px;
  text-align: left;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 2px solid var(--color-border-light);
}

.table td {
  padding: 12px 16px;
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  font-weight: var(--font-weight-normal);
  border-bottom: 1px solid var(--color-border);
}

.table tbody tr:hover {
  background: var(--color-bg-secondary);
}
```

**Стандартные отступы:**
- Padding ячеек: `12px 16px`
- Минимальная ширина таблицы: `800px`
- Отступ между строками: граница `1px`

---

## 📝 Формы и инпуты

### Стандартные стили инпутов

```css
.input {
  padding: 10px 16px;
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-small);
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  font-weight: var(--font-weight-normal);
  background: var(--color-bg-card);
  width: 100%;
  transition: all 0.2s;
}

.input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-light);
}
```

**Стандартные размеры:**
- Padding: `10px 16px`
- Радиус: `6px` (`--radius-small`)
- Размер шрифта: `14px` (`--font-size-sm`)

### Селекты (Select)

Используют те же стили, что и инпуты:

```css
.select {
  /* Те же стили, что и .input */
  cursor: pointer;
}
```

---

## 🔘 Кнопки

### Размеры кнопок

```css
/* Маленькая кнопка */
.btn-small {
  padding: 6px 12px;
  font-size: var(--font-size-xs);
}

/* Средняя кнопка (по умолчанию) */
.btn {
  padding: 12px 24px;
  font-size: var(--font-size-sm);
}

/* Большая кнопка */
.btn-large {
  padding: 16px 32px;
  font-size: var(--font-size-base);
}
```

### Типы кнопок

```css
/* Основная кнопка */
.btn-primary {
  background: var(--color-primary);
  color: var(--color-bg-card);
  border: none;
  border-radius: var(--radius-small);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  transition: background 0.2s;
}

.btn-primary:hover {
  background: var(--color-primary-hover);
}

/* Кнопка успеха */
.btn-success {
  background: var(--color-success);
  color: var(--color-bg-card);
}

.btn-success:hover {
  background: var(--color-success-dark);
}

/* Кнопка опасности */
.btn-danger {
  background: var(--color-error);
  color: var(--color-bg-card);
}

.btn-danger:hover {
  background: var(--color-error-dark);
}

/* Вторичная кнопка */
.btn-secondary {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border-light);
}

.btn-secondary:hover {
  background: var(--color-bg-hover);
}

/* Отключенная кнопка */
.btn:disabled {
  background: var(--color-text-tertiary);
  cursor: not-allowed;
  opacity: 0.6;
}
```

**Стандартные отступы:**
- Средняя кнопка: `12px 24px`
- Радиус: `6px` (`--radius-small`)
- Размер шрифта: `14px` (`--font-size-sm`)

### Группы кнопок

```css
.button-group {
  display: flex;
  gap: var(--spacing-small);
  align-items: center;
}
```

**Стандартный отступ между кнопками:** `8px` (`--spacing-small`)

---

## 🏷️ Статусные индикаторы

### Бейджи статусов

```css
.badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: var(--radius-badge);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
}

.badge-success {
  background: var(--color-success-light);
  color: var(--color-success-dark);
}

.badge-error {
  background: var(--color-error-light);
  color: var(--color-error-dark);
}

.badge-warning {
  background: var(--color-warning-light);
  color: var(--color-warning);
}

.badge-info {
  background: var(--color-info-light);
  color: var(--color-info);
}

.badge-pending {
  background: var(--color-warning-light);
  color: var(--color-warning);
}

.badge-active {
  background: var(--color-success-light);
  color: var(--color-success-dark);
}

.badge-inactive {
  background: var(--color-error-light);
  color: var(--color-error-dark);
}
```

**Стандартные размеры:**
- Padding: `4px 12px`
- Радиус: `12px` (`--radius-badge`)
- Размер шрифта: `12px` (`--font-size-xs`)

### Сообщения об ошибках и успехе

```css
.message-error {
  padding: var(--padding-small);
  background: var(--color-error-light);
  color: var(--color-error-dark);
  font-weight: var(--font-weight-semibold);
  border-radius: var(--radius-small);
  border: 1px solid var(--color-error);
  margin-bottom: var(--spacing-element);
}

.message-success {
  padding: var(--padding-small);
  background: var(--color-success-light);
  color: var(--color-success-dark);
  font-weight: var(--font-weight-semibold);
  border-radius: var(--radius-small);
  border: 1px solid var(--color-success);
  margin-bottom: var(--spacing-element);
}
```

**Стандартные отступы:**
- Padding: `12px` (`--padding-small`)
- Отступ снизу: `16px` (`--spacing-element`)

---

## 📱 Адаптивность

### Breakpoints

```css
/* Мобильные устройства */
@media (max-width: 768px) {
  .container {
    padding: var(--spacing-element);
  }
  
  .section-header {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .table-wrapper {
    overflow-x: scroll;
  }
}

/* Планшеты */
@media (max-width: 1024px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
  }
}
```

### Адаптивные отступы

На мобильных устройствах отступы уменьшаются:
- Секции: `24px` вместо `32px`
- Блоки: `16px` вместо `24px`
- Элементы: `12px` вместо `16px`

---

## ✅ Чеклист для проверки соответствия стандартам

### Цвета
- [ ] Все цвета используют CSS переменные
- [ ] Нет хардкод цветов (#ffffff, #111827 и т.д.)
- [ ] Компонент работает во всех темах

### Отступы
- [ ] Все отступы кратны 8px
- [ ] Используются стандартные переменные отступов
- [ ] Консистентные отступы между элементами

### Компоненты
- [ ] Модальные окна используют компонент ConfirmModal
- [ ] Нет window.confirm() или window.alert()
- [ ] Кнопки используют стандартные классы
- [ ] Таблицы используют стандартные стили

### Типографика
- [ ] Используются стандартные размеры шрифтов
- [ ] Консистентные веса шрифтов
- [ ] Правильная высота строк

### Адаптивность
- [ ] Компонент работает на мобильных устройствах
- [ ] Используются правильные breakpoints
- [ ] Отступы адаптируются на маленьких экранах

---

## 📚 Связанная документация

- [ПРАВИЛА_СТИЛИЗАЦИИ_И_ИМЕНОВАНИЯ.md](./ПРАВИЛА_СТИЛИЗАЦИИ_И_ИМЕНОВАНИЯ.md) - правила именования и стилизации
- [src/index.css](../src/index.css) - CSS переменные тем
- [src/components/ConfirmModal.jsx](../src/components/ConfirmModal.jsx) - компонент модального окна подтверждения

---

**Последнее обновление:** 2025-01-27  
**Версия:** 1.0
