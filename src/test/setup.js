/**
 * Настройка тестового окружения
 * Этот файл выполняется перед каждым тестом
 */

import { expect, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'

// Расширяем expect с matchers из jest-dom
expect.extend(matchers)

// Очистка после каждого теста
afterEach(() => {
  cleanup()
  
  // Очистка localStorage и sessionStorage
  localStorage.clear()
  sessionStorage.clear()
  
  // Очистка всех моков
  vi.clearAllMocks()
})

// Мокаем window.matchMedia для компонентов, использующих медиа-запросы
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Мокаем ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Мокаем IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Мокаем window.scrollTo
window.scrollTo = vi.fn()

// Мокаем import.meta.env для тестов
// Это нужно делать до импорта модулей, которые используют import.meta.env
Object.defineProperty(globalThis, 'import', {
  value: {
    meta: {
      env: {
        VITE_API_URL: '',
        VITE_LOG_LEVEL: 'DEBUG',
        MODE: 'test'
      }
    }
  },
  writable: true,
  configurable: true
})

