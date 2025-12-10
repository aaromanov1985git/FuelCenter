import React from 'react'
import './EmptyState.css'

/**
 * Компонент пустого состояния
 * 
 * @param {string} title - Заголовок
 * @param {string} message - Сообщение
 * @param {React.ReactNode} icon - Иконка (опционально)
 * @param {React.ReactNode} action - Действие/кнопка (опционально)
 * @param {string} variant - Вариант: 'default', 'large', 'compact'
 */
const EmptyState = ({
  title,
  message,
  icon = null,
  action = null,
  variant = 'default'
}) => {
  return (
    <div className={`empty-state empty-state-${variant}`}>
      {icon && (
        <div className="empty-state-icon">
          {icon}
        </div>
      )}
      <h3 className="empty-state-title">{title}</h3>
      {message && (
        <p className="empty-state-message">{message}</p>
      )}
      {action && (
        <div className="empty-state-action">
          {action}
        </div>
      )}
    </div>
  )
}

export default EmptyState

