import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from './ToastContainer'
import FormField from './FormField'
import { useFormValidation } from '../hooks/useFormValidation'
import './Login.css'

const Login = ({ onSuccess }) => {
  const { login } = useAuth()
  const { success, error: showError } = useToast()
  const [loading, setLoading] = useState(false)

  const validationRules = {
    username: {
      required: true,
      minLength: 3,
      message: 'Имя пользователя должно быть не менее 3 символов'
    },
    password: {
      required: true,
      minLength: 8,
      message: 'Пароль должен быть не менее 8 символов'
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

    if (!validateForm()) {
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
      showError(result.error || 'Ошибка входа')
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h2 className="login-title">Вход в систему</h2>
        <p className="login-subtitle">Введите свои учетные данные</p>

        <form onSubmit={handleSubmit} className="login-form">
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
            label="Пароль"
            name="password"
            type="password"
            value={values.password}
            onChange={handleChange}
            onBlur={handleBlur}
            error={touched.password && errors.password ? errors.password : ''}
            required
            autoComplete="current-password"
          />

          <button
            type="submit"
            className="login-button"
            disabled={loading}
          >
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default Login

