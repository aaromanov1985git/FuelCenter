/**
 * Тесты для компонента GasStationsList
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../../test/utils/test-utils'
import GasStationsList from '../GasStationsList'

const mockAuthFetch = vi.fn()
vi.mock('../../utils/api', () => ({
  authFetch: (...args) => mockAuthFetch(...args)
}))

const mockSuccess = vi.fn()
const mockError = vi.fn()
const mockWarning = vi.fn()
vi.mock('../ToastContainer', () => ({
  useToast: () => ({ success: mockSuccess, error: mockError, warning: mockWarning })
}))

const makeResponse = (body, ok = true) => ({
  ok,
  status: ok ? 200 : 500,
  json: async () => body
})

const setupHappyPath = ({ stations = [], providers = [], stats = {} } = {}) => {
  mockAuthFetch.mockImplementation((url) => {
    if (url.includes('/api/v1/gas-stations/stats')) {
      return Promise.resolve(makeResponse(stats))
    }
    if (url.includes('/api/v1/gas-stations')) {
      return Promise.resolve(makeResponse({ items: stations, total: stations.length }))
    }
    if (url.includes('/api/v1/providers')) {
      return Promise.resolve(makeResponse({ items: providers, total: providers.length }))
    }
    return Promise.resolve(makeResponse({}))
  })
}

describe('GasStationsList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('рендерит поисковую строку и вкладки фильтра', async () => {
    setupHappyPath()
    renderWithProviders(<GasStationsList />)

    expect(await screen.findByPlaceholderText(/поиск по названию, номеру АЗС/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Все' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /требуют проверки/i })).toBeInTheDocument()
  })

  it('загружает АЗС, статистику и провайдеров при монтировании', async () => {
    setupHappyPath()
    renderWithProviders(<GasStationsList />)

    await waitFor(() => {
      const urls = mockAuthFetch.mock.calls.map(c => c[0])
      expect(urls.some(u => u.includes('/api/v1/gas-stations?'))).toBe(true)
      expect(urls.some(u => u.includes('/api/v1/gas-stations/stats'))).toBe(true)
      expect(urls.some(u => u.includes('/api/v1/providers'))).toBe(true)
    })
  })

  it('показывает загруженные АЗС', async () => {
    setupHappyPath({
      stations: [
        { id: 1, azs_number: '101', name: 'АЗС-Юг', original_name: 'АЗС №101', provider_id: 1, is_validated: 'valid', latitude: null, longitude: null }
      ]
    })

    renderWithProviders(<GasStationsList />)

    await waitFor(() => {
      expect(screen.getAllByText(/101/)[0]).toBeInTheDocument()
    })
  })

  it('меняет фильтр при клике на вкладку', async () => {
    setupHappyPath()
    renderWithProviders(<GasStationsList />)

    await waitFor(() => expect(mockAuthFetch).toHaveBeenCalled())
    mockAuthFetch.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'Валидные' }))

    await waitFor(() => {
      const urls = mockAuthFetch.mock.calls.map(c => c[0])
      expect(urls.some(u => u.includes('is_validated=valid'))).toBe(true)
    })
  })

  it('показывает тост при ошибке загрузки', async () => {
    mockAuthFetch.mockImplementation((url) => {
      if (url.includes('/api/v1/gas-stations')) {
        return Promise.resolve(makeResponse({}, false))
      }
      return Promise.resolve(makeResponse({ items: [] }))
    })

    renderWithProviders(<GasStationsList />)

    await waitFor(() => {
      expect(mockError).toHaveBeenCalled()
    })
  })
})
