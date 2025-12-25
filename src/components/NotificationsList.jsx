import React, { useState, useEffect, useCallback } from 'react'
import { Card, Button, Badge, Select, Skeleton } from './ui'
import IconButton from './IconButton'
import Pagination from './Pagination'
import { useToast } from './ToastContainer'
import { authFetch } from '../utils/api'
import './NotificationsList.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

const NOTIFICATION_TYPE_COLORS = {
  info: 'blue',
  success: 'green',
  warning: 'yellow',
  error: 'red'
}

const NOTIFICATION_TYPE_ICONS = {
  info: 'ℹ️',
  success: '✓',
  warning: '⚠',
  error: '✗'
}

const NotificationsList = () => {
  const { success, error: showError } = useToast()
  const [notifications, setNotifications] = useState([])
  const [total, setTotal] = useState(0)
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [limit] = useState(50)
  const [filterRead, setFilterRead] = useState(null) // null = все, true = только прочитанные, false = только непрочитанные
  const [filterCategory, setFilterCategory] = useState('')
  const [filterType, setFilterType] = useState('')

  const loadNotifications = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('skip', ((currentPage - 1) * limit).toString())
      params.append('limit', limit.toString())
      if (filterRead !== null) {
        params.append('is_read', filterRead.toString())
      }
      if (filterCategory) {
        params.append('category', filterCategory)
      }
      if (filterType) {
        params.append('notification_type', filterType)
      }

      const response = await authFetch(`${API_URL}/api/v1/notifications?${params.toString()}`)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Не удалось загрузить уведомления')
      }

      const data = await response.json()
      setNotifications(data.items || [])
      setTotal(data.total || 0)
      setUnreadCount(data.unread_count || 0)
    } catch (err) {
      if (err.isUnauthorized) {
        return
      }
      showError(err.message)
    } finally {
      setLoading(false)
    }
  }, [currentPage, limit, filterRead, filterCategory, filterType, showError])

  useEffect(() => {
    loadNotifications()
  }, [loadNotifications])

  const markAsRead = async (notificationIds = null) => {
    try {
      const response = await authFetch(`${API_URL}/api/v1/notifications/mark-read`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          notification_ids: notificationIds
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Не удалось отметить уведомления как прочитанные')
      }

      success(notificationIds ? 'Уведомление отмечено как прочитанное' : 'Все уведомления отмечены как прочитанные')
      loadNotifications()
    } catch (err) {
      if (err.isUnauthorized) {
        return
      }
      showError(err.message)
    }
  }

  const deleteNotification = async (notificationId) => {
    try {
      const response = await authFetch(`${API_URL}/api/v1/notifications/${notificationId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Не удалось удалить уведомление')
      }

      success('Уведомление удалено')
      loadNotifications()
    } catch (err) {
      if (err.isUnauthorized) {
        return
      }
      showError(err.message)
    }
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'только что'
    if (diffMins < 60) return `${diffMins} мин. назад`
    if (diffHours < 24) return `${diffHours} ч. назад`
    if (diffDays < 7) return `${diffDays} дн. назад`

    return date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="notifications-list">
      <Card>
        <div className="notifications-list-header">
          <h2>Уведомления {unreadCount > 0 && <Badge color="red">{unreadCount}</Badge>}</h2>
          <div className="notifications-list-actions">
            {unreadCount > 0 && (
              <Button
                variant="secondary"
                size="small"
                onClick={() => markAsRead(null)}
              >
                Отметить все как прочитанные
              </Button>
            )}
          </div>
        </div>

        <div className="notifications-list-filters">
          <Select
            value={filterRead === null ? 'all' : (filterRead ? 'read' : 'unread')}
            onChange={(e) => {
              const value = e.target.value
              setFilterRead(value === 'all' ? null : value === 'read')
              setCurrentPage(1)
            }}
            style={{ width: '150px' }}
          >
            <option value="all">Все</option>
            <option value="unread">Непрочитанные</option>
            <option value="read">Прочитанные</option>
          </Select>

          <Select
            value={filterCategory}
            onChange={(e) => {
              setFilterCategory(e.target.value)
              setCurrentPage(1)
            }}
            style={{ width: '150px' }}
          >
            <option value="">Все категории</option>
            <option value="system">Системные</option>
            <option value="upload_events">Загрузки</option>
            <option value="errors">Ошибки</option>
            <option value="transactions">Транзакции</option>
          </Select>

          <Select
            value={filterType}
            onChange={(e) => {
              setFilterType(e.target.value)
              setCurrentPage(1)
            }}
            style={{ width: '150px' }}
          >
            <option value="">Все типы</option>
            <option value="info">Информация</option>
            <option value="success">Успех</option>
            <option value="warning">Предупреждение</option>
            <option value="error">Ошибка</option>
          </Select>
        </div>

        {loading ? (
          <div className="notifications-list-skeleton">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} height="80px" style={{ marginBottom: '12px' }} />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="notifications-list-empty">
            <p>Нет уведомлений</p>
          </div>
        ) : (
          <>
            <div className="notifications-list-items">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`notification-item ${notification.is_read ? 'read' : 'unread'}`}
                >
                  <div className="notification-item-content">
                    <div className="notification-item-header">
                      <span className="notification-type-icon">
                        {NOTIFICATION_TYPE_ICONS[notification.type] || 'ℹ️'}
                      </span>
                      <h3 className="notification-title">{notification.title}</h3>
                      <Badge color={NOTIFICATION_TYPE_COLORS[notification.type] || 'blue'} size="small">
                        {notification.type}
                      </Badge>
                      {!notification.is_read && (
                        <Badge color="red" size="small">Новое</Badge>
                      )}
                      <span className="notification-date">{formatDate(notification.created_at)}</span>
                    </div>
                    <p className="notification-message">{notification.message}</p>
                    {notification.category && (
                      <span className="notification-category">Категория: {notification.category}</span>
                    )}
                  </div>
                  <div className="notification-item-actions">
                    {!notification.is_read && (
                      <IconButton
                        icon="✓"
                        title="Отметить как прочитанное"
                        onClick={() => markAsRead([notification.id])}
                      />
                    )}
                    <IconButton
                      icon="🗑"
                      title="Удалить"
                      onClick={() => deleteNotification(notification.id)}
                    />
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="notifications-list-pagination">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                />
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  )
}

export default NotificationsList

