/**
 * Тесты окна «Показания уровнемеров»: запрос, графика ёмкостей и слежение за наливом
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { renderWithProviders } from '../../test/utils/test-utils'
import TankLevelsModal, { WATCH_INTERVAL_MS } from '../TankLevelsModal'

const mockAuthFetch = vi.fn()
vi.mock('../../utils/api', () => ({
  authFetch: (...args) => mockAuthFetch(...args)
}))

const mockError = vi.fn()
vi.mock('../ToastContainer', () => ({
  useToast: () => ({ success: vi.fn(), error: mockError })
}))

const makeResponse = (body, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body })

const tank = (overrides) => ({
  id: 5,
  provider_id: 3,
  template_id: 4,
  azs_code: '1016201',
  tank_number: 1,
  source_name: 'Емкость 1 - 1016201',
  fuel_type: 'АИ-92',
  capacity_liters: 30000,
  is_active: true,
  last_measured_at: '2026-09-17T10:46:31',
  last_volume: 16359.86,
  last_mass: 12516.2,
  last_density: 765.05,
  last_temperature: 14.49,
  last_water: 0,
  age_minutes: 0,
  warnings: [],
  ...overrides,
})

const station = (dieselVolume = 12492.68, extra = {}) => ({
  azs_code: '1016201',
  azs_codes: ['1016201', '807211'],
  provider_id: 3,
  provider_name: 'МАЗС',
  live_available: true,
  fuels: [],
  tanks: [
    tank(),
    tank({ id: 6, tank_number: 2, source_name: 'Емкость 2 - 1016201', fuel_type: 'ДТ', is_active: false, last_volume: 3322.63 }),
    tank({ id: 7, azs_code: '807211', source_name: 'Емкость 1 - 807211', fuel_type: 'ДТ', last_volume: dieselVolume, last_mass: dieselVolume * 0.8326, last_density: 832.6 }),
  ],
  ...extra,
})

const liveReply = (dieselVolume) => makeResponse({
  station: station(dieselVolume),
  devices: [
    { azs_code: '1016201', status: 'success', tanks_updated: 2 },
    { azs_code: '807211', status: 'success', tanks_updated: 1 },
  ],
})

describe('TankLevelsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('при открытии запрашивает показания и рисует используемые ёмкости', async () => {
    mockAuthFetch.mockResolvedValue(liveReply(12492.68))
    const onStationUpdate = vi.fn()
    renderWithProviders(
      <TankLevelsModal station={station()} isOpen onClose={vi.fn()} onStationUpdate={onStationUpdate} />
    )

    expect(screen.getByText('Показания уровнемеров — 1016201 · 807211')).toBeInTheDocument()
    await waitFor(() => expect(onStationUpdate).toHaveBeenCalled())
    const [url, options] = mockAuthFetch.mock.calls[0]
    expect(url).toContain('/api/v1/tanks/live?provider_id=3&azs_code=1016201')
    expect(options).toMatchObject({ method: 'POST' })

    const panels = screen.getAllByTestId('tank-level')
    expect(panels).toHaveLength(2)
    expect(within(panels[1]).getByText('ДТ')).toBeInTheDocument()
    expect(within(panels[1]).getByRole('img', { name: 'ДТ: заполнено на 42%' })).toBeInTheDocument()
    expect(screen.getByTestId('levels-status')).toHaveTextContent('Показания получены только что')

    fireEvent.click(screen.getByLabelText(/Отображать неиспользуемые ёмкости \(1\)/))
    expect(screen.getAllByTestId('tank-level')).toHaveLength(3)
  })

  it('следит за наливом: опрашивает по таймеру и считает, сколько пришло', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let volume = 12000
    mockAuthFetch.mockImplementation(() => Promise.resolve(liveReply(volume)))
    let current = station(12000)
    const { rerender } = renderWithProviders(
      <TankLevelsModal station={current} isOpen onClose={vi.fn()} onStationUpdate={(s) => { current = s }} />
    )
    await waitFor(() => expect(mockAuthFetch).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: /Следить за наливом/ }))
    await waitFor(() => expect(mockAuthFetch).toHaveBeenCalledTimes(2))
    rerender(<TankLevelsModal station={current} isOpen onClose={vi.fn()} onStationUpdate={(s) => { current = s }} />)
    expect(screen.getByRole('button', { name: /Остановить слежение/ })).toBeInTheDocument()

    volume = 13250
    await act(async () => { await vi.advanceTimersByTimeAsync(WATCH_INTERVAL_MS + 100) })
    await waitFor(() => expect(mockAuthFetch).toHaveBeenCalledTimes(3))
    rerender(<TankLevelsModal station={current} isOpen onClose={vi.fn()} onStationUpdate={(s) => { current = s }} />)

    await waitFor(() => {
      const arrivals = screen.getAllByTestId('tank-arrival')
      const diesel = arrivals.find((node) => node.textContent.includes('было 12'))
      expect(diesel).toHaveTextContent(/\+1\s250 л/)
    })
    expect(screen.getByTestId('watch-summary')).toHaveTextContent(/ДТ: \+1\s250 л/)

    fireEvent.click(screen.getByRole('button', { name: /Остановить слежение/ }))
    expect(screen.getByTestId('watch-summary')).toHaveTextContent('Слежение остановлено')
    expect(screen.getAllByText('Итог налива').length).toBeGreaterThan(0)
  })

  it('на АЗС без живого опроса показывает последние замеры и объясняет, почему кнопки недоступны', async () => {
    renderWithProviders(
      <TankLevelsModal station={station(12492.68, { live_available: false })} isOpen onClose={vi.fn()} onStationUpdate={vi.fn()} />
    )
    expect(screen.getByRole('button', { name: /Запросить показания/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Следить за наливом/ })).toBeDisabled()
    expect(screen.getByTestId('levels-status')).toHaveTextContent('опрос уровнемеров по запросу пока недоступен')
    expect(screen.getAllByTestId('tank-level')).toHaveLength(2)
    expect(mockAuthFetch).not.toHaveBeenCalled()
  })

  it('сообщает, если уровнемеры не ответили', async () => {
    mockAuthFetch.mockResolvedValue(makeResponse({
      station: station(),
      devices: [
        { azs_code: '1016201', status: 'failed', error: 'Контроллер 1016201 не ответил за 20 с — возможно, нет связи с АЗС' },
        { azs_code: '807211', status: 'failed', error: 'Контроллер 807211 не ответил за 20 с — возможно, нет связи с АЗС' },
      ],
    }))
    renderWithProviders(<TankLevelsModal station={station()} isOpen onClose={vi.fn()} onStationUpdate={vi.fn()} />)

    await waitFor(() => expect(screen.getByTestId('levels-status')).toHaveTextContent('Контроллер 1016201 не ответил'))
    fireEvent.click(screen.getByRole('button', { name: /Запросить показания/ }))
    await waitFor(() => expect(mockError).toHaveBeenCalled())
  })
})
