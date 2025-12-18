import React, { useState } from 'react'
import { useToast } from './ToastContainer'
import FormField from './FormField'
import { useFormValidation } from '../hooks/useFormValidation'
import { Card, Button } from './ui'
import { getApiUrl } from '../utils/api'
import './Login.css'

const ForgotPassword = ({ onSuccess, onCancel }) => {
  const { success, error: showError } = useToast()
  const [loading, setLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  const validationRules = {
    email: {
      required: true,
      pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      message: 'Введите корректный email адрес'
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
  } = useFormValidation({ email: '' }, validationRules)

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setLoading(true)

    try {
      const API_URL = getApiUrl()
      const response = await fetch(`${API_URL}/api/v1/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: values.email })
      })

      const data = await response.json()

      if (response.ok) {
        success('Инструкции по восстановлению пароля отправлены на ваш email')
        setEmailSent(true)
        resetForm()
        if (onSuccess) {
          setTimeout(() => onSuccess(), 3000)
        }
      } else {
        showError(data.detail || 'Ошибка при отправке запроса. Пожалуйста, свяжитесь с администратором.')
      }
    } catch (error) {
      showError('Ошибка при отправке запроса. Пожалуйста, свяжитесь с администратором: AAromanov@starwayp.com')
    } finally {
      setLoading(false)
    }
  }

  if (emailSent) {
    return (
      <div className="login-container">
        <div className="login-content">
          <Card variant="elevated" className="login-card">
            <Card.Body className="login-card-body">
              <div className="login-card-header-inline">
                <h1 className="login-form-title">Проверьте почту</h1>
                <p className="login-form-subtitle">
                  Инструкции по восстановлению пароля отправлены на {values.email || 'ваш email'}
                </p>
              </div>

              <div style={{ marginBottom: '20px', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>
                <p>Если письмо не пришло, проверьте папку "Спам" или свяжитесь с администратором.</p>
              </div>

              {onCancel && (
                <Button
                  type="button"
                  onClick={onCancel}
                  variant="secondary"
                  fullWidth
                  className="login-submit-button"
                >
                  Вернуться к входу
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
              <h1 className="login-form-title">Восстановление пароля</h1>
            </div>

            <form onSubmit={handleSubmit} className="login-form">
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

              <Button
                type="submit"
                variant="primary"
                fullWidth
                loading={loading}
                disabled={loading}
                className="login-submit-button"
              >
                {loading ? 'Отправка...' : 'Отправить'}
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

export default ForgotPassword