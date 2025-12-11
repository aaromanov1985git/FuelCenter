# План стандартизации проекта ГСМ

## 📋 Оглавление
- [Обзор](#обзор)
- [Структура проекта](#структура-проекта)
- [Библиотека UI компонентов](#библиотека-ui-компонентов)
- [Дизайн система](#дизайн-система)
- [План миграции](#план-миграции)
- [Чеклист выполнения](#чеклист-выполнения)

---

## 🎯 Обзор

**Цель:** Создать единую систему стандартизированных UI компонентов и дизайна для всего проекта.

**Преимущества:**
- ✅ Консистентность интерфейса
- ✅ Простота поддержки и расширения
- ✅ Переиспользование кода
- ✅ Улучшенная accessibility
- ✅ Единая документация

---

## 📁 Структура проекта

### Новая структура компонентов

```
src/
├── components/
│   ├── ui/                          # 🆕 Библиотека UI компонентов
│   │   ├── Button/
│   │   │   ├── Button.jsx
│   │   │   ├── Button.css
│   │   │   ├── Button.stories.jsx   # Storybook
│   │   │   └── index.js
│   │   ├── Input/
│   │   │   ├── Input.jsx
│   │   │   ├── Input.css
│   │   │   └── index.js
│   │   ├── Select/
│   │   ├── Checkbox/
│   │   ├── Radio/
│   │   ├── Card/
│   │   ├── Badge/
│   │   ├── Modal/
│   │   ├── Table/
│   │   ├── Form/
│   │   ├── Alert/
│   │   ├── Tooltip/
│   │   ├── Skeleton/
│   │   ├── Pagination/
│   │   └── index.js               # Экспорт всех компонентов
│   │
│   ├── layout/                    # Компоненты разметки
│   │   ├── Sidebar.jsx
│   │   ├── Header.jsx
│   │   └── PageLayout.jsx
│   │
│   ├── features/                  # Feature-specific компоненты
│   │   ├── Dashboard/
│   │   ├── VehiclesList/
│   │   ├── FuelCardsList/
│   │   └── GasStationsList/
│   │
│   └── shared/                    # Общие компоненты
│       ├── ThemeToggle.jsx
│       ├── MaskedInput.jsx
│       └── FileUpload.jsx
│
├── styles/
│   ├── index.css                  # Глобальные стили и переменные
│   ├── themes.css                 # 🆕 Темы (отдельный файл)
│   ├── animations.css             # 🆕 Анимации
│   └── utilities.css              # 🆕 Utility классы
│
├── hooks/                         # Custom hooks
│   ├── useFocusTrap.js           # 🆕
│   ├── useRipple.js              # 🆕
│   └── useForm.js                # 🆕
│
└── utils/
    └── a11y.js                    # 🆕 Accessibility helpers
```

---

## 🎨 Библиотека UI компонентов

### 1. Button Component

**API:**
```jsx
<Button
  variant="primary|secondary|success|error|warning|ghost"
  size="sm|md|lg"
  icon={<Icon />}
  iconPosition="left|right"
  disabled={false}
  loading={false}
  fullWidth={false}
  onClick={() => {}}
>
  Button Text
</Button>
```

**Варианты:**
- `primary` - основные действия (gradient background)
- `secondary` - вторичные действия
- `success` - успешные действия (зеленый)
- `error` - деструктивные действия (красный)
- `warning` - предупреждающие действия (желтый)
- `ghost` - прозрачная кнопка (только текст)

**Размеры:**
- `sm` - 32px высота, padding 8px 12px
- `md` - 40px высота, padding 10px 20px (default)
- `lg` - 48px высота, padding 12px 24px

**Особенности:**
- Ripple эффект при клике
- Spinner при loading
- Disabled состояние
- Поддержка иконок
- Full width опция

---

### 2. Input Component

**API:**
```jsx
<Input
  type="text|number|email|password|date|tel"
  label="Label"
  placeholder="Placeholder"
  value={value}
  onChange={handleChange}
  error="Error message"
  helperText="Helper text"
  disabled={false}
  required={false}
  icon={<Icon />}
  iconPosition="left|right"
  fullWidth={false}
/>
```

**Типы:**
- `text` - обычный текст
- `number` - числа
- `email` - email с валидацией
- `password` - пароль (с показом/скрытием)
- `date` - дата
- `tel` - телефон

**Состояния:**
- Default
- Focused (border + box-shadow)
- Error (красная граница)
- Disabled (opacity 0.6)
- Success (зеленая граница)

**Особенности:**
- Floating label
- Иконка внутри инпута
- Показать/скрыть пароль
- Встроенная валидация
- Helper text под инпутом

---

### 3. Select Component

**API:**
```jsx
<Select
  options={[
    { value: '1', label: 'Option 1' },
    { value: '2', label: 'Option 2' }
  ]}
  value={selectedValue}
  onChange={handleChange}
  label="Label"
  placeholder="Select..."
  error="Error message"
  disabled={false}
  searchable={false}
  multiple={false}
  clearable={false}
/>
```

**Особенности:**
- Custom dropdown styling
- Поиск внутри селекта (searchable)
- Multiple selection
- Clear button
- Keyboard navigation (↑↓ Enter Esc)
- Виртуализация для больших списков

---

### 4. Checkbox & Radio

**Checkbox API:**
```jsx
<Checkbox
  checked={isChecked}
  onChange={handleChange}
  label="Label text"
  disabled={false}
  indeterminate={false}
/>
```

**Radio API:**
```jsx
<RadioGroup value={selectedValue} onChange={handleChange}>
  <Radio value="1" label="Option 1" />
  <Radio value="2" label="Option 2" />
  <Radio value="3" label="Option 3" />
</RadioGroup>
```

**Особенности:**
- Custom styling (не нативный)
- Анимация checkmark
- Ripple эффект
- Disabled состояние
- Indeterminate для checkbox

---

### 5. Card Component

**API:**
```jsx
<Card
  variant="default|elevated|outlined"
  padding="sm|md|lg"
  hoverable={false}
  onClick={handleClick}
>
  <Card.Header>
    <Card.Title>Title</Card.Title>
    <Card.Actions>
      <Button>Action</Button>
    </Card.Actions>
  </Card.Header>
  <Card.Body>
    Content here
  </Card.Body>
  <Card.Footer>
    Footer content
  </Card.Footer>
</Card>
```

**Варианты:**
- `default` - обычная карточка
- `elevated` - с тенью
- `outlined` - только граница

**Особенности:**
- Составные компоненты (Header, Body, Footer)
- Hover эффект (translateY + shadow)
- Кликабельная карточка
- Разные размеры padding

---

### 6. Badge Component (Статусы)

**API:**
```jsx
<Badge
  variant="success|warning|error|info|neutral"
  size="sm|md|lg"
  icon={<Icon />}
  dot={false}
>
  Status Text
</Badge>
```

**Варианты:**
- `success` - зеленый (✓ Валидный)
- `warning` - желтый (⚠ На проверке)
- `error` - красный (✗ Ошибка)
- `info` - синий (ℹ Информация)
- `neutral` - серый (○ Нейтральный)

**Особенности:**
- Emoji иконки по умолчанию
- Custom иконки
- Точка-индикатор (dot)
- Анимация pulse для активных статусов

---

### 7. Modal Component

**API:**
```jsx
<Modal
  isOpen={isOpen}
  onClose={handleClose}
  title="Modal Title"
  size="sm|md|lg|xl|fullscreen"
  closeOnOverlayClick={true}
  closeOnEsc={true}
  showCloseButton={true}
>
  <Modal.Body>
    Content here
  </Modal.Body>
  <Modal.Footer>
    <Button onClick={handleClose}>Cancel</Button>
    <Button variant="primary">Save</Button>
  </Modal.Footer>
</Modal>
```

**Размеры:**
- `sm` - 400px
- `md` - 600px (default)
- `lg` - 800px
- `xl` - 1000px
- `fullscreen` - 100vh

**Особенности:**
- Focus trap (Tab циклится внутри модалки)
- Backdrop blur
- Анимация появления (fade + scale)
- Scroll lock на body
- Portal rendering
- ESC для закрытия

---

### 8. Table Component

**API:**
```jsx
<Table
  data={data}
  columns={[
    {
      key: 'id',
      header: 'ID',
      sortable: true,
      width: '100px',
      render: (value, row) => <strong>{value}</strong>
    },
    { key: 'name', header: 'Name', sortable: true },
    {
      key: 'actions',
      header: 'Actions',
      render: (value, row) => (
        <Button size="sm" onClick={() => edit(row)}>Edit</Button>
      )
    }
  ]}
  onSort={handleSort}
  sortBy="id"
  sortOrder="asc"
  hoverable={true}
  striped={false}
  stickyHeader={true}
  loading={false}
  emptyMessage="No data"
/>
```

**Особенности:**
- Сортировка колонок
- Sticky header
- Sticky первая колонка
- Custom render функции
- Hover эффект на строках
- Loading skeleton
- Empty state
- Responsive (карточки на мобильных)
- Виртуализация для больших таблиц (опционально)

---

### 9. Form Component

**API:**
```jsx
<Form
  initialValues={{ name: '', email: '' }}
  validationSchema={schema}
  onSubmit={handleSubmit}
>
  {({ values, errors, handleChange, handleSubmit, isSubmitting }) => (
    <form onSubmit={handleSubmit}>
      <Input
        name="name"
        label="Name"
        value={values.name}
        onChange={handleChange}
        error={errors.name}
        required
      />
      <Input
        type="email"
        name="email"
        label="Email"
        value={values.email}
        onChange={handleChange}
        error={errors.email}
        required
      />
      <Button type="submit" loading={isSubmitting}>
        Submit
      </Button>
    </form>
  )}
</Form>
```

**Особенности:**
- Встроенная валидация (Yup/Zod)
- Управление состоянием формы
- Автосохранение (debounced)
- Dirty state tracking
- Submit handling
- Error display
- Reset функция

---

### 10. Alert / Toast Component

**Alert API:**
```jsx
<Alert
  variant="success|warning|error|info"
  title="Alert Title"
  closable={true}
  onClose={handleClose}
  icon={<Icon />}
>
  Alert message content
</Alert>
```

**Toast API:**
```jsx
// Использование через контекст
const { showToast } = useToast();

showToast({
  variant: 'success',
  title: 'Success!',
  message: 'Data saved successfully',
  duration: 3000,
  position: 'top-right'
});
```

**Позиции Toast:**
- `top-left`
- `top-center`
- `top-right` (default)
- `bottom-left`
- `bottom-center`
- `bottom-right`

**Особенности:**
- Автозакрытие (duration)
- Стек нескольких toasts
- Swipe to dismiss (mobile)
- Progress bar
- Иконки по умолчанию
- Sound опция (опционально)

---

### 11. Tooltip Component

**API:**
```jsx
<Tooltip
  content="Tooltip text"
  position="top|bottom|left|right"
  trigger="hover|click|focus"
  delay={200}
  arrow={true}
>
  <Button>Hover me</Button>
</Tooltip>
```

**Особенности:**
- Умное позиционирование (auto flip)
- Arrow указатель
- Debounced показ
- Keyboard доступность
- Portal rendering
- Dark/light варианты

---

### 12. Skeleton Loader

**API:**
```jsx
<Skeleton
  variant="text|circle|rect"
  width="100%"
  height="20px"
  animation="wave|pulse"
  count={1}
/>

// Или предустановленные:
<Skeleton.Text lines={3} />
<Skeleton.Circle size={48} />
<Skeleton.Card />
<Skeleton.Table rows={5} columns={4} />
```

**Особенности:**
- Shimmer анимация
- Различные формы
- Предустановленные варианты
- Адаптация под темную тему

---

### 13. Pagination Component

**API:**
```jsx
<Pagination
  currentPage={1}
  totalPages={10}
  pageSize={20}
  totalItems={200}
  onPageChange={handlePageChange}
  onPageSizeChange={handlePageSizeChange}
  showPageSize={true}
  pageSizeOptions={[10, 20, 50, 100]}
  showFirstLast={true}
  maxPageButtons={5}
/>
```

**Особенности:**
- Первая/последняя страница
- Выбор размера страницы
- Информация о текущих элементах
- Keyboard navigation
- Disabled состояния
- Responsive (упрощается на мобильных)

---

## 🎨 Дизайн система

### Обновленные CSS переменные

```css
:root {
  /* === ЦВЕТА === */

  /* Основные цвета */
  --color-primary: #4f46e5;
  --color-primary-hover: #4338ca;
  --color-primary-light: #eef2ff;
  --color-primary-dark: #3730a3;

  /* Семантические цвета */
  --color-success: #10b981;
  --color-success-light: #d1fae5;
  --color-success-dark: #059669;

  --color-error: #ef4444;
  --color-error-light: #fee2e2;
  --color-error-dark: #dc2626;

  --color-warning: #f59e0b;
  --color-warning-light: #fef3c7;
  --color-warning-dark: #d97706;

  --color-info: #3b82f6;
  --color-info-light: #dbeafe;
  --color-info-dark: #2563eb;

  /* 🆕 Цвета для типов топлива */
  --color-fuel-gasoline: #f59e0b;
  --color-fuel-diesel: #6366f1;
  --color-fuel-gas: #10b981;

  /* 🆕 Цвета для data visualization */
  --color-chart-1: #4f46e5;
  --color-chart-2: #06b6d4;
  --color-chart-3: #10b981;
  --color-chart-4: #f59e0b;
  --color-chart-5: #ef4444;
  --color-chart-6: #8b5cf6;

  /* === ТИПОГРАФИКА === */

  /* Размеры шрифтов */
  --font-size-xs: 0.75rem;      /* 12px */
  --font-size-sm: 0.875rem;     /* 14px */
  --font-size-base: 1rem;       /* 16px */
  --font-size-lg: 1.125rem;     /* 18px */
  --font-size-xl: 1.5rem;       /* 24px */
  --font-size-2xl: 2rem;        /* 32px */
  --font-size-3xl: 2.5rem;      /* 40px */ /* 🆕 */
  --font-size-4xl: 3rem;        /* 48px */ /* 🆕 */

  /* Веса шрифтов */
  --font-weight-normal: 500;
  --font-weight-medium: 550;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;

  /* Letter spacing */ /* 🆕 */
  --letter-spacing-tight: -0.025em;
  --letter-spacing-normal: 0;
  --letter-spacing-wide: 0.025em;

  /* === АНИМАЦИИ === */ /* 🆕 */

  /* Durations */
  --duration-fast: 150ms;
  --duration-normal: 300ms;
  --duration-slow: 500ms;

  /* Easing functions */
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-out: cubic-bezier(0, 0, 0.2, 1);
  --ease-in: cubic-bezier(0.4, 0, 1, 1);
  --ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);

  /* === Z-INDEX === */ /* 🆕 */

  --z-dropdown: 1000;
  --z-sticky: 1020;
  --z-fixed: 1030;
  --z-modal-backdrop: 1040;
  --z-modal: 1050;
  --z-popover: 1060;
  --z-tooltip: 1070;
}
```

### Utility классы

```css
/* === SPACING UTILITIES === */
.p-0 { padding: 0; }
.p-1 { padding: var(--spacing-tiny); }
.p-2 { padding: var(--spacing-small); }
.p-3 { padding: var(--spacing-element); }
.p-4 { padding: var(--spacing-block); }
.p-5 { padding: var(--spacing-section); }

.m-0 { margin: 0; }
.m-1 { margin: var(--spacing-tiny); }
.m-2 { margin: var(--spacing-small); }
/* ... и т.д. */

/* === TEXT UTILITIES === */
.text-xs { font-size: var(--font-size-xs); }
.text-sm { font-size: var(--font-size-sm); }
.text-base { font-size: var(--font-size-base); }
.text-lg { font-size: var(--font-size-lg); }

.text-left { text-align: left; }
.text-center { text-align: center; }
.text-right { text-align: right; }

.text-primary { color: var(--color-text-primary); }
.text-secondary { color: var(--color-text-secondary); }
.text-error { color: var(--color-error); }
.text-success { color: var(--color-success); }

/* === LAYOUT UTILITIES === */
.flex { display: flex; }
.flex-col { flex-direction: column; }
.items-center { align-items: center; }
.justify-center { justify-content: center; }
.justify-between { justify-content: space-between; }
.gap-1 { gap: var(--spacing-tiny); }
.gap-2 { gap: var(--spacing-small); }
.gap-3 { gap: var(--spacing-element); }

/* === VISIBILITY UTILITIES === */
.hidden { display: none; }
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
```

---

## 🚀 План миграции

### Этап 1: Подготовка (1-2 дня)

**TODO:**
1. ✅ Создать структуру папок `src/components/ui/`
2. ✅ Создать файл `src/styles/themes.css`
3. ✅ Создать файл `src/styles/animations.css`
4. ✅ Создать файл `src/styles/utilities.css`
5. ✅ Обновить `index.css` с новыми переменными

### Этап 2: Создание базовых компонентов (3-5 дней)

**Priority 1 - Критичные компоненты:**
1. ✅ Button
2. ✅ Input
3. ✅ Select
4. ✅ Card
5. ✅ Badge

**Priority 2 - Важные компоненты:**
6. ✅ Modal
7. ✅ Table
8. ✅ Form
9. ✅ Alert/Toast

**Priority 3 - Дополнительные компоненты:**
10. ✅ Checkbox & Radio
11. ✅ Tooltip
12. ✅ Skeleton
13. ✅ Pagination

### Этап 3: Стилизация и анимации (2-3 дня)

**TODO:**
1. ✅ Исправить hardcoded цвета на переменные
2. ✅ Добавить ripple эффект для кнопок
3. ✅ Добавить pulse анимацию для alerts
4. ✅ Добавить page transitions
5. ✅ Добавить grid lines для графиков
6. ✅ Улучшить контраст в темной теме

### Этап 4: Accessibility (1-2 дня)

**TODO:**
1. ✅ Реализовать focus trap для модальных окон
2. ✅ Добавить ARIA labels везде
3. ✅ Добавить keyboard navigation
4. ✅ Добавить prefers-color-scheme
5. ✅ Добавить prefers-reduced-motion
6. ✅ Провести accessibility audit

### Этап 5: Миграция существующих компонентов (5-7 дней)

**TODO:**
1. ✅ Мигрировать Dashboard
2. ✅ Мигрировать VehiclesList
3. ✅ Мигрировать FuelCardsList
4. ✅ Мигрировать GasStationsList
5. ✅ Мигрировать ProvidersList
6. ✅ Мигрировать TemplatesList
7. ✅ Мигрировать UsersList

### Этап 6: Документация и тестирование (2-3 дня)

**TODO:**
1. ✅ Настроить Storybook
2. ✅ Написать stories для всех компонентов
3. ✅ Создать README для каждого компонента
4. ✅ Провести тестирование на всех устройствах
5. ✅ Провести cross-browser тестирование

---

## ✅ Чеклист выполнения

### 🔴 Высокий приоритет (Неделя 1)

- [ ] Создать структуру `src/components/ui/`
- [ ] Создать Button component
- [ ] Создать Input component
- [ ] Создать Select component
- [ ] Создать Card component
- [ ] Создать Badge component
- [ ] Исправить hardcoded цвета на CSS-переменные
- [ ] Улучшить контраст в темной теме (WCAG AA)

### 🟡 Средний приоритет (Неделя 2)

- [ ] Создать Modal component
- [ ] Создать Table component
- [ ] Создать Form component
- [ ] Создать Alert/Toast component
- [ ] Создать Checkbox & Radio
- [ ] Добавить ripple эффект для кнопок
- [ ] Добавить pulse анимацию для alerts
- [ ] Реализовать focus trap для модальных окон

### 🟢 Низкий приоритет (Неделя 3)

- [ ] Создать Tooltip component
- [ ] Создать Skeleton component
- [ ] Создать Pagination component
- [ ] Добавить page transitions
- [ ] Добавить grid lines для графиков
- [ ] Добавить prefers-color-scheme и prefers-reduced-motion
- [ ] Мигрировать все существующие компоненты
- [ ] Настроить Storybook
- [ ] Провести accessibility audit
- [ ] Провести финальное тестирование

---

## 📊 Метрики успеха

### Количественные метрики:
- ✅ 100% компонентов используют CSS-переменные
- ✅ 0 hardcoded цветов в коде
- ✅ WCAG AA compliance (контраст 4.5:1)
- ✅ Lighthouse accessibility score > 95
- ✅ 100% компонентов документированы в Storybook

### Качественные метрики:
- ✅ Единый стиль во всем приложении
- ✅ Простота добавления новых компонентов
- ✅ Улучшенная accessibility
- ✅ Более быстрая разработка новых фич

---

## 🎯 Примеры использования

### До миграции:
```jsx
// Много дублирования стилей, inconsistent API
<button
  className="refresh-button"
  onClick={handleRefresh}
  disabled={loading}
>
  {loading ? <div className="spinner" /> : <RefreshIcon />}
  Обновить
</button>
```

### После миграции:
```jsx
// Единый API, переиспользуемый компонент
<Button
  variant="primary"
  icon={<RefreshIcon />}
  loading={loading}
  onClick={handleRefresh}
>
  Обновить
</Button>
```

---

## 📝 Заметки

### Важно помнить:
1. **Обратная совместимость**: старые компоненты продолжают работать во время миграции
2. **Постепенная миграция**: мигрируем по одному компоненту за раз
3. **Тестирование**: после каждой миграции тестируем функциональность
4. **Документация**: документируем каждый новый компонент
5. **Code review**: все изменения проходят review

### Полезные ресурсы:
- [Material UI](https://mui.com/) - вдохновение для API
- [Radix UI](https://www.radix-ui.com/) - accessibility patterns
- [Tailwind CSS](https://tailwindcss.com/) - utility классы
- [Storybook](https://storybook.js.org/) - документация компонентов

---

**Автор:** Claude AI
**Дата создания:** 2025-01-28
**Версия:** 1.0
