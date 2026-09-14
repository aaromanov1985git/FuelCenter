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

  describe('форма редактирования АЗС', () => {
    const station = {
      id: 76, azs_number: '505221', name: '505221', original_name: '505221', provider_id: 2, is_validated: 'valid',
      location: 'База АО "УТТ"', region: 'ХМАО-Ю', settlement: 'Нягань', latitude: null, longitude: null,
    }

    const openEditForm = async () => {
      setupHappyPath({ stations: [station], providers: [{ id: 2, name: 'КАЗС', is_active: true }] })
      renderWithProviders(<GasStationsList />)
      const editButtons = await screen.findAllByRole('button', { name: 'Редактировать' })
      fireEvent.click(editButtons[0])
      return screen.findByTestId('gas-station-edit-form')
    }

    const lastPut = () => mockAuthFetch.mock.calls.find(([url, options]) => url.includes('/api/v1/gas-stations/76') && options?.method === 'PUT')

    it('сохранять нечего, пока форма не изменена; адрес и регион не обязательны', async () => {
      await openEditForm()
      expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled()
      expect(screen.queryByLabelText(/Текущее название/)).not.toBeInTheDocument()
      expect(screen.getByLabelText(/Адрес/)).not.toBeRequired()
      expect(screen.getByLabelText(/Регион/)).not.toBeRequired()
      expect(screen.getByLabelText(/Номер АЗС/)).toBeRequired()
    })

    it('не отправляет форму без номера АЗС и объясняет почему', async () => {
      await openEditForm()
      fireEvent.change(screen.getByLabelText(/Номер АЗС/), { target: { value: '  ' } })
      fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
      expect(await screen.findByText(/по нему к АЗС привязываются транзакции/)).toBeInTheDocument()
      expect(lastPut()).toBeUndefined()
    })

    it('принимает координаты с запятой и раскладывает вставленную пару', async () => {
      await openEditForm()
      const latitude = screen.getByLabelText(/Широта/)
      fireEvent.paste(latitude, { clipboardData: { getData: () => '62.1456, 65.3895' } })
      expect(latitude).toHaveValue('62.1456')
      expect(screen.getByLabelText(/Долгота/)).toHaveValue('65.3895')

      fireEvent.change(screen.getByLabelText(/Долгота/), { target: { value: '65,39' } })
      fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

      await waitFor(() => expect(lastPut()).toBeTruthy())
      const body = JSON.parse(lastPut()[1].body)
      expect(body).toMatchObject({ latitude: 62.1456, longitude: 65.39, azs_number: '505221', settlement: 'Нягань' })
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
