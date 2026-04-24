/**
 * Тесты для компонента Login
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test/utils/test-utils'
import Login from '../Login'

// Мокаем AuthContext
const mockLogin = vi.fn()
const mockUseAuth = vi.fn(() => ({
  login: mockLogin
}))

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth()
}))

// Мокаем ToastContainer
const mockSuccess = vi.fn()
const mockError = vi.fn()
const mockUseToast = vi.fn(() => ({
  success: mockSuccess,
  error: mockError
}))

vi.mock('../ToastContainer', () => ({
  useToast: () => mockUseToast()
}))

describe('Login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('должен отображать форму входа', () => {
    renderWithProviders(<Login />)

    expect(screen.getByTestId('login-username')).toBeInTheDocument()
    expect(screen.getByTestId('login-password')).toBeInTheDocument()
    expect(screen.getByTestId('login-submit')).toBeInTheDocument()
  })

  it('должен валидировать обязательные поля', async () => {
    renderWithProviders(<Login />)

    fireEvent.click(screen.getByTestId('login-submit'))

    await waitFor(() => {
      expect(mockLogin).not.toHaveBeenCalled()
    })
  })

  it('должен вызывать login при успешной валидации', async () => {
    mockLogin.mockResolvedValue({ success: true })

    renderWithProviders(<Login />)

    const usernameInput = screen.getByTestId('login-username')
    const passwordInput = screen.getByTestId('login-password')

    fireEvent.change(usernameInput, { target: { value: 'testuser' } })
    fireEvent.blur(usernameInput)
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.blur(passwordInput)

    fireEvent.click(screen.getByTestId('login-submit'))

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('testuser', 'password123')
    })
  })

  it('должен показывать ошибку при неудачном входе', async () => {
    mockLogin.mockResolvedValue({
      success: false,
      error: 'Неверный логин или пароль'
    })

    renderWithProviders(<Login />)

    const usernameInput = screen.getByTestId('login-username')
    const passwordInput = screen.getByTestId('login-password')

    fireEvent.change(usernameInput, { target: { value: 'testuser' } })
    fireEvent.blur(usernameInput)
    fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } })
    fireEvent.blur(passwordInput)
    fireEvent.click(screen.getByTestId('login-submit'))

    await waitFor(() => {
      expect(mockError).toHaveBeenCalled()
    })
  })

  it('должен показывать кнопку запроса доступа', () => {
    renderWithProviders(<Login />)

    expect(screen.getByText(/нет доступа/i)).toBeInTheDocument()
    expect(screen.getByTestId('login-register')).toBeInTheDocument()
  })

  it('должен показывать ссылку "Забыли?"', () => {
    renderWithProviders(<Login />)

    expect(screen.getByTestId('login-forgot')).toBeInTheDocument()
  })
})
