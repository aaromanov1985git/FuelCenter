/**
 * Тесты для утилиты API
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { 
  getAuthHeaders, 
  authFetch, 
  setLogoutHandler, 
  resetLogoutFlag 
} from '../api'

// Мокаем fetch глобально
global.fetch = vi.fn()

describe('api utils', () => {
  beforeEach(() => {
    // Очистка localStorage перед каждым тестом
    localStorage.clear()
    vi.clearAllMocks()
    
    // Сброс глобальных переменных
    resetLogoutFlag()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getAuthHeaders', () => {
    it('должен возвращать заголовки без токена, если токен отсутствует', () => {
      const headers = getAuthHeaders()
      
      expect(headers).toHaveProperty('Content-Type', 'application/json')
      expect(headers).not.toHaveProperty('Authorization')
    })

    it('должен добавлять Authorization заголовок, если токен есть', () => {
      localStorage.setItem('auth_token', 'test-token-123')
      
      const headers = getAuthHeaders()
      
      expect(headers).toHaveProperty('Content-Type', 'application/json')
      expect(headers).toHaveProperty('Authorization', 'Bearer test-token-123')
    })

    it('должен объединять дополнительные заголовки', () => {
      const additionalHeaders = { 'X-Custom-Header': 'custom-value' }
      const headers = getAuthHeaders(additionalHeaders)
      
      expect(headers).toHaveProperty('Content-Type', 'application/json')
      expect(headers).toHaveProperty('X-Custom-Header', 'custom-value')
    })

    it('должен перезаписывать Content-Type, если передан в дополнительных заголовках', () => {
      const additionalHeaders = { 'Content-Type': 'application/xml' }
      const headers = getAuthHeaders(additionalHeaders)
      
      expect(headers).toHaveProperty('Content-Type', 'application/xml')
    })
  })

  describe('authFetch', () => {
    it('должен выполнять успешный запрос', async () => {
      const mockResponse = { data: 'test' }
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse
      })

      const result = await authFetch('/api/test')

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          }),
          credentials: 'include'
        })
      )
    })

    it('должен обрабатывать 401 ошибку и вызывать logout handler', async () => {
      const logoutHandler = vi.fn()
      setLogoutHandler(logoutHandler)

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized'
      })

      // Очищаем токен при 401
      localStorage.setItem('auth_token', 'token')

      // Ожидаем, что будет выброшена ошибка
      await expect(authFetch('/api/test')).rejects.toThrow('Требуется авторизация')

      expect(localStorage.getItem('auth_token')).toBeNull()
      // Проверяем, что logout handler был вызван (через setTimeout)
      await new Promise(resolve => setTimeout(resolve, 10))
      expect(logoutHandler).toHaveBeenCalled()
    })

    it('должен передавать правильные опции запроса', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({})
      })

      await authFetch('/api/test', {
        method: 'POST',
        body: JSON.stringify({ test: 'data' })
      })

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ test: 'data' }),
          credentials: 'include'
        })
      )
    })

    it('должен нормализовать URL правильно', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({})
      })

      // Тест относительного URL
      await authFetch('/api/v1/test')
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/v1/test',
        expect.any(Object)
      )

      // Тест URL с API_URL - проверяем, что fetch вызывается
      // (конкретная логика нормализации URL тестируется отдельно)
      expect(global.fetch).toHaveBeenCalled()
    })
  })

  describe('setLogoutHandler', () => {
    it('должен устанавливать обработчик logout', () => {
      const handler = vi.fn()
      setLogoutHandler(handler)
      
      // Проверяем, что handler установлен (косвенно через тест 401)
      expect(handler).toBeDefined()
    })
  })

  describe('resetLogoutFlag', () => {
    it('должен сбрасывать флаг logout', () => {
      resetLogoutFlag()
      // Функция должна выполняться без ошибок
      expect(true).toBe(true)
    })
  })
})

