import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from './ToastContainer'
import FormField from './FormField'
import { useFormValidation } from '../hooks/useFormValidation'
import './Register.css'

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

  if (!isAdmin) {
    return (
      <div className="register-container">
        <div className="register-card">
          <p className="register-error">
            Только администраторы могут регистрировать новых пользователей
          </p>
          {onCancel && (
            <button onClick={onCancel} className="register-cancel-button">
              Закрыть
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="register-container">
      <div className="register-card">
        <h2 className="register-title">Регистрация нового пользователя</h2>
        <p className="register-subtitle">Заполните форму для создания нового пользователя</p>

        <form onSubmit={handleSubmit} className="register-form">
          <FormField
            label="Имя пользователя"
            name="username"
            type="text"
            value={values.username}
            onChange={handleChange}
            onBlur={handleBlur}
            error={touched.username && errors.username ? errors.username : ''}
            required
            autoComplete="username"
          />

          <FormField
            label="Email"
            name="email"
            type="email"
            value={values.email}
            onChange={handleChange}
            onBlur={handleBlur}
            error={touched.email && errors.email ? errors.email : ''}
            required
            autoComplete="email"
          />

          <FormField
            label="Пароль"
            name="password"
            type="password"
            value={values.password}
            onChange={handleChange}
            onBlur={handleBlur}
            error={touched.password && errors.password ? errors.password : ''}
            required
            autoComplete="new-password"
          />

          <FormField
            label="Подтверждение пароля"
            name="confirmPassword"
            type="password"
            value={values.confirmPassword}
            onChange={handleChange}
            onBlur={handleBlur}
            error={touched.confirmPassword && errors.confirmPassword ? errors.confirmPassword : ''}
            required
            autoComplete="new-password"
          />

          <div className="register-field">
            <label htmlFor="role" className="register-label">
              Роль <span className="required">*</span>
            </label>
            <select
              id="role"
              name="role"
              value={values.role}
              onChange={handleChange}
              onBlur={handleBlur}
              className={`register-select ${touched.role && errors.role ? 'error' : ''}`}
            >
              <option value="user">Пользователь</option>
              <option value="admin">Администратор</option>
              <option value="viewer">Наблюдатель</option>
            </select>
            {touched.role && errors.role && (
              <span className="register-error-text">{errors.role}</span>
            )}
          </div>

          <div className="register-buttons">
            <button
              type="submit"
              className="register-button"
              disabled={loading}
            >
              {loading ? 'Регистрация...' : 'Зарегистрировать'}
            </button>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="register-cancel-button"
              >
                Отмена
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

export default Register

