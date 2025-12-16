import React, { useState, useEffect } from 'react'
import './StatusIndicator.css'

/**
 * Компонент индикатора статуса (online/offline)
 * 
 * @param {string} apiUrl - URL API для проверки
 * @param {number} checkInterval - Интервал проверки в миллисекундах (по умолчанию 30000)
 * @param {boolean} showText - Показывать ли текст статуса
 */
const StatusIndicator = ({ 
  apiUrl = '', 
  checkInterval = 30000,
  showText = true 
}) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [apiStatus, setApiStatus] = useState('checking') // 'online', 'offline', 'checking'
  const [lastChecked, setLastChecked] = useState(null)

  // Отслеживание статуса сети браузера
  useEffect(() => {
    let abortController = null
    let timeoutId = null

    // Проверка статуса API
    const checkApiStatus = async () => {
      if (!apiUrl) {
        setApiStatus('online') // Если нет URL, считаем что онлайн
        return
      }

      // Отменяем предыдущий запрос, если он еще выполняется
      if (abortController) {
        abortController.abort()
      }

      abortController = new AbortController()
      timeoutId = setTimeout(() => abortController.abort(), 5000) // 5 секунд таймаут

      try {
        const response = await fetch(`${apiUrl}/health`, {
          method: 'GET',
          signal: abortController.signal,
          cache: 'no-cache'
        })

        clearTimeout(timeoutId)

        if (response.ok) {
          setApiStatus('online')
          setLastChecked(new Date())
        } else {
          setApiStatus('offline')
        }
      } catch (error) {
        // Игнорируем ошибки отмены запроса
        if (error.name !== 'AbortError') {
          setApiStatus('offline')
        }
      } finally {
        timeoutId = null
      }
    }

    const handleOnline = () => {
      setIsOnline(true)
      checkApiStatus()
    }

    const handleOffline = () => {
      setIsOnline(false)
      setApiStatus('offline')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Первоначальная проверка
    checkApiStatus()

    // Периодическая проверка статуса API
    const intervalId = setInterval(() => {
      if (isOnline) {
        checkApiStatus()
      }
    }, checkInterval)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(intervalId)
      // Отменяем активный запрос при unmount
      if (abortController) {
        abortController.abort()
      }
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [apiUrl, checkInterval, isOnline])

  const getStatusText = () => {
    if (!isOnline) return 'Офлайн'
    if (apiStatus === 'checking') return 'Проверка...'
    if (apiStatus === 'online') return 'Онлайн'
    return 'API недоступен'
  }

  const getStatusClass = () => {
    if (!isOnline || apiStatus === 'offline') return 'status-offline'
    if (apiStatus === 'checking') return 'status-checking'
    return 'status-online'
  }

  return (
    <div className={`status-indicator ${getStatusClass()}`} title={getStatusText()}>
      <span className="status-dot"></span>
      {showText && <span className="status-text">{getStatusText()}</span>}
    </div>
  )
}

export default StatusIndicator

