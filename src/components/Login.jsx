import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from './ToastContainer'
import { useFormValidation } from '../hooks/useFormValidation'
import Register from './Register'
import ForgotPassword from './ForgotPassword'
import './Login.css'

// Иконки SVG, имитирующие стиль reference
const UserIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.4" />
    <path d="M2 14c0-3 2.5-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.4" />
  </svg>
)

const LockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
    <path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="currentColor" strokeWidth="1.4" />
  </svg>
)

const EyeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M1.5 8s2.5-5 6.5-5 6.5 5 6.5 5-2.5 5-6.5 5S1.5 8 1.5 8z" stroke="currentColor" strokeWidth="1.4" />
    <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
  </svg>
)

const EyeOffIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M2 2l12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M6.5 3.5A7.5 7.5 0 018 3.5c4 0 6.5 4.5 6.5 4.5a12.7 12.7 0 01-1.9 2.4M10 10a2 2 0 01-2.8-2.8M3.4 5.4A12.3 12.3 0 001.5 8s2.5 5 6.5 5c1 0 1.9-.2 2.7-.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
)

const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
)

const Login = ({ onSuccess }) => {
  const { login } = useAuth()
  const { success, error: showError } = useToast()
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showRegister, setShowRegister] = useState(false)
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const validationRules = {
    username: {
      required: true,
      minLength: 3,
      message: 'Логин должен содержать не менее 3 символов'
    },
    password: {
      required: true,
      minLength: 8,
      message: 'Пароль должен содержать не менее 8 символов'
    }
  }

  const {
    values,
    errors,
    touched,
    handleChange,
    handleBlur,
    validate: validateForm,
    reset: resetForm
  } = useFormValidation({ username: '', password: '' }, validationRules)

  useEffect(() => {
    // Сбрасываем локальную ошибку при правке полей
    if (submitError && (values.username || values.password)) {
      setSubmitError('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.username, values.password])

  const firstInlineError =
    (touched.username && errors.username) ||
    (touched.password && errors.password) ||
    ''

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!validateForm()) {
      if (errors.username) {
        document.querySelector('input[name="username"]')?.focus()
      } else if (errors.password) {
        document.querySelector('input[name="password"]')?.focus()
      }
      return
    }

    setLoading(true)
    const result = await login(values.username, values.password)
    setLoading(false)

    if (result.success) {
      success('Успешный вход в систему')
      resetForm()
      setSubmitError('')
      if (onSuccess) onSuccess()
    } else {
      const errorMessage = result.error || 'Неверный логин или пароль'
      setSubmitError(errorMessage)
      showError(errorMessage)
      setTimeout(() => {
        document.querySelector('input[name="username"]')?.focus()
      }, 100)
    }
  }

  if (showRegister) {
    return (
      <Register
        onSuccess={() => {
          setShowRegister(false)
          if (onSuccess) onSuccess()
        }}
        onCancel={() => setShowRegister(false)}
      />
    )
  }

  if (showForgotPassword) {
    return (
      <ForgotPassword
        onSuccess={() => setShowForgotPassword(false)}
        onCancel={() => setShowForgotPassword(false)}
      />
    )
  }

  const bannerError = submitError || firstInlineError

  return (
    <div className="login-bg" data-testid="login-page">
      <div className="login-card" data-testid="login-card">
        <div className="login-header">
          <div className="login-logo" aria-hidden="true">ГСМ</div>
          <h1 className="login-title">Вход в систему</h1>
          <p className="login-subtitle">Управление топливными картами</p>
        </div>

        {bannerError && (
          <div className="login-alert" role="alert" data-testid="login-error">
            <span className="login-alert-icon"><CloseIcon /></span>
            <span>{bannerError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form" noValidate data-testid="login-form">
          <div className="login-field">
            <label className="login-label" htmlFor="login-username">Логин</label>
            <div className={`input-wrap ${touched.username && errors.username ? 'is-error' : ''}`}>
              <span className="icon"><UserIcon /></span>
              <input
                id="login-username"
                name="username"
                type="text"
                value={values.username}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="Введите логин"
                autoComplete="username"
                autoFocus
                required
                aria-invalid={Boolean(touched.username && errors.username)}
                data-testid="login-username"
              />
            </div>
          </div>

          <div className="login-field">
            <div className="login-label-row">
              <label className="login-label" htmlFor="login-password">Пароль</label>
              <button
                type="button"
                className="login-link"
                onClick={() => setShowForgotPassword(true)}
                data-testid="login-forgot"
              >
                Забыли?
              </button>
            </div>
            <div className={`input-wrap ${touched.password && errors.password ? 'is-error' : ''}`}>
              <span className="icon"><LockIcon /></span>
              <input
                id="login-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={values.password}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                aria-invalid={Boolean(touched.password && errors.password)}
                data-testid="login-password"
              />
              <button
                type="button"
                className="login-toggle-eye"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                data-testid="login-toggle-password"
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          <label className="login-remember">
            <input type="checkbox" data-testid="login-remember" />
            <span>Запомнить меня</span>
          </label>

          <button
            type="submit"
            className="login-submit"
            disabled={loading}
            data-testid="login-submit"
          >
            {loading && <span className="login-spinner" aria-hidden="true" />}
            {loading ? 'Вход…' : 'Войти'}
          </button>
        </form>

        <div className="login-footer-note">
          Нет доступа?{' '}
          <button
            type="button"
            className="login-link login-link-strong"
            onClick={() => setShowRegister(true)}
            data-testid="login-register"
          >
            Запросить
          </button>
        </div>
      </div>

      <div className="login-version" aria-hidden="true">
        ГСМ · Газпром · v2.0 · © 2026
      </div>
    </div>
  )
}

export default Login
