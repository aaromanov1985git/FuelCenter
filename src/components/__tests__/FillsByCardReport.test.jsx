/**
 * Тесты отчёта «Заправки по картам»
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../../test/utils/test-utils'
import FillsByCardReport from '../FillsByCardReport'

const mockAuthFetch = vi.fn()
vi.mock('../../utils/api', () => ({
  authFetch: (...args) => mockAuthFetch(...args)
}))

vi.mock('../ToastContainer', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() })
}))

const makeResponse = (body) => ({ ok: true, status: 200, json: async () => body })

const report = {
  date_from: '2026-08-16',
  date_to: '2026-09-14',
  total: 2,
  totals: { cards: 2, fills_count: 25, liters: 620.5 },
  items: [
    { provider_id: 3, provider_name: 'МАЗС', card_number: '214 ИП Касумов 772', fuel_type: 'АИ-92', fills_count: 21,
      liters: 420, days_with_fills: 21, max_daily_liters: 20, avg_daily_liters: 20, daily_limit: 20, days_at_limit: 21,
      azs_numbers: ['1016201'], first_fill: '2026-08-20T09:00:00', last_fill: '2026-09-13T18:00:00' },
    { provider_id: 3, provider_name: 'МАЗС', card_number: 'УТ226', fuel_type: 'ДТ', fills_count: 4,
      liters: 200.5, days_with_fills: 2, max_daily_liters: 150, avg_daily_liters: 100.25, daily_limit: null, days_at_limit: null,
      azs_numbers: ['807211'], first_fill: '2026-09-01T09:00:00', last_fill: '2026-09-02T09:00:00' },
  ],
}

describe('FillsByCardReport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthFetch.mockImplementation((url) =>
      Promise.resolve(makeResponse(url.includes('/api/v1/reports/fills-by-card') ? report : { items: [] }))
    )
  })

  it('строит отчёт за последние 30 дней', async () => {
    renderWithProviders(<FillsByCardReport />)

    expect(await screen.findByText('214 ИП Касумов 772')).toBeInTheDocument()
    expect(screen.getByText('21 из 21')).toBeInTheDocument()
    expect(screen.getByTestId('fills-by-card-totals')).toHaveTextContent('25')
    const url = mockAuthFetch.mock.calls.map(([u]) => u).find((u) => u.includes('fills-by-card'))
    expect(url).toMatch(/date_from=\d{4}-\d{2}-\d{2}&date_to=\d{4}-\d{2}-\d{2}/)
  })

  it('смена даты перестраивает отчёт', async () => {
    renderWithProviders(<FillsByCardReport />)
    await screen.findByText('УТ226')
    mockAuthFetch.mockClear()

    fireEvent.change(screen.getByLabelText('С'), { target: { value: '2026-09-01' } })
    await waitFor(() => {
      const url = mockAuthFetch.mock.calls.map(([u]) => u).find((u) => u.includes('fills-by-card'))
      expect(url).toContain('date_from=2026-09-01')
    })
  })
})
