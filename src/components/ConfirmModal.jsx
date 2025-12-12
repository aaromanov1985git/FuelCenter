import React from 'react'
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
  if (!isOpen) return null

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
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen])

  return (
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
            <button
              type="button"
              className="confirm-modal-button confirm-modal-button-cancel"
              onClick={onCancel}
            >
              {cancelText}
            </button>
          )}
          <button
            type="button"
            className={`confirm-modal-button confirm-modal-button-confirm variant-${variant}`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmModal
