import { useState, useEffect, useCallback } from 'react'
import { authFetch } from '../utils/api'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

/**
 * Хук для работы с уведомлениями
 * Предоставляет счетчик непрочитанных уведомлений и функцию обновления
 */
export const useNotifications = (autoRefresh = true, refreshInterval = 30000) => {
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchUnreadCount = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.append('limit', '1')
      params.append('is_read', 'false')

      const response = await authFetch(`${API_URL}/api/v1/notifications?${params.toString()}`)
      
      if (!response.ok) {
        if (response.status === 401) {
          // Не авторизован - это нормально
          setUnreadCount(0)
          return
        }
        throw new Error('Не удалось загрузить счетчик уведомлений')
      }

      const data = await response.json()
      setUnreadCount(data.unread_count || 0)
    } catch (err) {
      if (!err.isUnauthorized) {
        setError(err.message)
        console.error('Ошибка загрузки счетчика уведомлений:', err)
      }
      setUnreadCount(0)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!autoRefresh) return

    // Загружаем сразу
    fetchUnreadCount()

    // Обновляем периодически
    const interval = setInterval(fetchUnreadCount, refreshInterval)

    return () => clearInterval(interval)
  }, [autoRefresh, refreshInterval, fetchUnreadCount])

  return {
    unreadCount,
    loading,
    error,
    refresh: fetchUnreadCount
  }
}

