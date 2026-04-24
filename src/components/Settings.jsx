import React, { useState, useEffect } from 'react'
import { Button } from './ui'
import ConfirmModal from './ConfirmModal'
import ClearProviderModal from './ClearProviderModal'
import SystemLogsList from './SystemLogsList'
import UserActionLogsList from './UserActionLogsList'
import UploadPeriodLock from './UploadPeriodLock'
import ComponentsDemo from './ComponentsDemo'
import NormalizationSettings from './NormalizationSettings'
import CardInfoSchedulesList from './CardInfoSchedulesList'
import NotificationSettings from './NotificationSettings'
import BackupManagement from './BackupManagement'
import { useToast } from './ToastContainer'
import { authFetch } from '../utils/api'
import { logger } from '../utils/logger'
import './Settings.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

const Settings = () => {
  const { success, error: showError } = useToast()
  const [loading, setLoading] = useState(false)
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, type: null, title: '', message: '' })
  const [showClearProviderModal, setShowClearProviderModal] = useState(false)
  const [providers, setProviders] = useState([])
  const [activeSection, setActiveSection] = useState('cleanup') // 'cleanup', 'admin', 'appearance', 'normalization', 'card-info-schedules', 'notifications', 'backup'
  const [adminView, setAdminView] = useState(null) // 'system-logs', 'user-action-logs', 'period-lock', 'backup'
  const [appearanceView, setAppearanceView] = useState(null) // 'ui-components'
  const [fontSize, setFontSize] = useState(() => {
    // Загружаем сохраненный размер шрифта или используем 100% (базовый)
    const saved = localStorage.getItem('font-size')
    return saved ? parseFloat(saved) : 100
  })

  // Загрузка провайдеров
  useEffect(() => {
    const loadProviders = async () => {
      try {
        const response = await authFetch(`${API_URL}/api/v1/providers?limit=1000`)
        if (response.ok) {
          const result = await response.json()
          setProviders(result.items || [])
          logger.debug('Провайдеры загружены в Settings', { count: result.items?.length || 0 })
        }
      } catch (err) {
        logger.error('Ошибка загрузки провайдеров в Settings', { error: err.message })
      }
    }
    loadProviders()
  }, [])

  // Применение размера шрифта
  useEffect(() => {
    const root = document.documentElement
    root.style.fontSize = `${fontSize}%`
    localStorage.setItem('font-size', fontSize.toString())
  }, [fontSize])

  // Загрузка размера шрифта при монтировании
  useEffect(() => {
    const saved = localStorage.getItem('font-size')
    if (saved) {
      const size = parseFloat(saved)
      if (!isNaN(size) && size >= 75 && size <= 150) {
        document.documentElement.style.fontSize = `${size}%`
      }
    }
  }, [])

  const clearOptions = [
    {
      id: 'transactions',
      label: 'Транзакции',
      description: 'Удалить все транзакции или по провайдеру с фильтрацией по датам',
      icon: '📊',
      endpoint: '/api/v1/transactions/clear'
    },
    {
      id: 'cards',
      label: 'Карты',
      description: 'Удалить все топливные карты из базы данных',
      icon: '💳',
      endpoint: '/api/v1/fuel-cards/clear'
    },
    {
      id: 'gas-stations',
      label: 'АЗС',
      description: 'Удалить все АЗС из базы данных',
      icon: '⛽',
      endpoint: '/api/v1/gas-stations/clear'
    },
    {
      id: 'vehicles',
      label: 'ТС',
      description: 'Удалить все транспортные средства из базы данных',
      icon: '🚗',
      endpoint: '/api/v1/vehicles/clear'
    },
    {
      id: 'system-logs',
      label: 'Системные логи',
      description: 'Удалить все системные логи из базы данных',
      icon: '📋',
      endpoint: '/api/v1/logs/system/clear'
    },
    {
      id: 'user-action-logs',
      label: 'Действия пользователей',
      description: 'Удалить все логи действий пользователей из базы данных',
      icon: '👤',
      endpoint: '/api/v1/logs/user-actions/clear'
    },
    {
      id: 'upload-events',
      label: 'События загрузок',
      description: 'Удалить все события загрузок из базы данных',
      icon: '📤',
      endpoint: '/api/v1/upload-events/clear'
    }
  ]

  const handleClearClick = (option) => {
    // Для транзакций показываем модальное окно с выбором очистки по провайдеру
    if (option.id === 'transactions') {
      setShowClearProviderModal(true)
      return
    }

    // Для остальных - стандартное подтверждение
    setConfirmModal({
      isOpen: true,
      type: option.id,
      title: `Очистка: ${option.label}`,
      message: `Вы уверены, что хотите удалить все ${option.label.toLowerCase()}? Это действие нельзя отменить.`
    })
  }

  // Обработка очистки транзакций по провайдеру
  const handleConfirmClearProvider = async (params) => {
    try {
      setLoading(true)
      setShowClearProviderModal(false)

      // Формируем URL с параметрами
      const urlParams = new URLSearchParams({
        provider_id: params.provider_id.toString(),
        confirm: 'true'
      })

      if (params.date_from) {
        urlParams.append('date_from', params.date_from)
      }

      if (params.date_to) {
        urlParams.append('date_to', params.date_to)
      }

      const response = await authFetch(`${API_URL}/api/v1/transactions/clear-by-provider?${urlParams.toString()}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        let errorMessage = 'Ошибка очистки транзакций провайдера'
        try {
          const errorData = await response.json()
          if (typeof errorData === 'string') {
            errorMessage = errorData
          } else if (errorData.detail) {
            errorMessage = typeof errorData.detail === 'string' ? errorData.detail : JSON.stringify(errorData.detail)
          } else if (errorData.message) {
            errorMessage = typeof errorData.message === 'string' ? errorData.message : JSON.stringify(errorData.message)
          } else {
            errorMessage = JSON.stringify(errorData)
          }
        } catch (parseError) {
          errorMessage = `Ошибка ${response.status}: ${response.statusText}`
        }
        throw new Error(errorMessage)
      }

      const result = await response.json()
      const message = result.message || `Удалено транзакций: ${result.deleted_count}`
      success(message)
      logger.info('Очистка транзакций по провайдеру выполнена', { params, result })
    } catch (err) {
      let errorMessage = 'Ошибка очистки транзакций провайдера'
      if (err instanceof Error) {
        errorMessage = err.message
      } else if (typeof err === 'string') {
        errorMessage = err
      } else if (err && typeof err === 'object') {
        errorMessage = err.message || err.detail || JSON.stringify(err)
      }
      showError('Ошибка очистки транзакций провайдера: ' + errorMessage)
      logger.error('Ошибка очистки транзакций провайдера', { error: errorMessage, stack: err?.stack })
    } finally {
      setLoading(false)
    }
  }

  // Обработка очистки всех транзакций
  const handleClearAllTransactions = () => {
    setConfirmModal({
      isOpen: true,
      type: 'transactions',
      title: 'Подтверждение очистки базы данных',
      message: 'Вы уверены, что хотите очистить базу данных? Это действие удалит все транзакции и не может быть отменено.'
    })
  }

  const handleConfirmClear = async () => {
    const { type } = confirmModal
    const option = clearOptions.find(opt => opt.id === type)

    if (!option) {
      showError('Неизвестный тип данных для очистки')
      setConfirmModal({ isOpen: false, type: null, title: '', message: '' })
      return
    }

    try {
      setLoading(true)
      setConfirmModal({ isOpen: false, type: null, title: '', message: '' })

      const url = `${API_URL}${option.endpoint}?confirm=true`

      const response = await authFetch(url, {
        method: 'DELETE'
      })

      if (!response.ok) {
        let errorMessage = `Ошибка очистки ${option.label.toLowerCase()}`

        if (response.status === 404) {
          errorMessage = `Эндпоинт для очистки ${option.label.toLowerCase()} еще не реализован на сервере`
        } else {
          try {
            const errorData = await response.json()
            if (typeof errorData === 'string') {
              errorMessage = errorData
            } else if (errorData.detail) {
              errorMessage = typeof errorData.detail === 'string' ? errorData.detail : JSON.stringify(errorData.detail)
            } else if (errorData.message) {
              errorMessage = typeof errorData.message === 'string' ? errorData.message : JSON.stringify(errorData.message)
            } else {
              errorMessage = JSON.stringify(errorData)
            }
          } catch (parseError) {
            errorMessage = `Ошибка ${response.status}: ${response.statusText}`
          }
        }
        throw new Error(errorMessage)
      }

      let message = `Успешно очищено: ${option.label}`
      try {
        const result = await response.json()
        if (type === 'transactions') {
          message = result.message || `База данных очищена. Удалено транзакций: ${result.deleted_count}`
        } else {
          message = result.message || message
        }
      } catch (parseError) {
        logger.debug('Пустой ответ от сервера при очистке', { type })
      }

      success(message)
      logger.info(`Очистка ${option.label} выполнена`, { type })
    } catch (err) {
      let errorMessage = `Ошибка очистки ${option.label.toLowerCase()}`
      if (err instanceof Error) {
        errorMessage = err.message
      } else if (typeof err === 'string') {
        errorMessage = err
      } else if (err && typeof err === 'object') {
        errorMessage = err.message || err.detail || JSON.stringify(err)
      }
      showError(errorMessage)
      logger.error(`Ошибка очистки ${option.label}`, { error: errorMessage, stack: err?.stack })
    } finally {
      setLoading(false)
    }
  }

  const handleCancelClear = () => {
    setConfirmModal({ isOpen: false, type: null, title: '', message: '' })
  }

  // Sidebar tabs definition (icon = emoji/svg kept minimal to avoid extra deps)
  const sectionTabs = [
    { id: 'cleanup', label: 'Очистка', icon: '🧹' },
    { id: 'admin', label: 'Администрирование', icon: '🛡️' },
    { id: 'appearance', label: 'Внешний вид', icon: '🎨' },
    { id: 'normalization', label: 'Нормализация', icon: '🧭' },
    { id: 'card-info-schedules', label: 'Регламенты по картам', icon: '📅' },
    { id: 'notifications', label: 'Уведомления', icon: '🔔' },
  ]

  // Если открыт какой-то админский компонент, показываем его
  if (adminView) {
    let component = null
    switch (adminView) {
      case 'system-logs':
        component = <SystemLogsList />
        break
      case 'user-action-logs':
        component = <UserActionLogsList />
        break
      case 'period-lock':
        component = <UploadPeriodLock />
        break
      case 'backup':
        component = <BackupManagement />
        break
      default:
        component = null
    }

    return (
      <div className="settings-root">
        <div className="settings-header">
          <button
            className="settings-back-button"
            onClick={() => setAdminView(null)}
          >
            ← Назад к настройкам
          </button>
          <h1>Настройки</h1>
        </div>
        <div className="settings-sub-view">{component}</div>
      </div>
    )
  }

  // Если открыт какой-то компонент внешнего вида, показываем его
  if (appearanceView) {
    let component = null
    switch (appearanceView) {
      case 'ui-components':
        component = <ComponentsDemo />
        break
      default:
        component = null
    }

    return (
      <div className="settings-root">
        <div className="settings-header">
          <button
            className="settings-back-button"
            onClick={() => setAppearanceView(null)}
          >
            ← Назад к настройкам
          </button>
          <h1>Настройки</h1>
        </div>
        <div className="settings-sub-view">{component}</div>
      </div>
    )
  }

  return (
    <div className="settings-root">
      <div className="settings-topbar">
        <div className="settings-topbar-titles">
          <h1 className="settings-title">Настройки</h1>
          <div className="settings-subtitle">Конфигурация системы</div>
        </div>
      </div>

      {/* Left sidebar tabs */}
      <div className="settings-tabs" role="tablist" aria-label="Разделы настроек">
        {sectionTabs.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={activeSection === t.id}
            className={`settings-tab ${activeSection === t.id ? 'is-active' : ''}`}
            onClick={() => setActiveSection(t.id)}
          >
            <span className="settings-tab-icon" aria-hidden="true">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Right content column */}
      <div className="settings-content">
        {activeSection === 'cleanup' && (
          <div className="settings-section">
            <div className="settings-section-head">
              <h2 className="settings-section-title">Очистка</h2>
              <p className="settings-section-description">
                Очистка данных из базы. Внимание: эти действия необратимы.
              </p>
            </div>

            <div className="settings-grid">
              {clearOptions.map(option => (
                <div key={option.id} className="settings-option">
                  <div className="settings-option-top">
                    <div className="settings-option-icon" aria-hidden="true">{option.icon}</div>
                    <div className="settings-option-info">
                      <h3 className="settings-option-label">{option.label}</h3>
                      <p className="settings-option-desc">{option.description}</p>
                    </div>
                  </div>
                  {option.id === 'transactions' ? (
                    <div className="settings-option-actions">
                      <Button
                        variant="error"
                        size="md"
                        onClick={handleClearAllTransactions}
                        disabled={loading}
                      >
                        Очистить все
                      </Button>
                      <Button
                        variant="error"
                        size="md"
                        onClick={() => handleClearClick(option)}
                        disabled={loading}
                      >
                        По провайдеру
                      </Button>
                    </div>
                  ) : (
                    <div className="settings-option-actions">
                      <Button
                        variant="error"
                        size="md"
                        onClick={() => handleClearClick(option)}
                        disabled={loading}
                      >
                        Очистить
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSection === 'admin' && (
          <div className="settings-section">
            <div className="settings-section-head">
              <h2 className="settings-section-title">Администрирование</h2>
              <p className="settings-section-description">
                Управление логами и периодами загрузки
              </p>
            </div>

            <div className="settings-grid">
              <div
                className="settings-option is-clickable"
                onClick={() => setAdminView('system-logs')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setAdminView('system-logs') }}
              >
                <div className="settings-option-top">
                  <div className="settings-option-icon" aria-hidden="true">📋</div>
                  <div className="settings-option-info">
                    <h3 className="settings-option-label">Системные логи</h3>
                    <p className="settings-option-desc">Просмотр системных логов и ошибок</p>
                  </div>
                  <div className="settings-option-arrow" aria-hidden="true">→</div>
                </div>
              </div>

              <div
                className="settings-option is-clickable"
                onClick={() => setAdminView('user-action-logs')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setAdminView('user-action-logs') }}
              >
                <div className="settings-option-top">
                  <div className="settings-option-icon" aria-hidden="true">👤</div>
                  <div className="settings-option-info">
                    <h3 className="settings-option-label">Действия пользователей</h3>
                    <p className="settings-option-desc">История действий пользователей системы</p>
                  </div>
                  <div className="settings-option-arrow" aria-hidden="true">→</div>
                </div>
              </div>

              <div
                className="settings-option is-clickable"
                onClick={() => setAdminView('period-lock')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setAdminView('period-lock') }}
              >
                <div className="settings-option-top">
                  <div className="settings-option-icon" aria-hidden="true">🔒</div>
                  <div className="settings-option-info">
                    <h3 className="settings-option-label">Закрытие периода</h3>
                    <p className="settings-option-desc">Блокировка периодов для загрузки транзакций</p>
                  </div>
                  <div className="settings-option-arrow" aria-hidden="true">→</div>
                </div>
              </div>

              <div
                className="settings-option is-clickable"
                onClick={() => setAdminView('backup')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setAdminView('backup') }}
              >
                <div className="settings-option-top">
                  <div className="settings-option-icon" aria-hidden="true">💾</div>
                  <div className="settings-option-info">
                    <h3 className="settings-option-label">Резервное копирование</h3>
                    <p className="settings-option-desc">Управление резервными копиями базы данных</p>
                  </div>
                  <div className="settings-option-arrow" aria-hidden="true">→</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'normalization' && (
          <div className="settings-section">
            <div className="settings-embed">
              <NormalizationSettings />
            </div>
          </div>
        )}

        {activeSection === 'card-info-schedules' && (
          <div className="settings-section">
            <div className="settings-embed">
              <CardInfoSchedulesList />
            </div>
          </div>
        )}

        {activeSection === 'notifications' && (
          <div className="settings-section">
            <div className="settings-embed">
              <NotificationSettings />
            </div>
          </div>
        )}

        {activeSection === 'appearance' && (
          <div className="settings-section">
            <div className="settings-section-head">
              <h2 className="settings-section-title">Внешний вид</h2>
              <p className="settings-section-description">
                Настройте внешний вид интерфейса под свои предпочтения
              </p>
            </div>

            <div className="settings-font-row">
              <div className="settings-font-head">
                <div className="settings-row-info">
                  <div className="settings-row-title">Размер шрифта</div>
                  <div className="settings-row-desc">Измените размер шрифта для всего интерфейса</div>
                </div>
                <div className="settings-font-value">{fontSize}%</div>
              </div>
              <input
                type="range"
                min="75"
                max="150"
                step="5"
                value={fontSize}
                onChange={(e) => setFontSize(parseFloat(e.target.value))}
                className="settings-font-slider"
                aria-label="Размер шрифта"
              />
              <div className="settings-font-labels">
                <span>75%</span>
                <span>112.5%</span>
                <span>150%</span>
              </div>
            </div>

            <div
              className="settings-option is-clickable"
              onClick={() => setAppearanceView('ui-components')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setAppearanceView('ui-components') }}
              style={{ marginTop: 14 }}
            >
              <div className="settings-option-top">
                <div className="settings-option-icon" aria-hidden="true">🎨</div>
                <div className="settings-option-info">
                  <h3 className="settings-option-label">UI Компоненты</h3>
                  <p className="settings-option-desc">Демонстрация всех UI компонентов системы</p>
                </div>
                <div className="settings-option-arrow" aria-hidden="true">→</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={handleConfirmClear}
        onCancel={handleCancelClear}
        confirmText={confirmModal.type === 'transactions' ? 'Очистить БД' : 'Удалить'}
        cancelText="Отмена"
        variant="danger"
      />

      <ClearProviderModal
        isOpen={showClearProviderModal}
        onClose={() => setShowClearProviderModal(false)}
        onConfirm={handleConfirmClearProvider}
        providers={providers}
        loading={loading}
      />
    </div>
  )
}

export default Settings
