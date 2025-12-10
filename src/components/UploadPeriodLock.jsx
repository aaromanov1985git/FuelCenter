import React, { useState, useEffect } from 'react'
import ConfirmModal from './ConfirmModal'
import IconButton from './IconButton'
import './UploadPeriodLock.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

const UploadPeriodLock = () => {
  const [lockDate, setLockDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [currentLock, setCurrentLock] = useState(null)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)

  // Загрузка текущей даты закрытия периода
  const loadPeriodLock = async () => {
    setLoading(true)
    setError('')
    
    try {
      const response = await fetch(`${API_URL}/api/v1/upload-period-lock`)
      if (!response.ok) {
        if (response.status === 404) {
          // Период не закрыт
          setCurrentLock(null)
          setLockDate('')
          return
        }
        // Проверяем, является ли ответ JSON
        const contentType = response.headers.get('content-type')
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json()
          throw new Error(errorData.detail || 'Ошибка загрузки данных')
        } else {
          // Если не JSON, читаем как текст
          const errorText = await response.text()
          throw new Error(`Ошибка сервера: ${response.status} ${response.statusText}`)
        }
      }
      
      // Проверяем тип контента перед парсингом JSON
      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text()
        throw new Error(`Неожиданный формат ответа: ${text.substring(0, 100)}`)
      }
      
      const data = await response.json()
      if (data) {
        setCurrentLock(data)
        // Форматируем дату для input type="date" (YYYY-MM-DD)
        const dateStr = data.lock_date
        setLockDate(dateStr)
      } else {
        setCurrentLock(null)
        setLockDate('')
      }
    } catch (err) {
      setError('Ошибка загрузки: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPeriodLock()
  }, [])

  // Установка даты закрытия периода
  const handleSetLock = async () => {
    if (!lockDate) {
      setError('Укажите дату закрытия периода')
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch(`${API_URL}/api/v1/upload-period-lock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ lock_date: lockDate })
      })

      if (!response.ok) {
        const contentType = response.headers.get('content-type')
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json()
          throw new Error(errorData.detail || 'Ошибка установки даты закрытия периода')
        } else {
          const errorText = await response.text()
          throw new Error(`Ошибка сервера: ${response.status} ${response.statusText}`)
        }
      }

      const data = await response.json()
      setCurrentLock(data)
      setSuccess(`Период загрузки закрыт до ${formatDate(lockDate)}. Транзакции с датами раньше этой даты не могут быть загружены.`)
      setTimeout(() => setSuccess(''), 5000)
    } catch (err) {
      setError('Ошибка: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // Удаление даты закрытия периода (открытие периода)
  const handleRemoveLock = () => {
    setShowRemoveConfirm(true)
  }

  const handleConfirmRemoveLock = async () => {
    setLoading(true)
    setError('')
    setSuccess('')
    setShowRemoveConfirm(false)

    try {
      const response = await fetch(`${API_URL}/api/v1/upload-period-lock`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const contentType = response.headers.get('content-type')
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json()
          throw new Error(errorData.detail || 'Ошибка удаления даты закрытия периода')
        } else {
          const errorText = await response.text()
          throw new Error(`Ошибка сервера: ${response.status} ${response.statusText}`)
        }
      }

      setCurrentLock(null)
      setLockDate('')
      setSuccess('Период загрузки открыт. Теперь можно загружать транзакции с любыми датами.')
      setTimeout(() => setSuccess(''), 5000)
    } catch (err) {
      setError('Ошибка: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // Форматирование даты для отображения
  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    const date = new Date(dateStr + 'T00:00:00')
    return date.toLocaleDateString('ru-RU', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })
  }

  return (
    <div className="upload-period-lock">
      <h2>Закрытие периода загрузки</h2>
      <p className="description">
        Установите дату закрытия периода загрузки. Транзакции с датами раньше установленной даты не могут быть загружены в систему.
      </p>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {success && (
        <div className="success-message">
          {success}
        </div>
      )}

      <div className="lock-form">
        <div className="form-group">
          <label htmlFor="lockDate" className="form-label">
            Дата закрытия периода:
          </label>
          <input
            type="date"
            id="lockDate"
            value={lockDate}
            onChange={(e) => setLockDate(e.target.value)}
            className="form-input"
            disabled={loading}
          />
        </div>

        <div className="form-actions">
          <IconButton
            icon="save"
            variant="primary"
            onClick={handleSetLock}
            disabled={loading || !lockDate}
            title={currentLock ? 'Обновить дату' : 'Установить дату закрытия'}
            size="medium"
          />

          {currentLock && (
            <IconButton
              icon="clear"
              variant="error"
              onClick={handleRemoveLock}
              disabled={loading}
              title="Открыть период"
              size="medium"
            />
          )}
        </div>
      </div>

      {currentLock && (
        <div className="current-lock-info">
          <h3>Текущие настройки</h3>
          <div className="info-item">
            <strong>Дата закрытия периода:</strong> {formatDate(currentLock.lock_date)}
          </div>
          <div className="info-item">
            <strong>Установлено:</strong> {new Date(currentLock.created_at).toLocaleString('ru-RU')}
          </div>
          {currentLock.updated_at && currentLock.updated_at !== currentLock.created_at && (
            <div className="info-item">
              <strong>Обновлено:</strong> {new Date(currentLock.updated_at).toLocaleString('ru-RU')}
            </div>
          )}
        </div>
      )}

      {!currentLock && (
        <div className="no-lock-info">
          <p>Период загрузки не закрыт. Можно загружать транзакции с любыми датами.</p>
        </div>
      )}

      <ConfirmModal
        isOpen={showRemoveConfirm}
        title="Подтверждение открытия периода"
        message="Вы уверены, что хотите открыть период загрузки? Это позволит загружать транзакции с любыми датами."
        onConfirm={handleConfirmRemoveLock}
        onCancel={() => setShowRemoveConfirm(false)}
        confirmText="Открыть период"
        cancelText="Отмена"
        variant="warning"
      />
    </div>
  )
}

export default UploadPeriodLock
