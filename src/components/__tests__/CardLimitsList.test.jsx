/**
 * Тесты страницы «Лимиты карт»
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test/utils/test-utils'
import CardLimitsList from '../CardLimitsList'

const mockAuthFetch = vi.fn()
vi.mock('../../utils/api', () => ({
  authFetch: (...args) => mockAuthFetch(...args)
}))

vi.mock('../ToastContainer', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() })
}))

const makeResponse = (body) => ({ ok: true, status: 200, json: async () => body })

const body = {
  total: 3,
  synced_at: '2026-09-14T14:00:00',
  stats: { total: 4, enabled: 3, near_limit: 1, exhausted: 1, forbidden: 1, without_period: 1 },
  items: [
    { id: 1, provider_id: 3, provider_name: 'МАЗС', card_code: 'A1', card_name: '200 ИП Касумов 793', card_enabled: true,
      fuel_type: 'АИ-92', source_fuel: 'АИ-92', limit_type_id: 7, limit_type_name: 'Календарный день',
      limit_liters: 40, used_liters: 40, remaining_liters: 0, used_percent: 100, period_start: '2026-09-14T00:00:00' },
    { id: 2, provider_id: 2, provider_name: 'КАЗС', card_code: '00815012', card_name: 'К010', card_enabled: true,
      fuel_type: 'ДТ', source_fuel: 'ДТ1', limit_type_id: 0, limit_type_name: null,
      limit_liters: 200, used_liters: null, remaining_liters: null, used_percent: null },
    { id: 3, provider_id: 3, provider_name: 'МАЗС', card_code: 'B2', card_name: 'УТДежДт', card_enabled: true,
      fuel_type: 'АИ-92', limit_type_id: 4, limit_type_name: 'Запрещен', limit_liters: 0, used_liters: null, used_percent: null },
  ],
}

describe('CardLimitsList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthFetch.mockImplementation((url) =>
      Promise.resolve(makeResponse(url.includes('/api/v1/card-limits') ? body : { items: [] }))
    )
  })

  it('показывает сводку и строки лимитов', async () => {
    renderWithProviders(<CardLimitsList />)

    expect(await screen.findByText('200 ИП Касумов 793')).toBeInTheDocument()
    expect(screen.getByTestId('card-limits-stats')).toHaveTextContent('Лимит без периода')
    expect(screen.getByText(/40 из 40 л/)).toBeInTheDocument()
    expect(screen.getByText('в Топазе: ДТ1')).toBeInTheDocument()
    expect(screen.getByText('тип периода не выбран')).toBeInTheDocument()
    expect(screen.getByText('Отпуск запрещён')).toBeInTheDocument()
  })

  it('по умолчанию запрашивает только включённые карты', async () => {
    renderWithProviders(<CardLimitsList />)
    await waitFor(() => {
      const url = mockAuthFetch.mock.calls.map(([u]) => u).find((u) => u.includes('/api/v1/card-limits'))
      expect(url).toContain('only_enabled=true')
      expect(url).toContain('limit=50')
    })
  })
})
