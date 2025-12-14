import React from 'react'
import { Modal, Input, Button } from './ui'
import './LoadFirebirdModal.css'

/**
 * Модальное окно для загрузки транзакций из Firebird с выбором периода
 */
const LoadFirebirdModal = ({
  isOpen,
  templateName,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onConfirm,
  onCancel,
  loading = false
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title="Загрузка транзакций из Firebird"
      size="md"
      closeOnOverlayClick={true}
      closeOnEsc={true}
      showCloseButton={true}
    >
      <Modal.Body>
        <div className="load-firebird-modal-content">
          <p className="load-firebird-template-name">
            Шаблон: <strong>{templateName}</strong>
          </p>
          
          <div className="load-firebird-fields">
            <Input
              type="date"
              label="Начальная дата (необязательно)"
              value={dateFrom || ''}
              onChange={(e) => onDateFromChange(e.target.value)}
              disabled={loading}
              fullWidth
            />
            
            <Input
              type="date"
              label="Конечная дата (необязательно)"
              value={dateTo || ''}
              onChange={(e) => onDateToChange(e.target.value)}
              disabled={loading}
              fullWidth
            />
            
            <p className="load-firebird-hint">
              Если даты не указаны, будут загружены все транзакции из базы данных.
            </p>
          </div>
        </div>
      </Modal.Body>
      
      <Modal.Footer>
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={loading}
        >
          Отмена
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={onConfirm}
          loading={loading}
          disabled={loading}
        >
          {loading ? 'Загрузка...' : 'Загрузить'}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

export default LoadFirebirdModal
