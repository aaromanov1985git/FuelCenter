import React from 'react'
import './ConfirmModal.css'

/**
 * Модальное окно для загрузки транзакций через API с выбором периода и карт
 */
const LoadApiModal = ({
  isOpen,
  templateName,
  dateFrom,
  dateTo,
  cardNumbers,
  onDateFromChange,
  onDateToChange,
  onCardNumbersChange,
  onConfirm,
  onCancel,
  loading = false
}) => {
  const handleOverlayClick = React.useCallback((e) => {
    if (e.target === e.currentTarget) {
      onCancel()
    }
  }, [onCancel])

  const handleKeyDown = React.useCallback((e) => {
    if (e.key === 'Escape') {
      onCancel()
    }
  }, [onCancel])

  React.useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen, handleKeyDown])

  if (!isOpen) return null

  return (
    <div 
      className="confirm-modal-overlay" 
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="load-api-modal-title"
    >
      <div className="confirm-modal-content variant-info">
        <div className="confirm-modal-header">
          <h3 id="load-api-modal-title" className="confirm-modal-title">
            Загрузка транзакций через API
          </h3>
        </div>
        
        <div className="confirm-modal-body">
          <p style={{ marginBottom: '15px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            Шаблон: {templateName}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', padding: '10px 0' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ 
                fontWeight: 600, 
                fontSize: '0.9rem', 
                color: 'var(--color-text-primary)',
                display: 'flex', 
                flexDirection: 'column',
                gap: '8px'
              }}>
                <span>Дата начала периода: <span style={{ color: 'var(--color-error)' }}>*</span></span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => onDateFromChange(e.target.value)}
                  disabled={loading}
                  style={{
                    padding: '10px 12px',
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                    backgroundColor: 'var(--color-bg-card)',
                    color: 'var(--color-text-primary)',
                    fontFamily: 'inherit',
                    transition: 'border-color 0.2s, box-shadow 0.2s'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'var(--color-primary)'
                    e.target.style.boxShadow = '0 0 0 3px var(--color-primary-light)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'var(--color-border)'
                    e.target.style.boxShadow = 'none'
                  }}
                />
              </label>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ 
                fontWeight: 600, 
                fontSize: '0.9rem',
                color: 'var(--color-text-primary)',
                display: 'flex', 
                flexDirection: 'column',
                gap: '8px'
              }}>
                <span>Дата окончания периода: <span style={{ color: 'var(--color-error)' }}>*</span></span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => onDateToChange(e.target.value)}
                  disabled={loading}
                  style={{
                    padding: '10px 12px',
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                    backgroundColor: 'var(--color-bg-card)',
                    color: 'var(--color-text-primary)',
                    fontFamily: 'inherit',
                    transition: 'border-color 0.2s, box-shadow 0.2s'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'var(--color-primary)'
                    e.target.style.boxShadow = '0 0 0 3px var(--color-primary-light)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'var(--color-border)'
                    e.target.style.boxShadow = 'none'
                  }}
                />
              </label>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ 
                fontWeight: 600, 
                fontSize: '0.9rem',
                color: 'var(--color-text-primary)',
                display: 'flex', 
                flexDirection: 'column',
                gap: '8px'
              }}>
                <span>Номера карт (опционально):</span>
                <textarea
                  value={cardNumbers || ''}
                  onChange={(e) => onCardNumbersChange(e.target.value)}
                  placeholder="Введите номера карт через запятую или каждую на новой строке. Например: 1234567890, 0987654321"
                  disabled={loading}
                  rows="4"
                  style={{
                    padding: '10px 12px',
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                    backgroundColor: 'var(--color-bg-card)',
                    color: 'var(--color-text-primary)',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    transition: 'border-color 0.2s, box-shadow 0.2s'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'var(--color-primary)'
                    e.target.style.boxShadow = '0 0 0 3px var(--color-primary-light)'
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = 'var(--color-border)'
                    e.target.style.boxShadow = 'none'
                  }}
                />
                <span style={{ 
                  fontSize: '0.85rem', 
                  color: 'var(--color-text-secondary)', 
                  marginTop: '5px',
                  lineHeight: '1.5'
                }}>
                  Если оставить пустым, будут загружены транзакции для всех карт из API
                </span>
              </label>
            </div>
          </div>
        </div>
        
        <div className="confirm-modal-footer">
          <button
            type="button"
            className="confirm-modal-button confirm-modal-button-cancel"
            onClick={onCancel}
            disabled={loading}
          >
            Отмена
          </button>
          <button
            type="button"
            className="confirm-modal-button confirm-modal-button-confirm variant-info"
            onClick={onConfirm}
            disabled={loading || !dateFrom || !dateTo}
          >
            {loading ? 'Загрузка...' : 'Загрузить транзакции'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default LoadApiModal

