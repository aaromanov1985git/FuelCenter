import React from 'react'
import { Modal, Input, Button } from './ui'
import FormField from './FormField'
import './LoadApiModal.css'

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
  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title="Загрузка транзакций через API"
      size="md"
      closeOnOverlayClick={true}
      closeOnEsc={true}
      showCloseButton={true}
    >
      <Modal.Body>
        <div className="load-api-modal-content">
          <p className="load-api-template-name">
            Шаблон: <strong>{templateName}</strong>
          </p>
          
          <div className="load-api-fields">
            <Input
              type="date"
              label="Дата начала периода"
              value={dateFrom || ''}
              onChange={(e) => onDateFromChange(e.target.value)}
              disabled={loading}
              required
              fullWidth
            />
            
            <Input
              type="date"
              label="Дата окончания периода"
              value={dateTo || ''}
              onChange={(e) => onDateToChange(e.target.value)}
              disabled={loading}
              required
              fullWidth
            />
            
            <FormField
              label="Номера карт"
              name="cardNumbers"
              value={cardNumbers || ''}
              onChange={(e) => onCardNumbersChange(e.target.value)}
              helpText="Укажите номера карт через запятую или каждую на новой строке. Для XML API с сертификатом карты обязательны."
            >
              <textarea
                placeholder="Введите номера карт через запятую или каждую на новой строке. Например: 1234567890, 0987654321"
                disabled={loading}
                rows="4"
                style={{
                  resize: 'vertical',
                  fontFamily: 'inherit'
                }}
              />
            </FormField>
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
          disabled={loading || !dateFrom || !dateTo}
        >
          {loading ? 'Загрузка...' : 'Загрузить транзакции'}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

export default LoadApiModal

