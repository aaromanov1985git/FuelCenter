import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from './ToastContainer'
import FormField from './FormField'
import { useFormValidation } from '../hooks/useFormValidation'
import { Card, Button } from './ui'
import logo from '../assets/logo.svg'
import Register from './Register'
import ForgotPassword from './ForgotPassword'
import './Login.css'

const Login = ({ onSuccess }) => {
  const { login } = useAuth()
  const { success, error: showError } = useToast()
  const [loading, setLoading] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [showRegister, setShowRegister] = useState(false)
  const [showForgotPassword, setShowForgotPassword] = useState(false)

  useEffect(() => {
    // Анимация появления после монтирования
    setMounted(true)
  }, [])

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

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Валидация перед отправкой
    if (!validateForm()) {
      // Фокус на первом поле с ошибкой
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
      if (onSuccess) {
        onSuccess()
      }
    } else {
      // Более информативное сообщение об ошибке
      const errorMessage = result.error || 'Неверный логин или пароль'
      showError(errorMessage)
      
      // Фокус на поле логина при ошибке входа
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

  return (
    <div className="login-container">
      {/* Анимированный фон */}
      <div className="login-background">
        <div className="login-background-circle login-background-circle-1"></div>
        <div className="login-background-circle login-background-circle-2"></div>
        <div className="login-background-circle login-background-circle-3"></div>
      </div>

      <div className={`login-content ${mounted ? 'login-content-visible' : ''}`}>
        {/* Логотип с анимацией */}
        <div className={`login-logo-wrapper ${mounted ? 'login-logo-visible' : ''}`}>
          <img src={logo} alt="GSM Logo" className="login-logo" />
          <div className="login-logo-glow"></div>
        </div>

        {/* Заголовок системы */}
        <div className={`login-header ${mounted ? 'login-header-visible' : ''}`}>
          <h1 className="login-title">GSM Converter</h1>
          <p className="login-subtitle">Система управления транзакциями ГСМ</p>
        </div>

        <Card className={`login-card ${mounted ? 'login-card-visible' : ''}`}>
          <Card.Header>
            <Card.Title className="login-title-animated">Вход в систему</Card.Title>
          </Card.Header>

          <Card.Body>
            <form onSubmit={handleSubmit} className="login-form">
              <FormField
                label="Логин"
                name="username"
                type="text"
                value={values.username}
                onChange={handleChange}
                onBlur={handleBlur}
                error={touched.username && errors.username ? errors.username : ''}
                touched={touched.username}
                required
                autoComplete="username"
                placeholder="Введите ваш логин"
                helperText={!touched.username || !errors.username ? 'Минимум 3 символа' : ''}
                className={`login-form-field ${mounted ? 'login-form-field-visible' : ''}`}
                style={{ animationDelay: '0.2s' }}
              />

              <FormField
                label="Пароль"
                name="password"
                type="password"
                value={values.password}
                onChange={handleChange}
                onBlur={handleBlur}
                error={touched.password && errors.password ? errors.password : ''}
                touched={touched.password}
                required
                autoComplete="current-password"
                placeholder="Введите ваш пароль"
                helperText={!touched.password || !errors.password ? 'Минимум 8 символов' : ''}
                className={`login-form-field ${mounted ? 'login-form-field-visible' : ''}`}
                style={{ animationDelay: '0.3s' }}
              />

              <div className="login-links">
                <button
                  type="button"
                  className="login-link-button"
                  onClick={() => setShowForgotPassword(true)}
                >
                  Забыли пароль?
                </button>
              </div>

              <div className={`login-button-wrapper ${mounted ? 'login-button-visible' : ''}`} style={{ animationDelay: '0.4s' }}>
                <Button
                  type="submit"
                  variant="primary"
                  fullWidth
                  loading={loading}
                  disabled={loading}
                  className="login-submit-button"
                >
                  {loading ? 'Вход...' : 'Войти'}
                </Button>
              </div>

              <div className="login-register-link">
                <button
                  type="button"
                  className="login-link-button"
                  onClick={() => setShowRegister(true)}
                >
                  Зарегистрироваться
                </button>
              </div>

              {/* TODO: Добавить CAPTCHA для защиты от брутфорса */}
              {/* <div className="login-captcha-wrapper">
                <ReCAPTCHA
                  sitekey="YOUR_RECAPTCHA_SITE_KEY"
                  onChange={handleCaptchaChange}
                />
              </div> */}
            </form>
          </Card.Body>
        </Card>
      </div>
    </div>
  )
}

export default Login

