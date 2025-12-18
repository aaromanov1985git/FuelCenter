import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from './ToastContainer'
import FormField from './FormField'
import { useFormValidation } from '../hooks/useFormValidation'
import { Card, Button } from './ui'
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
      <div className="login-content">
        <Card variant="elevated" className="login-card">
          <Card.Body className="login-card-body">
            {/* Заголовок */}
            <div className="login-card-header-inline">
              <h1 className="login-form-title">Конвертер ГСМ</h1>
              <p className="login-form-subtitle">Система управления транзакциями</p>
            </div>

              <form onSubmit={handleSubmit} className="login-form" noValidate>
                <div className="login-form-group">
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
                    placeholder="Введите логин"
                    className="login-form-field"
                  />
                </div>

                <div className="login-form-group">
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
                    placeholder="Введите пароль"
                    className="login-form-field"
                  />
                </div>

                <div className="login-form-actions">
                  <button
                    type="button"
                    className="login-link-button"
                    onClick={() => setShowForgotPassword(true)}
                  >
                    Забыли пароль?
                  </button>
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
                  {loading ? 'Вход...' : 'Войти'}
                </Button>

                <div className="login-register-section">
                  <span className="login-register-text">Нет аккаунта? </span>
                  <button
                    type="button"
                    className="login-link-button login-register-link"
                    onClick={() => setShowRegister(true)}
                  >
                    Зарегистрироваться
                  </button>
                </div>
              </form>
          </Card.Body>
        </Card>
      </div>
    </div>
  )
}

export default Login

