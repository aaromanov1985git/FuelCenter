import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from './ToastContainer'
import { useFormValidation } from '../hooks/useFormValidation'
import { Button } from './ui'
import Register from './Register'
import ForgotPassword from './ForgotPassword'
import './Login.css'

const IconUser = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M2 14c0-3 2.5-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
)

const IconLock = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="currentColor" strokeWidth="1.4"/>
  </svg>
)

const IconEye = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.4"/>
    <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4"/>
  </svg>
)

const IconEyeOff = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d="M2 2l12 12M6.5 6.5A2 2 0 008 10a2 2 0 001.5-.5M4 4.5C2 6 1 8 1 8s2.5 5 7 5c1.2 0 2.3-.3 3.3-.8M7 3.1c.3 0 .6-.1 1-.1 4.5 0 7 5 7 5-.5 1-1 1.8-1.7 2.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
)

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

const Login = ({ onSuccess }) => {
  const { login } = useAuth()
  const { success, error: showError } = useToast()
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showRegister, setShowRegister] = useState(false)
  const [showForgotPassword, setShowForgotPassword] = useState(false)

  const {
    values,
    errors,
    touched,
    handleChange,
    handleBlur,
    validate: validateForm,
    reset: resetForm
  } = useFormValidation({ username: '', password: '' }, validationRules)

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
      if (onSuccess) onSuccess()
    } else {
      showError(result.error || 'Неверный логин или пароль')
      setTimeout(() => {
        document.querySelector('input[name="username"]')?.focus()
      }, 100)
    }
  }

  if (showRegister) {
    return (
      <Register
        onSuccess={() => { setShowRegister(false); if (onSuccess) onSuccess() }}
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

  const usernameError = touched.username && errors.username ? errors.username : ''
  const passwordError = touched.password && errors.password ? errors.password : ''

  return (
    <div className="login-bg">
      <div className="login-card" style={{ animation: 'fadeUp .4s ease' }}>

        {/* Логотип + заголовок */}
        <div className="login-header">
          <div className="login-logo">ГСМ</div>
          <h1 className="login-title">Вход в систему</h1>
          <p className="login-subtitle">Управление топливными картами</p>
        </div>

        <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Логин */}
          <div>
            <label className="login-label">Логин</label>
            <div className={`input-wrap${usernameError ? ' input-wrap--error' : ''}`}>
              <span className="input-icon"><IconUser /></span>
              <input
                name="username"
                type="text"
                value={values.username}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="Введите логин"
                autoComplete="username"
                autoFocus
              />
            </div>
            {usernameError && <p className="login-field-error">{usernameError}</p>}
          </div>

          {/* Пароль */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <label className="login-label" style={{ marginBottom: 0 }}>Пароль</label>
              <button
                type="button"
                className="login-link"
                onClick={() => setShowForgotPassword(true)}
              >
                Забыли?
              </button>
            </div>
            <div className={`input-wrap${passwordError ? ' input-wrap--error' : ''}`}>
              <span className="input-icon"><IconLock /></span>
              <input
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={values.password}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="••••••••"
                autoComplete="current-password"
              />
              <button
                type="button"
                className="input-toggle"
                onClick={() => setShowPassword(s => !s)}
                tabIndex={-1}
              >
                {showPassword ? <IconEyeOff /> : <IconEye />}
              </button>
            </div>
            {passwordError && <p className="login-field-error">{passwordError}</p>}
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            loading={loading}
            disabled={loading}
            className="login-submit-button"
          >
            {loading ? 'Вход…' : 'Войти'}
          </Button>
        </form>

        <div className="login-footer">
          Нет аккаунта?{' '}
          <button type="button" className="login-link" onClick={() => setShowRegister(true)}>
            Зарегистрироваться
          </button>
        </div>
      </div>

      <div className="login-version">ГСМ · Газпром · © 2026</div>
    </div>
  )
}

export default Login
