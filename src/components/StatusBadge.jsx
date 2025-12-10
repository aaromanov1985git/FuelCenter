import React from 'react'
import './StatusBadge.css'

/**
 * Компонент бейджа статуса с иконкой
 * 
 * @param {string} status - Статус: 'valid', 'invalid', 'pending', 'active', 'inactive', 'locked'
 * @param {string} text - Текст статуса (опционально, будет использован дефолтный)
 * @param {string} size - Размер: 'small', 'medium', 'large' (по умолчанию 'medium')
 * @param {string} className - Дополнительные CSS классы
 */
const StatusBadge = ({ status, text, size = 'medium', className = '' }) => {
  const statusConfig = {
    valid: {
      icon: '✅',
      defaultText: 'Валидно',
      class: 'status-valid'
    },
    invalid: {
      icon: '❌',
      defaultText: 'Ошибки',
      class: 'status-invalid'
    },
    pending: {
      icon: '⚠️',
      defaultText: 'Требует проверки',
      class: 'status-pending'
    },
    active: {
      icon: '✅',
      defaultText: 'Активен',
      class: 'status-active'
    },
    inactive: {
      icon: '⏸️',
      defaultText: 'Неактивен',
      class: 'status-inactive'
    },
    locked: {
      icon: '🔒',
      defaultText: 'Заблокировано',
      class: 'status-locked'
    }
  }

  const config = statusConfig[status] || statusConfig.pending
  const displayText = text || config.defaultText

  return (
    <span className={`status-badge status-badge-${size} ${config.class} ${className}`}>
      <span className="status-badge-icon">{config.icon}</span>
      <span className="status-badge-text">{displayText}</span>
    </span>
  )
}

export default StatusBadge

