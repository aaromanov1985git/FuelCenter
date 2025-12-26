/**
 * Утилиты для тестирования React компонентов
 */
import React from 'react'
import { render } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { vi } from 'vitest'

/**
 * Обёртка для рендеринга компонентов с провайдерами
 * @param {React.Component} ui - Компонент для рендеринга
 * @param {Object} options - Опции рендеринга
 * @returns {Object} Результат рендеринга
 */
export function renderWithProviders(ui, options = {}) {
  const { route = '/', ...renderOptions } = options

  // Обёртка с роутером
  const Wrapper = ({ children }) => {
    window.history.pushState({}, 'Test page', route)
    return (
      <BrowserRouter>
        {children}
      </BrowserRouter>
    )
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions })
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

