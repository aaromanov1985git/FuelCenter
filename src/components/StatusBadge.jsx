import React from 'react'
import Icon from './ui/Icon'
import './StatusBadge.css'

/**
 * Компонент бейджа статуса с иконкой
 * 
 * @param {string} status - Статус: 'valid', 'invalid', 'pending', 'active', 'inactive', 'locked', 'success', 'failed', 'partial'
 * @param {string} text - Текст статуса (опционально, будет использован дефолтный)
 * @param {string} size - Размер: 'small', 'medium', 'large' (по умолчанию 'medium')
 * @param {string} className - Дополнительные CSS классы
 */
const StatusBadge = ({ status, text, size = 'medium', className = '' }) => {
  // icon — имя глифа из примитива Icon, а не эмодзи: значок наследует цвет токена статуса.
  const statusConfig = {
    valid: {
      icon: 'check',
      defaultText: 'Валидно',
      class: 'status-valid'
    },
    invalid: {
      icon: 'alert',
      defaultText: 'Ошибки',
      class: 'status-invalid'
    },
    pending: {
      icon: 'clock',
      defaultText: 'Требует проверки',
      class: 'status-pending'
    },
    active: {
      icon: 'check',
      defaultText: 'Активен',
      class: 'status-active'
    },
    inactive: {
      icon: 'pause',
      defaultText: 'Неактивен',
      class: 'status-inactive'
    },
    locked: {
      icon: 'lock',
      defaultText: 'Заблокировано',
      class: 'status-locked'
    },
    success: {
      icon: 'check',
      defaultText: 'Успешно',
      class: 'status-success'
    },
    failed: {
      icon: 'close',
      defaultText: 'Ошибка',
      class: 'status-failed'
    },
    partial: {
      icon: 'alert',
      defaultText: 'Частично',
      class: 'status-partial'
    }
  }

  const config = statusConfig[status] || statusConfig.pending
  const displayText = text || config.defaultText

  return (
    <span className={`status-badge status-badge-${size} ${config.class} ${className}`}>
      <span className="status-badge-icon"><Icon name={config.icon} size={16} /></span>
      <span className="status-badge-text">{displayText}</span>
    </span>
  )
}

export default StatusBadge

