import React, { useState, useEffect } from 'react'
import { Card, Button } from './ui'
import ConfirmModal from './ConfirmModal'
import ClearProviderModal from './ClearProviderModal'
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

  return (
    <div className="settings-container">
      <h1>Настройки</h1>
      
      <div className="settings-section">
        <h2 className="settings-section-title">Очистка</h2>
        <p className="settings-section-description">
          Очистка данных из базы. Внимание: эти действия необратимы.
        </p>

        <div className="clear-options-grid">
          {clearOptions.map(option => (
            <Card key={option.id} className="clear-option-card">
              <div className="clear-option-content">
                <div className="clear-option-icon">{option.icon}</div>
                <div className="clear-option-info">
                  <h3 className="clear-option-label">{option.label}</h3>
                  <p className="clear-option-description">{option.description}</p>
                </div>
                {option.id === 'transactions' ? (
                  <div className="clear-transactions-buttons">
                    <Button
                      variant="error"
                      size="md"
                      onClick={handleClearAllTransactions}
                      disabled={loading}
                      className="clear-option-button"
                    >
                      Очистить все
                    </Button>
                    <Button
                      variant="error"
                      size="md"
                      onClick={() => handleClearClick(option)}
                      disabled={loading}
                      className="clear-option-button"
                    >
                      По провайдеру
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="error"
                    size="md"
                    onClick={() => handleClearClick(option)}
                    disabled={loading}
                    className="clear-option-button"
                  >
                    Очистить
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
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