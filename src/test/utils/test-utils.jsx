/**
 * Утилиты для тестирования React компонентов
 */
import { render } from '@testing-library/react'
import { vi } from 'vitest'

/**
 * Обёртка для рендеринга компонентов с провайдерами.
 *
 * Провайдеров пока ни одного: роутера в приложении нет, экраны переключаются
 * состоянием. Функция остаётся точкой, куда провайдер добавляют, когда он
 * появляется, — тесты уже зовут её и переписывать их не придётся.
 *
 * @param {React.Component} ui - Компонент для рендеринга
 * @param {Object} options - Опции рендеринга @testing-library/react
 * @returns {Object} Результат рендеринга
 */
export function renderWithProviders(ui, options = {}) {
  return render(ui, options)
}

/**
 * Мок для localStorage
 */
export const mockLocalStorage = () => {
  const store = {}
  
  return {
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, value) => {
      store[key] = value.toString()
    }),
    removeItem: vi.fn((key) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      Object.keys(store).forEach(key => delete store[key])
    }),
    get length() {
      return Object.keys(store).length
    },
    key: vi.fn((index) => Object.keys(store)[index] || null)
  }
}

/**
 * Ожидание асинхронного обновления
 */
export const waitForAsync = () => new Promise(resolve => setTimeout(resolve, 0))

