# Тестирование Frontend

Этот каталог содержит настройки и утилиты для тестирования frontend приложения.

## Структура

```
src/test/
├── setup.js              # Глобальная настройка тестового окружения
└── utils/
    └── test-utils.jsx    # Утилиты для тестирования React компонентов
```

## Запуск тестов

```bash
# Запуск тестов в watch режиме
npm run test

# Запуск тестов с UI
npm run test:ui

# Запуск тестов один раз
npm run test:run

# Запуск тестов с покрытием
npm run test:coverage
```

## Настройка

Тесты используют:
- **Vitest** - быстрый тестовый фреймворк, совместимый с Vite
- **React Testing Library** - для тестирования React компонентов
- **jsdom** - DOM окружение для тестов
- **MSW** - для мокирования HTTP запросов (Mock Service Worker)

## Покрытие

Целевое покрытие:
- Утилиты: ≥80%
- Компоненты: ≥60%
- Хуки: ≥80%

Текущее покрытие можно посмотреть в `coverage/` после запуска `npm run test:coverage`.

## Написание тестов

### Тесты для утилит

```javascript
import { describe, it, expect } from 'vitest'
import { myUtility } from '../myUtility'

describe('myUtility', () => {
  it('должен делать что-то', () => {
    expect(myUtility()).toBe(expected)
  })
})
```

### Тесты для компонентов

```javascript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { renderWithProviders } from '../test/utils/test-utils'
import MyComponent from '../MyComponent'

describe('MyComponent', () => {
  it('должен отображать контент', () => {
    renderWithProviders(<MyComponent />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })
})
```

### Тесты для хуков

```javascript
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useMyHook } from '../useMyHook'

describe('useMyHook', () => {
  it('должен возвращать правильное значение', () => {
    const { result } = renderHook(() => useMyHook())
    expect(result.current).toBe(expected)
  })
})
```

## Мокирование

### Мокирование API запросов

Используйте MSW для мокирования HTTP запросов:

```javascript
import { rest } from 'msw'
import { setupServer } from 'msw/node'

const server = setupServer(
  rest.get('/api/test', (req, res, ctx) => {
    return res(ctx.json({ data: 'test' }))
  })
)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

### Мокирование модулей

```javascript
import { vi } from 'vitest'

vi.mock('../myModule', () => ({
  myFunction: vi.fn(() => 'mocked')
}))
```

## Best Practices

1. **Тестируйте поведение, а не реализацию**
   - Фокусируйтесь на том, что делает компонент, а не как он это делает

2. **Используйте доступные селекторы**
   - Предпочитайте `getByRole`, `getByLabelText` вместо `getByTestId`

3. **Изолируйте тесты**
   - Каждый тест должен быть независимым
   - Очищайте состояние между тестами

4. **Пишите понятные тесты**
   - Используйте описательные имена тестов
   - Группируйте связанные тесты в `describe` блоки

5. **Избегайте избыточных тестов**
   - Не тестируйте реализацию библиотек
   - Фокусируйтесь на бизнес-логике

