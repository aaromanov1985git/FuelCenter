/**
 * Тесты для компонента FuelCardsList
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../../test/utils/test-utils'
import FuelCardsList from '../FuelCardsList'

const mockAuthFetch = vi.fn()
vi.mock('../../utils/api', () => ({
  authFetch: (...args) => mockAuthFetch(...args)
}))

const mockSuccess = vi.fn()
const mockError = vi.fn()
vi.mock('../ToastContainer', () => ({
  useToast: () => ({ success: mockSuccess, error: mockError })
}))

const makeResponse = (body, ok = true) => ({
  ok,
  status: ok ? 200 : 500,
  json: async () => body
})

const setupHappyPath = ({ cards = [], vehicles = [], providers = [] } = {}) => {
  mockAuthFetch.mockImplementation((url) => {
    if (url.includes('/api/v1/fuel-cards')) {
      return Promise.resolve(makeResponse({ items: cards, total: cards.length }))
    }
    if (url.includes('/api/v1/vehicles')) {
      return Promise.resolve(makeResponse({ items: vehicles, total: vehicles.length }))
    }
    if (url.includes('/api/v1/providers')) {
      return Promise.resolve(makeResponse({ items: providers, total: providers.length }))
    }
    return Promise.resolve(makeResponse({}))
  })
}

describe('FuelCardsList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('рендерит заголовок и переключатели вида', async () => {
    setupHappyPath()
    renderWithProviders(<FuelCardsList />)

    await waitFor(() => {
      expect(screen.getByText('Справочник топливных карт')).toBeInTheDocument()
    })
    expect(screen.getByTestId('fuel-cards-view-grid')).toBeInTheDocument()
    expect(screen.getByTestId('fuel-cards-view-list')).toBeInTheDocument()
  })

  it('загружает карты, транспорт и провайдеров при монтировании', async () => {
    setupHappyPath()
    renderWithProviders(<FuelCardsList />)

    await waitFor(() => {
      const urls = mockAuthFetch.mock.calls.map(c => c[0])
      expect(urls.some(u => u.includes('/api/v1/fuel-cards'))).toBe(true)
      expect(urls.some(u => u.includes('/api/v1/vehicles'))).toBe(true)
      expect(urls.some(u => u.includes('/api/v1/providers'))).toBe(true)
    })
  })

  it('показывает статистику когда есть карты', async () => {
    setupHappyPath({
      cards: [
        { id: 1, card_number: '1234567890123456', is_blocked: false, vehicle_id: 10, provider_id: 1 },
        { id: 2, card_number: '2234567890123456', is_blocked: true,  vehicle_id: null, provider_id: 1 }
      ]
    })

    renderWithProviders(<FuelCardsList />)

    await waitFor(() => {
      expect(screen.getByText('Всего карт')).toBeInTheDocument()
    })
    expect(screen.getByText('Активных')).toBeInTheDocument()
    expect(screen.getByText('Заблокировано')).toBeInTheDocument()
  })

  it('переключает вид grid↔list', async () => {
    setupHappyPath()
    renderWithProviders(<FuelCardsList />)

    const listBtn = await screen.findByTestId('fuel-cards-view-list')
    fireEvent.click(listBtn)
    expect(listBtn).toHaveAttribute('aria-pressed', 'true')

    const gridBtn = screen.getByTestId('fuel-cards-view-grid')
    fireEvent.click(gridBtn)
    expect(gridBtn).toHaveAttribute('aria-pressed', 'true')
  })

  it('показывает ошибку при неуспешной загрузке карт', async () => {
    mockAuthFetch.mockImplementation((url) => {
      if (url.includes('/api/v1/fuel-cards') && !url.includes('limit=10000')) {
        return Promise.resolve(makeResponse({}, false))
      }
      return Promise.resolve(makeResponse({ items: [] }))
    })

    renderWithProviders(<FuelCardsList />)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })
})
