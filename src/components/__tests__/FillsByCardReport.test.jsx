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

// Функции тоста стабильны, как в ToastContainer (useCallback): иначе эффекты загрузки перезапускаются бесконечно
const mockToast = { success: vi.fn(), error: vi.fn() }
vi.mock('../ToastContainer', () => ({
  useToast: () => mockToast
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

const detail = {
  date_from: '2026-08-16',
  date_to: '2026-09-14',
  total: 3,
  truncated: false,
  items: [
    { id: 3, transaction_date: '2026-09-13T18:00:00', provider_name: 'МАЗС', card_number: '214 ИП Касумов 772', azs_number: '1016201', fuel_type: 'АИ-92', liters: 10 },
    { id: 2, transaction_date: '2026-09-13T09:00:00', provider_name: 'МАЗС', card_number: '214 ИП Касумов 772', azs_number: '1016201', fuel_type: 'АИ-92', liters: 10 },
    { id: 1, transaction_date: '2026-09-12T13:32:00', provider_name: 'МАЗС', card_number: '214 ИП Касумов 772', azs_number: '1016201', fuel_type: 'АИ-92', liters: 12 },
  ],
}

describe('FillsByCardReport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthFetch.mockImplementation((url) => {
      if (url.includes('/api/v1/reports/fills-by-card')) {
        return Promise.resolve(makeResponse({ ...report, providers: [{ id: 3, name: 'МАЗС' }], fuel_types: ['АИ-92', 'ДТ'] }))
      }
      if (url.includes('/api/v1/reports/fills?')) return Promise.resolve(makeResponse(detail))
      return Promise.resolve(makeResponse({ items: [] }))
    })
  })

  it('по клику на карту показывает её заправки по дням', async () => {
    renderWithProviders(<FillsByCardReport />)

    fireEvent.click(await screen.findByText('214 ИП Касумов 772'))
    const list = await screen.findByTestId('card-fills-detail')
    expect(list).toHaveTextContent('13.09.2026')
    expect(list).toHaveTextContent(/20 л из 20/)
    expect(list).toHaveTextContent('Лимит выбран')
    expect(list).toHaveTextContent('12.09.2026')

    const url = mockAuthFetch.mock.calls.map(([u]) => u).find((u) => u.includes('/api/v1/reports/fills?'))
    expect(decodeURIComponent(url.replace(/\+/g, ' '))).toContain('card_number=214 ИП Касумов 772')
    expect(url).toContain('provider_id=3')
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
