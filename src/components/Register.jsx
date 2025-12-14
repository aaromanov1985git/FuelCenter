import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from './ToastContainer'
import FormField from './FormField'
import { useFormValidation } from '../hooks/useFormValidation'
import { Card, Button, Select } from './ui'
import logo from '../assets/logo.svg'
import './Login.css'

const Register = ({ onSuccess, onCancel }) => {
  const { register, user: currentUser } = useAuth()
  const { success, error: showError } = useToast()
  const [loading, setLoading] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Проверяем, является ли текущий пользователь администратором
  const isAdmin = currentUser && (currentUser.role === 'admin' || currentUser.is_superuser)

  const validationRules = {
    username: {
      required: true,
      minLength: 3,
      message: 'Имя пользователя должно быть не менее 3 символов'
    },
    email: {
      required: true,
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      message: 'Введите корректный email адрес'
    },
    password: {
      required: true,
      minLength: 8,
      message: 'Пароль должен быть не менее 8 символов'
    },
    confirmPassword: {
      required: true,
      message: 'Пароли не совпадают'
    },
    role: {
      required: true
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
  } = useFormValidation({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'user'
  }, validationRules)

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!isAdmin) {
      showError('Только администраторы могут регистрировать новых пользователей')
      return
    }

    // Проверяем совпадение паролей
    if (values.password !== values.confirmPassword) {
      showError('Пароли не совпадают')
      return
    }

    if (!validateForm()) {
      return
    }

    setLoading(true)

    const result = await register(values.username, values.email, values.password, values.role)

    setLoading(false)

    if (result.success) {
      success(`Пользователь ${result.user.username} успешно зарегистрирован`)
      resetForm()
      if (onSuccess) {
        onSuccess()
      }
    } else {
      showError(result.error || 'Ошибка регистрации')
    }
  }

  const roleOptions = [
    { value: 'user', label: 'Пользователь' },
    { value: 'admin', label: 'Администратор' },
    { value: 'viewer', label: 'Наблюдатель' }
  ]

  const handleRoleChange = (selectedValue) => {
    handleChange({ target: { name: 'role', value: selectedValue } })
  }

  if (!isAdmin) {
    return (
      <div className="login-container">
        <div className="login-background">
          <div className="login-background-circle login-background-circle-1"></div>
          <div className="login-background-circle login-background-circle-2"></div>
          <div className="login-background-circle login-background-circle-3"></div>
        </div>

        <div className={`login-content ${mounted ? 'login-content-visible' : ''}`}>
          <div className={`login-logo-wrapper ${mounted ? 'login-logo-visible' : ''}`}>
            <img src={logo} alt="GSM Logo" className="login-logo" />
            <div className="login-logo-glow"></div>
          </div>

          <Card className={`login-card ${mounted ? 'login-card-visible' : ''}`}>
            <Card.Header>
              <Card.Title className="login-title-animated">Доступ запрещен</Card.Title>
              <p className="login-subtitle login-subtitle-animated">
                Только администраторы могут регистрировать новых пользователей
              </p>
            </Card.Header>

            <Card.Body>
              {onCancel && (
                <div className={`login-button-wrapper ${mounted ? 'login-button-visible' : ''}`} style={{ animationDelay: '0.2s' }}>
                  <Button onClick={onCancel} variant="secondary" fullWidth className="login-submit-button">
                    Закрыть
                  </Button>
                </div>
              )}
            </Card.Body>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="login-container">
      <div className="login-background">
        <div className="login-background-circle login-background-circle-1"></div>
        <div className="login-background-circle login-background-circle-2"></div>
        <div className="login-background-circle login-background-circle-3"></div>
      </div>

      <div className={`login-content ${mounted ? 'login-content-visible' : ''}`}>
        <div className={`login-logo-wrapper ${mounted ? 'login-logo-visible' : ''}`}>
          <img src={logo} alt="GSM Logo" className="login-logo" />
          <div className="login-logo-glow"></div>
        </div>

        <Card className={`login-card ${mounted ? 'login-card-visible' : ''}`}>
          <Card.Header>
            <Card.Title className="login-title-animated">Регистрация нового пользователя</Card.Title>
          </Card.Header>

          <Card.Body>
            <form onSubmit={handleSubmit} className="login-form">
              <FormField
                label="Имя пользователя"
                name="username"
                type="text"
                value={values.username}
                onChange={handleChange}
                onBlur={handleBlur}
                error={touched.username && errors.username ? errors.username : ''}
                touched={touched.username}
                required
                autoComplete="username"
                className={`login-form-field ${mounted ? 'login-form-field-visible' : ''}`}
                style={{ animationDelay: '0.2s' }}
              />

              <FormField
                label="Email"
                name="email"
                type="email"
                value={values.email}
                onChange={handleChange}
                onBlur={handleBlur}
                error={touched.email && errors.email ? errors.email : ''}
                touched={touched.email}
                required
                autoComplete="email"
                className={`login-form-field ${mounted ? 'login-form-field-visible' : ''}`}
                style={{ animationDelay: '0.25s' }}
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
                autoComplete="new-password"
                className={`login-form-field ${mounted ? 'login-form-field-visible' : ''}`}
                style={{ animationDelay: '0.3s' }}
              />

              <FormField
                label="Подтверждение пароля"
                name="confirmPassword"
                type="password"
                value={values.confirmPassword}
                onChange={handleChange}
                onBlur={handleBlur}
                error={touched.confirmPassword && errors.confirmPassword ? errors.confirmPassword : ''}
                touched={touched.confirmPassword}
                required
                autoComplete="new-password"
                className={`login-form-field ${mounted ? 'login-form-field-visible' : ''}`}
                style={{ animationDelay: '0.35s' }}
              />

              <div className={`login-form-field ${mounted ? 'login-form-field-visible' : ''}`} style={{ animationDelay: '0.4s' }}>
                <Select
                  label="Роль"
                  name="role"
                  options={roleOptions}
                  value={values.role}
                  onChange={handleRoleChange}
                  onBlur={handleBlur}
                  error={touched.role && errors.role ? errors.role : undefined}
                  helperText={touched.role && errors.role ? errors.role : undefined}
                  required
                  fullWidth
                />
              </div>

              <div className={`login-button-wrapper ${mounted ? 'login-button-visible' : ''}`} style={{ animationDelay: '0.5s' }}>
                <Button
                  type="submit"
                  variant="primary"
                  loading={loading}
                  disabled={loading}
                  fullWidth
                  className="login-submit-button"
                >
                  {loading ? 'Регистрация...' : 'Зарегистрировать'}
                </Button>
              </div>

              {onCancel && (
                <div className={`login-button-wrapper ${mounted ? 'login-button-visible' : ''}`} style={{ animationDelay: '0.55s' }}>
                  <Button
                    type="button"
                    onClick={onCancel}
                    variant="secondary"
                    fullWidth
                    className="login-submit-button"
                  >
                    Отмена
                  </Button>
                </div>
              )}
            </form>
          </Card.Body>
        </Card>
      </div>
    </div>
  )
}

export default Register