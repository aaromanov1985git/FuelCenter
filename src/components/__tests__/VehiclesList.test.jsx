/**
 * Тесты для компонента VehiclesList
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../../test/utils/test-utils'
import VehiclesList from '../VehiclesList'

const mockAuthFetch = vi.fn()
vi.mock('../../utils/api', () => ({
  authFetch: (...args) => mockAuthFetch(...args)
}))

const mockSuccess = vi.fn()
const mockError = vi.fn()
vi.mock('../ToastContainer', () => ({
  useToast: () => ({ success: mockSuccess, error: mockError })
}))

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, username: 'admin', is_admin: true } })
}))

const makeResponse = (body, ok = true) => ({
  ok,
  status: ok ? 200 : 500,
  json: async () => body
})

const setupHappyPath = (vehicles = []) => {
  mockAuthFetch.mockImplementation((url) => {
    if (url.includes('/api/v1/vehicles')) {
      return Promise.resolve(makeResponse({ items: vehicles, total: vehicles.length }))
    }
    if (url.includes('/api/v1/dashboard/errors-warnings')) {
      return Promise.resolve(makeResponse({ errors: 0, warnings: 0 }))
    }
    if (url.includes('/api/v1/organizations')) {
      return Promise.resolve(makeResponse({ items: [] }))
    }
    return Promise.resolve(makeResponse({}))
  })
}

describe('VehiclesList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('рендерит контейнер и панель статистики', () => {
    setupHappyPath()
    renderWithProviders(<VehiclesList />)

    expect(screen.getByTestId('vehicles-list')).toBeInTheDocument()
    expect(screen.getByTestId('vehicles-stats')).toBeInTheDocument()
    expect(screen.getByTestId('vehicles-toolbar')).toBeInTheDocument()
    expect(screen.getByText('Справочник транспортных средств')).toBeInTheDocument()
  })

  it('вызывает API для загрузки ТС и организаций при монтировании', async () => {
    setupHappyPath()
    renderWithProviders(<VehiclesList />)

    await waitFor(() => {
      const urls = mockAuthFetch.mock.calls.map(c => c[0])
      expect(urls.some(u => u.includes('/api/v1/vehicles'))).toBe(true)
      expect(urls.some(u => u.includes('/api/v1/organizations'))).toBe(true)
    })
  })

  it('показывает загруженные ТС в таблице', async () => {
    setupHappyPath([
      { id: 1, original_name: 'КАМАЗ-5320', license_plate: 'А123ВС77', garage_number: 'G-001', is_validated: 'valid' }
    ])

    renderWithProviders(<VehiclesList />)

    await waitFor(() => {
      expect(screen.getByText('КАМАЗ-5320')).toBeInTheDocument()
    })
  })

  it('переключает фильтр при клике на чип', async () => {
    setupHappyPath()
    renderWithProviders(<VehiclesList />)

    await waitFor(() => expect(mockAuthFetch).toHaveBeenCalled())
    mockAuthFetch.mockClear()

    fireEvent.click(screen.getByTestId('vehicles-filter-valid'))

    await waitFor(() => {
      const urls = mockAuthFetch.mock.calls.map(c => c[0])
      expect(urls.some(u => u.includes('is_validated=valid'))).toBe(true)
    })
  })

  it('показывает ошибку при неуспешной загрузке ТС', async () => {
    mockAuthFetch.mockImplementation((url) => {
      if (url.includes('/api/v1/vehicles')) {
        return Promise.resolve(makeResponse({}, false))
      }
      return Promise.resolve(makeResponse({ items: [] }))
    })

    renderWithProviders(<VehiclesList />)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })
})
