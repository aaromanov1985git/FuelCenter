/**
 * Тесты для компонента Login
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

    expect(screen.getByPlaceholderText(/введите логин/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/введите пароль/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /войти/i })).toBeInTheDocument()
  })

  it('должен валидировать обязательные поля', async () => {
    renderWithProviders(<Login />)

    const submitButton = screen.getByRole('button', { name: /войти/i })
    fireEvent.click(submitButton)

    await waitFor(() => {
      // Проверяем, что форма не была отправлена (login не вызван)
      expect(mockLogin).not.toHaveBeenCalled()
    })
  })

  it('должен вызывать login при успешной валидации', async () => {
    mockLogin.mockResolvedValue({ success: true })

    renderWithProviders(<Login />)

    const usernameInput = screen.getByPlaceholderText(/введите логин/i)
    const passwordInput = screen.getByPlaceholderText(/введите пароль/i)
    const submitButton = screen.getByRole('button', { name: /войти/i })

    fireEvent.change(usernameInput, { target: { value: 'testuser' } })
    fireEvent.blur(usernameInput)
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.blur(passwordInput)
    
    fireEvent.click(submitButton)

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

    const usernameInput = screen.getByPlaceholderText(/введите логин/i)
    const passwordInput = screen.getByPlaceholderText(/введите пароль/i)
    const submitButton = screen.getByRole('button', { name: /войти/i })

    fireEvent.change(usernameInput, { target: { value: 'testuser' } })
    fireEvent.blur(usernameInput)
    fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } })
    fireEvent.blur(passwordInput)
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockError).toHaveBeenCalled()
    })
  })

  it('должен показывать кнопку регистрации', () => {
    renderWithProviders(<Login />)

    expect(screen.getByText(/нет аккаунта/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /зарегистрироваться/i })).toBeInTheDocument()
  })

  it('должен показывать ссылку "Забыли пароль?"', () => {
    renderWithProviders(<Login />)

    expect(screen.getByRole('button', { name: /забыли пароль/i })).toBeInTheDocument()
  })
})
