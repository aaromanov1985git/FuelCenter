/**
 * Тесты страницы «Резервуары»
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent, within } from '@testing-library/react'
import { renderWithProviders } from '../../test/utils/test-utils'
import TanksPage from '../TanksPage'

const mockAuthFetch = vi.fn()
vi.mock('../../utils/api', () => ({
  authFetch: (...args) => mockAuthFetch(...args)
}))

const mockSuccess = vi.fn()
const mockError = vi.fn()
vi.mock('../ToastContainer', () => ({
  useToast: () => ({ success: mockSuccess, error: mockError })
}))

let mockUser = { id: 1, username: 'admin', role: 'admin' }
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser })
}))

const makeResponse = (body, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body })

const tank = (overrides) => ({
  id: 1,
  provider_id: 3,
  provider_name: 'МАЗС',
  template_id: 4,
  azs_code: '1016201',
  source_key: 'snap:1',
  tank_number: 1,
  source_name: 'Емкость 1 - 1016201',
  source_fuel: 'АИ-92',
  fuel_type: 'АИ-92',
  capacity_liters: 30000,
  overflow_group: null,
  is_active: true,
  last_measured_at: '2026-09-14T13:57:41',
  last_volume: 5388.43,
  last_density: 765.06,
  last_temperature: 19.95,
  fill_percent: 18,
  age_minutes: 12,
  warnings: [],
  ...overrides,
})

const overview = {
  total_tanks: 2,
  sync: [{ template_id: 4, template_name: 'MAZS', provider_id: 3, last_status: 'success', last_success_at: '2026-09-14T09:00:00' }],
  stations: [{
    azs_code: '1016201',
    provider_id: 3,
    provider_name: 'МАЗС',
    fuels: [
      { fuel_type: 'АИ-92', volume: 5388.43, capacity_liters: 30000, fill_percent: 18, tanks_count: 1, age_minutes: 12, warnings: [] },
      { fuel_type: 'ДТ', volume: 4230.71, capacity_liters: 30000, fill_percent: 14.1, tanks_count: 1, age_minutes: 12, warnings: [] },
    ],
    tanks: [
      tank(),
      tank({ id: 3, source_key: 'snap:3', tank_number: 2, source_name: 'Емкость 2 - 1016201', fuel_type: 'ДТ', source_fuel: 'ДТ', last_volume: 4230.71, last_density: 826.81, fill_percent: 14.1 }),
    ],
  }],
}

const setup = (body = overview) => {
  mockAuthFetch.mockImplementation((url, options) => {
    if (url.includes('/api/v1/tanks/sync')) {
      return Promise.resolve(makeResponse([{ template_id: 4, template_name: 'MAZS', status: 'success', readings_added: 2 }]))
    }
    if (url.includes('/api/v1/tanks/') && options?.method === 'PATCH') {
      return Promise.resolve(makeResponse(tank({ capacity_liters: 10000 })))
    }
    if (url.includes('/api/v1/tanks')) return Promise.resolve(makeResponse(body))
    if (url.includes('/api/v1/providers')) return Promise.resolve(makeResponse({ items: [{ id: 3, name: 'МАЗС', is_active: true }] }))
    return Promise.resolve(makeResponse({}))
  })
}

describe('TanksPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUser = { id: 1, username: 'admin', role: 'admin' }
  })

  it('показывает остатки по видам топлива на АЗС', async () => {
    setup()
    renderWithProviders(<TanksPage />)

    const station = await screen.findByTestId('tank-station')
    expect(within(station).getByText('1016201')).toBeInTheDocument()
    expect(within(station).getByText('АИ-92')).toBeInTheDocument()
    expect(within(station).getByText(/^4\s231 л$/)).toBeInTheDocument()
    expect(within(station).getAllByRole('meter').length).toBe(2)
  })

  it('раскрывает ёмкости и показывает предупреждения', async () => {
    setup({
      ...overview,
      stations: [{ ...overview.stations[0], tanks: [tank({ warnings: ['density_mismatch'] })] }],
    })
    renderWithProviders(<TanksPage />)

    fireEvent.click(await screen.findByRole('button', { name: /Ёмкости \(1\)/ }))
    expect(screen.getByTestId('tank-row')).toBeInTheDocument()
    expect(screen.getByText('Плотность не от этого топлива')).toBeInTheDocument()
  })

  it('админ запускает чтение из Топаза', async () => {
    setup()
    renderWithProviders(<TanksPage />)

    fireEvent.click(await screen.findByRole('button', { name: /Прочитать из Топаза/ }))
    await waitFor(() => {
      expect(mockAuthFetch.mock.calls.some(([url, options]) => url.includes('/api/v1/tanks/sync') && options?.method === 'POST')).toBe(true)
      expect(mockSuccess).toHaveBeenCalledWith('Данные из Топаза прочитаны, новых замеров: 2')
    })
  })

  it('рядовой пользователь не видит управления', async () => {
    mockUser = { id: 2, username: 'viewer', role: 'viewer' }
    setup()
    renderWithProviders(<TanksPage />)

    fireEvent.click(await screen.findByRole('button', { name: /Ёмкости \(2\)/ }))
    expect(screen.queryByRole('button', { name: /Прочитать из Топаза/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Настроить/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /История/ }).length).toBe(2)
  })

  it('сохраняет вместимость ёмкости', async () => {
    setup()
    renderWithProviders(<TanksPage />)

    fireEvent.click(await screen.findByRole('button', { name: /Ёмкости \(2\)/ }))
    fireEvent.click(screen.getAllByRole('button', { name: /Настроить/ })[0])
    const input = screen.getByLabelText(/Вместимость, л/)
    fireEvent.change(input, { target: { value: '10000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => {
      const patch = mockAuthFetch.mock.calls.find(([, options]) => options?.method === 'PATCH')
      expect(patch).toBeTruthy()
      expect(JSON.parse(patch[1].body)).toMatchObject({ capacity_liters: 10000, is_active: true })
    })
  })

  it('показывает пустое состояние, если резервуаров нет', async () => {
    setup({ stations: [], sync: [], total_tanks: 0 })
    renderWithProviders(<TanksPage />)
    expect(await screen.findByText('Резервуаров пока нет')).toBeInTheDocument()
  })
})
