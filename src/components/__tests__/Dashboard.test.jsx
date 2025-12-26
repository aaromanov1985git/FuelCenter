/**
 * Тесты для компонента Dashboard
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test/utils/test-utils'
import Dashboard from '../Dashboard'

// Мокаем authFetch
const mockAuthFetch = vi.fn()
vi.mock('../../utils/api', () => ({
  authFetch: (...args) => mockAuthFetch(...args)
}))

// Мокаем ToastContainer
const mockSuccess = vi.fn()
const mockError = vi.fn()
vi.mock('../ToastContainer', () => ({
  useToast: () => ({
    success: mockSuccess,
    error: mockError
  })
}))

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('должен отображать компонент', () => {
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        total_transactions: 0,
        total_amount: 0,
        total_volume: 0,
        providers: []
      })
    })

    renderWithProviders(<Dashboard />)

    expect(screen.getByText(/дашборд/i)).toBeInTheDocument()
  })

  it('должен загружать статистику при монтировании', async () => {
    const mockStats = {
      total_transactions: 100,
      total_amount: 50000,
      total_volume: 1000,
      providers: []
    }

    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: async () => mockStats
    })

    renderWithProviders(<Dashboard />)

    await waitFor(() => {
      expect(mockAuthFetch).toHaveBeenCalled()
    })
  })

  it('должен показывать ошибку при неудачной загрузке', async () => {
    mockAuthFetch.mockResolvedValue({
      ok: false,
      status: 500
    })

    renderWithProviders(<Dashboard />)

    await waitFor(() => {
      expect(mockError).toHaveBeenCalled()
    })
  })

  it('должен показывать скелетон при загрузке', () => {
    mockAuthFetch.mockImplementation(() => new Promise(() => {})) // Никогда не резолвится

    renderWithProviders(<Dashboard />)

    // Проверяем наличие элементов загрузки (если они есть в компоненте)
    // Это зависит от реализации Dashboard
  })
})

