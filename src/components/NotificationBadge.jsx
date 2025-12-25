import React from 'react'
import { Badge } from './ui'
import { useNotifications } from '../hooks/useNotifications'
import './NotificationBadge.css'

/**
 * Компонент для отображения счетчика непрочитанных уведомлений
 * Используется в навигации для показа количества новых уведомлений
 */
const NotificationBadge = ({ onClick, className = '' }) => {
  // onClick не используется в nav-item, но можно использовать для перехода
  if (onClick) {
    return (
      <div className={`notification-badge ${className}`} onClick={onClick}>
        <span className="notification-badge-icon">🔔</span>
        <NotificationCount />
      </div>
    )
  }

  return <NotificationCount className={className} />
}

const NotificationCount = ({ className = '' }) => {
  const { unreadCount, loading } = useNotifications(true, 30000) // Обновляем каждые 30 секунд

  if (loading || unreadCount === 0) {
    return null
  }

  return (
    <Badge color="red" size="small" className={`notification-badge-count ${className}`}>
      {unreadCount > 99 ? '99+' : unreadCount}
    </Badge>
  )
}

export default NotificationBadge

