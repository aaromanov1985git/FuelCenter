import React, { useState, useEffect, useCallback } from 'react'
import { Card, Button, Select, Skeleton } from './ui'
import Pagination from './Pagination'
import { useToast } from './ToastContainer'
import { authFetch } from '../utils/api'
import './NotificationsList.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

// Inline SVG icons matching the redesign reference
const TypeIcons = {
  error: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 5v4M8 11v.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  warning: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2l6 11H2L8 2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 7v3M8 12v.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  success: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 8l2.5 2.5L11 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  info: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 7v4M8 5v.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

const TYPE_META = {
  error:   { cssClass: 'notif-type-error',   label: 'Ошибка' },
  warning: { cssClass: 'notif-type-warning', label: 'Предупреждение' },
  success: { cssClass: 'notif-type-success', label: 'Успех' },
  info:    { cssClass: 'notif-type-info',    label: 'Информация' }
}

const CloseIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

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
    <div className="notif-root">
      <Card>
        <div className="notif-header">
          <h2 className="notif-title-h">
            <span>Уведомления</span>
            {unreadCount > 0 && (
              <span className="notif-unread-count" aria-label={`${unreadCount} непрочитанных`}>
                {unreadCount}
              </span>
            )}
          </h2>
          <div className="notif-actions">
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

        <div className="notif-filters">
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
          <div className="notif-skeleton">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} height="80px" style={{ marginBottom: '12px' }} />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="notif-empty">
            <div className="notif-empty-mark" aria-hidden="true">◈</div>
            <div className="notif-empty-text">Нет уведомлений</div>
          </div>
        ) : (
          <>
            <div className="notif-items">
              {notifications.map((notification) => {
                const meta = TYPE_META[notification.type] || TYPE_META.info
                const icon = TypeIcons[notification.type] || TypeIcons.info
                return (
                  <div
                    key={notification.id}
                    className={`notif-item ${notification.is_read ? 'is-read' : 'is-unread'} ${meta.cssClass}`}
                  >
                    {!notification.is_read && <div className="notif-item-accent" aria-hidden="true" />}
                    <div className="notif-item-icon" aria-hidden="true">
                      {icon}
                    </div>
                    <div className="notif-item-body">
                      <div className="notif-item-header">
                        <span className="notif-item-title t-value-sm">{notification.title}</span>
                        <span className={`notif-chip ${meta.cssClass}`}>{meta.label}</span>
                        {!notification.is_read && (
                          <span className="notif-chip notif-chip-new">Новое</span>
                        )}
                        {notification.category && (
                          <span className="notif-item-cat t-label">{notification.category}</span>
                        )}
                      </div>
                      <div className="notif-item-message">{notification.message}</div>
                      <div className="notif-item-date">{formatDate(notification.created_at)}</div>
                    </div>
                    <div className="notif-item-actions">
                      {!notification.is_read && (
                        <button
                          type="button"
                          className="notif-btn-mark"
                          title="Отметить как прочитанное"
                          onClick={() => markAsRead([notification.id])}
                        >
                          Прочитано
                        </button>
                      )}
                      <button
                        type="button"
                        className="notif-btn-remove"
                        title="Удалить"
                        aria-label="Удалить"
                        onClick={() => deleteNotification(notification.id)}
                      >
                        {CloseIcon}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {totalPages > 1 && (
              <div className="notif-pagination">
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
