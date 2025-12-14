import React, { useState, useEffect } from 'react'
import { useToast } from './ToastContainer'
import FormField from './FormField'
import { useFormValidation } from '../hooks/useFormValidation'
import { Card, Button } from './ui'
import logo from '../assets/logo.svg'
import { getApiUrl } from '../utils/api'
import './Login.css'

const ForgotPassword = ({ onSuccess, onCancel }) => {
  const { success, error: showError } = useToast()
  const [loading, setLoading] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

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
              <Card.Title className="login-title-animated">Проверьте почту</Card.Title>
              <p className="login-subtitle login-subtitle-animated">
                Инструкции по восстановлению пароля отправлены на {values.email || 'ваш email'}
              </p>
            </Card.Header>

            <Card.Body>
              <div className="forgot-password-success">
                <p>Если письмо не пришло, проверьте папку "Спам" или свяжитесь с администратором.</p>
              </div>

              {onCancel && (
                <div className={`login-button-wrapper ${mounted ? 'login-button-visible' : ''}`} style={{ animationDelay: '0.2s' }}>
                  <Button
                    type="button"
                    onClick={onCancel}
                    variant="secondary"
                    fullWidth
                    className="login-submit-button"
                  >
                    Вернуться к входу
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
            <Card.Title className="login-title-animated">Восстановление пароля</Card.Title>
          </Card.Header>

          <Card.Body>
            <form onSubmit={handleSubmit} className="login-form">
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
                style={{ animationDelay: '0.2s' }}
              />

              <div className={`login-button-wrapper ${mounted ? 'login-button-visible' : ''}`} style={{ animationDelay: '0.3s' }}>
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
              </div>

              {onCancel && (
                <div className={`login-button-wrapper ${mounted ? 'login-button-visible' : ''}`} style={{ animationDelay: '0.4s' }}>
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

export default ForgotPassword