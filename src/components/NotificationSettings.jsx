import React, { useState, useEffect } from 'react'
import { Card, Button, Input, Checkbox, Alert } from './ui'
import { useToast } from './ToastContainer'
import { authFetch } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import EmailServerSettings from './EmailServerSettings'
import './NotificationSettings.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

const NotificationSettings = () => {
  const { success, error: showError } = useToast()
  const { user } = useAuth()
  const isAdmin = user && (user.role === 'admin' || user.is_superuser)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState({
    email_enabled: true,
    telegram_enabled: false,
    push_enabled: true,
    in_app_enabled: true,
    telegram_chat_id: '',
    telegram_username: '',
    categories: {
      upload_events: true,
      errors: true,
      system: false,
      transactions: false
    }
  })

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    setLoading(true)
    try {
      const response = await authFetch(`${API_URL}/api/v1/notifications/settings`)
      if (!response.ok) {
        if (response.status === 404) {
          // Настройки не найдены, используем дефолтные
          console.log('Настройки не найдены, используем дефолтные значения')
          setLoading(false)
          return
        }
        if (response.status === 422) {
          // Ошибка валидации - возможно, настройки еще не созданы, используем дефолтные
          const errorData = await response.json().catch(() => ({}))
          console.warn('Ошибка валидации при загрузке настроек, используем дефолтные значения')
          console.warn('Детали ошибки валидации:', JSON.stringify(errorData, null, 2))
          if (errorData.detail && Array.isArray(errorData.detail)) {
            errorData.detail.forEach((err, idx) => {
              console.warn(`Ошибка валидации ${idx + 1}:`, err)
            })
          }
          setLoading(false)
          return
        }
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.detail || 'Не удалось загрузить настройки'
        console.error('Ошибка загрузки настроек:', errorMessage, errorData)
        throw new Error(errorMessage)
      }

      const data = await response.json()
      
      // Парсим categories, если это строка JSON или объект
      let categories = data.categories
      if (categories) {
        if (typeof categories === 'string') {
          try {
            categories = JSON.parse(categories)
          } catch (e) {
            console.warn('Не удалось распарсить categories:', e)
            categories = null
          }
        } else if (typeof categories === 'object' && categories !== null && !Array.isArray(categories)) {
          // Уже объект, используем как есть
          categories = categories
        } else {
          categories = null
        }
      }
      
      setSettings({
        email_enabled: data.email_enabled ?? true,
        telegram_enabled: data.telegram_enabled ?? false,
        push_enabled: data.push_enabled ?? true,
        in_app_enabled: data.in_app_enabled ?? true,
        telegram_chat_id: data.telegram_chat_id || '',
        telegram_username: data.telegram_username || '',
        categories: categories || {
          upload_events: true,
          errors: true,
          system: false,
          transactions: false
        }
      })
    } catch (err) {
      if (err.isUnauthorized) {
        setLoading(false)
        return
      }
      console.error('Ошибка загрузки настроек уведомлений:', err)
      showError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const saveSettings = async () => {
    setSaving(true)
    try {
      // Подготавливаем данные для отправки, убеждаемся что categories - объект
      const settingsToSave = {
        ...settings,
        categories: settings.categories || {
          upload_events: true,
          errors: true,
          system: false,
          transactions: false
        }
      }
      
      const response = await authFetch(`${API_URL}/api/v1/notifications/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(settingsToSave)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Не удалось сохранить настройки')
      }

      success('Настройки уведомлений сохранены')
    } catch (err) {
      if (err.isUnauthorized) {
        return
      }
      showError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleCategoryChange = (category, value) => {
    setSettings(prev => ({
      ...prev,
      categories: {
        ...(prev.categories || {}),
        [category]: value
      }
    }))
  }

  if (loading) {
    return (
      <Card>
        <div className="notification-settings-loading">
          <p>Загрузка настроек...</p>
        </div>
      </Card>
    )
  }

  // Гарантируем, что settings всегда инициализирован
  if (!settings || !settings.categories) {
    return (
      <Card>
        <div className="notification-settings-loading">
          <p>Загрузка настроек...</p>
        </div>
      </Card>
    )
  }

  return (
    <>
    <Card>
      <div className="notification-settings">
        <h2>Настройки уведомлений</h2>

        <div className="notification-settings-section">
          <h3>Каналы уведомлений</h3>
          
          <div className="notification-settings-channel">
            <Checkbox
              checked={settings.email_enabled ?? true}
              onChange={(checked) => setSettings(prev => ({ ...prev, email_enabled: checked }))}
              label="Email уведомления"
            />
            <p className="notification-settings-description">
              Получать уведомления на электронную почту
            </p>
          </div>

          <div className="notification-settings-channel">
            <Checkbox
              checked={settings.telegram_enabled ?? false}
              onChange={(checked) => setSettings(prev => ({ ...prev, telegram_enabled: checked }))}
              label="Telegram уведомления"
            />
            <p className="notification-settings-description">
              Получать уведомления в Telegram бот
            </p>
            {settings.telegram_enabled && (
              <div className="notification-settings-telegram-fields">
                <Input
                  type="text"
                  placeholder="ID чата Telegram"
                  value={settings.telegram_chat_id}
                  onChange={(e) => setSettings(prev => ({ ...prev, telegram_chat_id: e.target.value }))}
                  label="Chat ID"
                  style={{ marginTop: '0.5rem' }}
                />
                <Input
                  type="text"
                  placeholder="Имя пользователя Telegram"
                  value={settings.telegram_username}
                  onChange={(e) => setSettings(prev => ({ ...prev, telegram_username: e.target.value }))}
                  label="Username (опционально)"
                  style={{ marginTop: '0.5rem' }}
                />
                <Alert variant="info" style={{ marginTop: '0.5rem' }}>
                  Для получения Chat ID запустите бота в Telegram и отправьте команду /start, 
                  затем получите ID через @userinfobot или через API Telegram
                </Alert>
              </div>
            )}
          </div>

          <div className="notification-settings-channel">
            <Checkbox
              checked={settings.push_enabled ?? true}
              onChange={(checked) => setSettings(prev => ({ ...prev, push_enabled: checked }))}
              label="Push-уведомления"
            />
            <p className="notification-settings-description">
              Получать push-уведомления в браузере (требует разрешения)
            </p>
          </div>

          <div className="notification-settings-channel">
            <Checkbox
              checked={settings.in_app_enabled ?? true}
              onChange={(checked) => setSettings(prev => ({ ...prev, in_app_enabled: checked }))}
              label="Уведомления в системе"
            />
            <p className="notification-settings-description">
              Показывать уведомления внутри приложения
            </p>
          </div>
        </div>

        <div className="notification-settings-section">
          <h3>Категории уведомлений</h3>
          <p className="notification-settings-description">
            Выберите категории уведомлений, которые вы хотите получать
          </p>

          <div className="notification-settings-categories">
            <div className="notification-settings-category">
              <Checkbox
                checked={settings.categories && settings.categories.upload_events !== undefined ? settings.categories.upload_events : true}
                onChange={(checked) => handleCategoryChange('upload_events', checked)}
                label="Уведомления о загрузках"
              />
              <p className="notification-settings-category-desc">
                Уведомления о результатах загрузки файлов и данных
              </p>
            </div>

            <div className="notification-settings-category">
              <Checkbox
                checked={settings.categories && settings.categories.errors !== undefined ? settings.categories.errors : true}
                onChange={(checked) => handleCategoryChange('errors', checked)}
                label="Уведомления об ошибках"
              />
              <p className="notification-settings-category-desc">
                Уведомления о критических ошибках и проблемах
              </p>
            </div>

            <div className="notification-settings-category">
              <Checkbox
                checked={settings.categories && settings.categories.system !== undefined ? settings.categories.system : false}
                onChange={(checked) => handleCategoryChange('system', checked)}
                label="Системные уведомления"
              />
              <p className="notification-settings-category-desc">
                Общие системные уведомления и обновления
              </p>
            </div>

            <div className="notification-settings-category">
              <Checkbox
                checked={settings.categories && settings.categories.transactions !== undefined ? settings.categories.transactions : false}
                onChange={(checked) => handleCategoryChange('transactions', checked)}
                label="Уведомления о транзакциях"
              />
              <p className="notification-settings-category-desc">
                Уведомления, связанные с транзакциями ГСМ
              </p>
            </div>
          </div>
        </div>

        <div className="notification-settings-actions">
          <Button
            variant="primary"
            onClick={saveSettings}
            disabled={saving}
          >
            {saving ? 'Сохранение...' : 'Сохранить настройки'}
          </Button>
        </div>
      </div>
    </Card>

    {/* Настройки почтового сервера (только для администраторов) */}
    {isAdmin && (
      <div style={{ marginTop: '1.5rem' }}>
        <EmailServerSettings />
      </div>
    )}
    </>
  )
}

export default NotificationSettings

