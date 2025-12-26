import React, { useState, useEffect } from 'react'
import { Card, Button, Input, Checkbox, Alert, Select } from './ui'
import { useToast } from './ToastContainer'
import { authFetch } from '../utils/api'
import './EmailServerSettings.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

// Пресеты для популярных почтовых серверов
const SMTP_PRESETS = {
  custom: { label: 'Свой сервер', host: '', port: 587, use_tls: true },
  gmail: { label: 'Gmail', host: 'smtp.gmail.com', port: 587, use_tls: true },
  yandex: { label: 'Yandex', host: 'smtp.yandex.ru', port: 587, use_tls: true },
  mailru: { label: 'Mail.ru', host: 'smtp.mail.ru', port: 587, use_tls: true },
  outlook: { label: 'Outlook/Office 365', host: 'smtp.office365.com', port: 587, use_tls: true },
}

const EmailServerSettings = () => {
  const { success, error: showError } = useToast()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [selectedPreset, setSelectedPreset] = useState('custom')
  
  const [settings, setSettings] = useState({
    email_enabled: false,
    smtp_host: '',
    smtp_port: 587,
    smtp_user: '',
    smtp_password: '',
    from_address: '',
    from_name: 'GSM Converter',
    use_tls: true
  })
  
  const [passwordChanged, setPasswordChanged] = useState(false)
  const [hasPassword, setHasPassword] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    setLoading(true)
    try {
      const response = await authFetch(`${API_URL}/api/v1/system-settings/email`)
      if (!response.ok) {
        if (response.status === 403) {
          showError('Доступ разрешен только администраторам')
          return
        }
        throw new Error('Не удалось загрузить настройки')
      }

      const data = await response.json()
      setSettings({
        email_enabled: data.email_enabled || false,
        smtp_host: data.smtp_host || '',
        smtp_port: data.smtp_port || 587,
        smtp_user: data.smtp_user || '',
        smtp_password: '', // Пароль не возвращается
        from_address: data.from_address || '',
        from_name: data.from_name || 'GSM Converter',
        use_tls: data.use_tls !== false
      })
      setHasPassword(data.smtp_password_set || false)
      
      // Определяем пресет по хосту
      const preset = Object.entries(SMTP_PRESETS).find(
        ([key, val]) => val.host === data.smtp_host
      )
      if (preset) {
        setSelectedPreset(preset[0])
      }
    } catch (err) {
      if (err.isUnauthorized) return
      console.error('Ошибка загрузки настроек email:', err)
      showError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handlePresetChange = (presetKey) => {
    setSelectedPreset(presetKey)
    const preset = SMTP_PRESETS[presetKey]
    if (preset && presetKey !== 'custom') {
      setSettings(prev => ({
        ...prev,
        smtp_host: preset.host,
        smtp_port: preset.port,
        use_tls: preset.use_tls
      }))
    }
  }

  const saveSettings = async () => {
    setSaving(true)
    try {
      const dataToSend = { ...settings }
      
      // Отправляем пароль только если он был изменен
      if (!passwordChanged) {
        delete dataToSend.smtp_password
      }
      
      const response = await authFetch(`${API_URL}/api/v1/system-settings/email`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSend)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Не удалось сохранить настройки')
      }

      success('Настройки почтового сервера сохранены')
      setPasswordChanged(false)
      if (settings.smtp_password) {
        setHasPassword(true)
      }
    } catch (err) {
      if (err.isUnauthorized) return
      showError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const testEmailSettings = async () => {
    if (!testEmail) {
      showError('Укажите email для тестовой отправки')
      return
    }
    
    setTesting(true)
    try {
      const response = await authFetch(`${API_URL}/api/v1/system-settings/email/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_email: testEmail })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Ошибка отправки тестового письма')
      }

      const result = await response.json()
      success(result.message || 'Тестовое письмо отправлено!')
    } catch (err) {
      if (err.isUnauthorized) return
      showError(err.message)
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <div className="email-settings-loading">
          <p>Загрузка настроек...</p>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <div className="email-server-settings">
        <h3>Настройки почтового сервера (SMTP)</h3>
        <p className="email-settings-description">
          Настройте SMTP сервер для отправки email уведомлений
        </p>

        <div className="email-settings-form">
          <div className="email-settings-row">
            <Checkbox
              checked={settings.email_enabled}
              onChange={(checked) => setSettings(prev => ({ ...prev, email_enabled: checked }))}
              label="Включить отправку email уведомлений"
            />
          </div>

          {settings.email_enabled && (
            <>
              <div className="email-settings-row">
                <label className="email-settings-label">Пресет сервера</label>
                <Select
                  options={Object.entries(SMTP_PRESETS).map(([key, preset]) => ({
                    value: key,
                    label: preset.label
                  }))}
                  value={selectedPreset}
                  onChange={(value) => handlePresetChange(value)}
                  className="email-settings-select"
                  placeholder="Выберите пресет..."
                />
              </div>

              <div className="email-settings-grid">
                <div className="email-settings-field">
                  <Input
                    label="SMTP сервер"
                    type="text"
                    placeholder="smtp.example.com"
                    value={settings.smtp_host}
                    onChange={(e) => setSettings(prev => ({ ...prev, smtp_host: e.target.value }))}
                  />
                </div>

                <div className="email-settings-field">
                  <Input
                    label="Порт"
                    type="number"
                    placeholder="587"
                    value={settings.smtp_port}
                    onChange={(e) => setSettings(prev => ({ ...prev, smtp_port: parseInt(e.target.value) || 587 }))}
                  />
                </div>
              </div>

              <div className="email-settings-grid">
                <div className="email-settings-field">
                  <Input
                    label="Логин (email)"
                    type="text"
                    placeholder="user@example.com"
                    value={settings.smtp_user}
                    onChange={(e) => setSettings(prev => ({ ...prev, smtp_user: e.target.value }))}
                  />
                </div>

                <div className="email-settings-field">
                  <Input
                    label={hasPassword && !passwordChanged ? "Пароль (установлен)" : "Пароль"}
                    type="password"
                    placeholder={hasPassword ? "••••••••" : "Введите пароль"}
                    value={settings.smtp_password}
                    onChange={(e) => {
                      setSettings(prev => ({ ...prev, smtp_password: e.target.value }))
                      setPasswordChanged(true)
                    }}
                  />
                </div>
              </div>

              <div className="email-settings-grid">
                <div className="email-settings-field">
                  <Input
                    label="Email отправителя"
                    type="email"
                    placeholder="noreply@example.com"
                    value={settings.from_address}
                    onChange={(e) => setSettings(prev => ({ ...prev, from_address: e.target.value }))}
                  />
                </div>

                <div className="email-settings-field">
                  <Input
                    label="Имя отправителя"
                    type="text"
                    placeholder="GSM Converter"
                    value={settings.from_name}
                    onChange={(e) => setSettings(prev => ({ ...prev, from_name: e.target.value }))}
                  />
                </div>
              </div>

              <div className="email-settings-row">
                <Checkbox
                  checked={settings.use_tls}
                  onChange={(checked) => setSettings(prev => ({ ...prev, use_tls: checked }))}
                  label="Использовать TLS шифрование"
                />
              </div>

              {selectedPreset === 'gmail' && (
                <Alert variant="info">
                  Для Gmail используйте пароль приложения. 
                  <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer">
                    Создать пароль приложения
                  </a>
                </Alert>
              )}

              <div className="email-settings-test">
                <h4>Тестовая отправка</h4>
                <div className="email-settings-test-row">
                  <Input
                    type="email"
                    placeholder="test@example.com"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <Button
                    variant="secondary"
                    onClick={testEmailSettings}
                    disabled={testing || !settings.smtp_host || !settings.smtp_user}
                  >
                    {testing ? 'Отправка...' : 'Отправить тест'}
                  </Button>
                </div>
              </div>
            </>
          )}

          <div className="email-settings-actions">
            <Button
              variant="primary"
              onClick={saveSettings}
              disabled={saving}
            >
              {saving ? 'Сохранение...' : 'Сохранить настройки'}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}

export default EmailServerSettings

