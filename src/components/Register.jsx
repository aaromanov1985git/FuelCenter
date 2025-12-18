import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from './ToastContainer'
import FormField from './FormField'
import { useFormValidation } from '../hooks/useFormValidation'
import { Card, Button, Select } from './ui'
import './Login.css'

const Register = ({ onSuccess, onCancel }) => {
  const { register, user: currentUser } = useAuth()
  const { success, error: showError } = useToast()
  const [loading, setLoading] = useState(false)

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
        <div className="login-content">
          <Card variant="elevated" className="login-card">
            <Card.Body className="login-card-body">
              <div className="login-card-header-inline">
                <h1 className="login-form-title">Доступ запрещен</h1>
                <p className="login-form-subtitle">
                  Только администраторы могут регистрировать новых пользователей
                </p>
              </div>

              {onCancel && (
                <Button onClick={onCancel} variant="primary" fullWidth className="login-submit-button">
                  Закрыть
                </Button>
              )}
            </Card.Body>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="login-container">
      <div className="login-content">
        <Card variant="elevated" className="login-card">
          <Card.Body className="login-card-body">
            <div className="login-card-header-inline">
              <h1 className="login-form-title">Регистрация нового пользователя</h1>
            </div>

            <form onSubmit={handleSubmit} className="login-form">
              <div className="login-form-group">
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
                  placeholder="Введите имя пользователя"
                  className="login-form-field"
                />
              </div>

              <div className="login-form-group">
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
                  placeholder="Введите email"
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
                  autoComplete="new-password"
                  placeholder="Введите пароль"
                  className="login-form-field"
                />
              </div>

              <div className="login-form-group">
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
                  placeholder="Подтвердите пароль"
                  className="login-form-field"
                />
              </div>

              <div className="login-form-group">
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

              {onCancel && (
                <Button
                  type="button"
                  onClick={onCancel}
                  variant="secondary"
                  fullWidth
                  className="login-submit-button"
                  style={{ marginTop: '12px' }}
                >
                  Отмена
                </Button>
              )}
            </form>
          </Card.Body>
        </Card>
      </div>
    </div>
  )
}

export default Register