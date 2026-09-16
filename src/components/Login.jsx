import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from './ToastContainer'
import { useFormValidation } from '../hooks/useFormValidation'
import Icon from './ui/Icon'
import Register from './Register'
import ForgotPassword from './ForgotPassword'
import './Login.css'

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
            {/* Маркер ошибки — alert, а не close: крестик здесь не кликабелен и
                читался как кнопка «закрыть баннер». */}
            <span className="login-alert-icon"><Icon name="alert" size={16} /></span>
            <span>{bannerError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form" noValidate data-testid="login-form">
          <div className="login-field">
            <label className="login-label" htmlFor="login-username">Логин</label>
            <div className={`input-wrap ${touched.username && errors.username ? 'is-error' : ''}`}>
              <span className="icon"><Icon name="user" size={14} strokeWidth={1.8} /></span>
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
              <span className="icon"><Icon name="lock" size={14} strokeWidth={1.8} /></span>
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
                {showPassword ? <Icon name="eye-off" size={16} /> : <Icon name="eye" size={16} />}
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
