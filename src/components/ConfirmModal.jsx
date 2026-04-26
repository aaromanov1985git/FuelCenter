import React from 'react'
import { createPortal } from 'react-dom'
import { Button } from './ui'
import { useScrollLock } from '../hooks/useScrollLock'
import './ConfirmModal.css'

/**
 * Компонент модального окна подтверждения действия
 * 
 * @param {boolean} isOpen - Открыто ли модальное окно
 * @param {string} title - Заголовок модального окна
 * @param {string} message - Текст сообщения
 * @param {function} onConfirm - Обработчик подтверждения
 * @param {function} onCancel - Обработчик отмены
 * @param {string} confirmText - Текст кнопки подтверждения (по умолчанию "Подтвердить")
 * @param {string} cancelText - Текст кнопки отмены (по умолчанию "Отмена")
 * @param {string} variant - Вариант стиля: "danger" | "warning" | "info" | "success" (по умолчанию "info")
 * @param {string|null} cancelText - Текст кнопки отмены. Если null, кнопка не отображается
 */
const ConfirmModal = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Подтвердить',
  cancelText = 'Отмена',
  variant = 'info'
}) => {
  // Reentrant body-scroll lock — handles nested modals correctly. Must be
  // called BEFORE the early-return so hook order stays stable across renders.
  useScrollLock(isOpen)

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onCancel()
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onCancel()
    }
  }

  React.useEffect(() => {
    if (!isOpen) return
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  if (!isOpen) return null

  // Маппинг вариантов ConfirmModal на варианты Button
  const getButtonVariant = () => {
    switch (variant) {
      case 'danger':
        return 'error'
      case 'warning':
        return 'warning'
      case 'success':
        return 'success'
      case 'info':
      default:
        return 'primary'
    }
  }

  const modalContent = (
    <div 
      className="confirm-modal-overlay" 
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      aria-describedby="confirm-modal-message"
    >
      <div className={`confirm-modal-content variant-${variant}`}>
        <div className="confirm-modal-header">
          <h3 id="confirm-modal-title" className="confirm-modal-title">
            {title}
          </h3>
        </div>
        
        <div className="confirm-modal-body">
          <p id="confirm-modal-message" className="confirm-modal-message">
            {message}
          </p>
        </div>
        
        <div className="confirm-modal-footer">
          {cancelText !== null && (
            <Button
              type="button"
              variant="secondary"
              onClick={onCancel}
              className="confirm-modal-button-cancel"
            >
              {cancelText}
            </Button>
          )}
          <Button
            type="button"
            variant={getButtonVariant()}
            onClick={onConfirm}
            className="confirm-modal-button-confirm"
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  )

  // Рендерим модальное окно через Portal на уровне body, чтобы оно было поверх всех элементов
  return createPortal(modalContent, document.body)
}

export default ConfirmModal
