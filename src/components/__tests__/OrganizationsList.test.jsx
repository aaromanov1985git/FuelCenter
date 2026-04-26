/**
 * Тесты для компонента OrganizationsList
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../../test/utils/test-utils'
import OrganizationsList from '../OrganizationsList'

const mockAuthFetch = vi.fn()
vi.mock('../../utils/api', () => ({
  authFetch: (...args) => mockAuthFetch(...args)
}))

const mockSuccess = vi.fn()
const mockError = vi.fn()
vi.mock('../ToastContainer', () => ({
  useToast: () => ({ success: mockSuccess, error: mockError })
}))

const mockUseAuth = vi.fn(() => ({ user: { id: 1, role: 'admin' } }))
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth()
}))

const makeResponse = (body, ok = true) => ({
  ok,
  status: ok ? 200 : 500,
  json: async () => body
})

const setupHappyPath = (orgs = []) => {
  mockAuthFetch.mockImplementation((url) => {
    if (url.includes('/api/v1/organizations')) {
      return Promise.resolve(makeResponse({ items: orgs, total: orgs.length }))
    }
    return Promise.resolve(makeResponse({}))
  })
}

describe('OrganizationsList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuth.mockReturnValue({ user: { id: 1, role: 'admin' } })
  })

  it('показывает сообщение при отсутствии прав админа', () => {
    mockUseAuth.mockReturnValue({ user: { id: 2, role: 'user' } })
    setupHappyPath()

    renderWithProviders(<OrganizationsList />)

    expect(screen.getByText(/нет доступа к управлению организациями/i)).toBeInTheDocument()
  })

  it('рендерит список организаций для админа', async () => {
    setupHappyPath()
    renderWithProviders(<OrganizationsList />)

    await waitFor(() => {
      expect(screen.getByTestId('organizations-list')).toBeInTheDocument()
    })
    expect(screen.getByTestId('org-search-input')).toBeInTheDocument()
    expect(screen.getByTestId('org-add-btn')).toBeInTheDocument()
  })

  it('загружает организации при монтировании', async () => {
    setupHappyPath()
    renderWithProviders(<OrganizationsList />)

    await waitFor(() => {
      const urls = mockAuthFetch.mock.calls.map(c => c[0])
      expect(urls.some(u => u.includes('/api/v1/organizations'))).toBe(true)
    })
  })

  it('отображает загруженные организации в списке', async () => {
    setupHappyPath([
      { id: 1, name: 'ООО Ромашка', inn: '7701234567', is_active: true }
    ])

    renderWithProviders(<OrganizationsList />)

    await waitFor(() => {
      expect(screen.getByTestId('org-list-item-1')).toBeInTheDocument()
    })
  })

  it('обновляет запрос при вводе в поиск', async () => {
    setupHappyPath()
    renderWithProviders(<OrganizationsList />)

    await waitFor(() => expect(mockAuthFetch).toHaveBeenCalled())
    mockAuthFetch.mockClear()

    const input = screen.getByTestId('org-search-input')
    fireEvent.change(input, { target: { value: 'Ромашка' } })

    await waitFor(() => {
      const urls = mockAuthFetch.mock.calls.map(c => c[0])
      expect(urls.some(u => u.includes('search=%D0%A0%D0%BE%D0%BC%D0%B0%D1%88%D0%BA%D0%B0'))).toBe(true)
    })
  })

  it('показывает тост при ошибке загрузки', async () => {
    mockAuthFetch.mockResolvedValue(makeResponse({ detail: 'Ошибка сервера' }, false))

    renderWithProviders(<OrganizationsList />)

    await waitFor(() => {
      expect(mockError).toHaveBeenCalled()
    })
  })
})
