import React from 'react'
import { Button } from './ui'
import Icon from './ui/Icon'
import './Toast.css'

/**
 * Компонент Toast-уведомления
 * 
 * @param {string} message - Текст сообщения
 * @param {string} type - Тип уведомления: 'success', 'error', 'warning', 'info'
 * @param {number} duration - Длительность отображения в миллисекундах (0 = не закрывать автоматически)
 * @param {function} onClose - Callback при закрытии
 * @param {boolean} showCloseButton - Показывать ли кнопку закрытия
 */
const Toast = ({ 
  message, 
  type = 'info', 
  duration = 5000, 
  onClose, 
  showCloseButton = true,
  id,
  title = null
}) => {
  const [isVisible, setIsVisible] = React.useState(true)
  const [isExiting, setIsExiting] = React.useState(false)

  React.useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        handleClose()
      }, duration)

      return () => clearTimeout(timer)
    }
  }, [duration])

  const handleClose = () => {
    setIsExiting(true)
    setTimeout(() => {
      setIsVisible(false)
      if (onClose) {
        onClose(id)
      }
    }, 300) // Время для анимации выхода
  }

  if (!isVisible) {
    return null
  }

  /* Значки статусов берутся из примитива ui/Icon — те же имена, что в Alert и
     ui/Toast, чтобы один и тот же тип сообщения не менял вид от страницы к
     странице. Класс toast-icon оставлен: на нём висят размер 20px и цвет
     статуса. strokeWidth 1.28 = 1.6 x 16/20 — при отрисовке 20px это те же
     1.6px штриха, что у остальных иконок; иначе штрих вырос бы до 2.0px. */
  const icons = {
    success: <Icon name="check" className="toast-icon" size={20} strokeWidth={1.28} />,
    error: <Icon name="close" className="toast-icon" size={20} strokeWidth={1.28} />,
    warning: <Icon name="alert" className="toast-icon" size={20} strokeWidth={1.28} />,
    info: <Icon name="info" className="toast-icon" size={20} strokeWidth={1.28} />
  }

  return (
    <div 
      className={`toast toast-${type} ${isExiting ? 'toast-exiting' : ''}`}
      role="alert"
      aria-live="assertive"
    >
      <div className="toast-content">
        <div className="toast-icon-wrapper">
          {icons[type]}
        </div>
        <div className="toast-text">
          {title && (
            <div className="toast-title">{title}</div>
          )}
          <div className="toast-message">{message}</div>
        </div>
        {showCloseButton && (
          <Button
            variant="ghost"
            size="sm"
            className="toast-close"
            onClick={handleClose}
            aria-label="Закрыть уведомление"
            style={{ 
              minWidth: 'auto', 
              padding: 'var(--spacing-tiny)',
              width: '24px',
              height: '24px'
            }}
          >
            <Icon name="close" className="toast-close-icon" size={16} />
          </Button>
        )}
      </div>
      {duration > 0 && (
        <div className="toast-progress">
          <div 
            className="toast-progress-bar" 
            style={{ animationDuration: `${duration}ms` }}
          />
        </div>
      )}
    </div>
  )
}

export default Toast

