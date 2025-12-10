import React, { useState, useEffect } from 'react'
import IconButton from './IconButton'
import './FuelCardEditModal.css'

/**
 * Модальное окно для редактирования топливной карты
 * 
 * @param {boolean} isOpen - Открыто ли модальное окно
 * @param {object} card - Данные карты для редактирования
 * @param {array} vehicles - Список транспортных средств
 * @param {array} providers - Список провайдеров
 * @param {function} onSave - Обработчик сохранения
 * @param {function} onCancel - Обработчик отмены
 * @param {boolean} loading - Состояние загрузки
 */
const FuelCardEditModal = ({
  isOpen,
  card,
  vehicles = [],
  providers = [],
  onSave,
  onCancel,
  loading = false
}) => {
  const [selectedVehicleId, setSelectedVehicleId] = useState(null)
  const [selectedProviderId, setSelectedProviderId] = useState(null)
  const [isBlocked, setIsBlocked] = useState(false)

  // Инициализация значений при открытии модального окна
  useEffect(() => {
    if (isOpen && card) {
      setSelectedVehicleId(card.vehicle_id || null)
      setSelectedProviderId(card.provider_id || null)
      setIsBlocked(card.is_blocked || false)
    }
  }, [isOpen, card])

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

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const handleSave = () => {
    if (card) {
      onSave(card.id, {
        vehicle_id: selectedVehicleId || null,
        provider_id: selectedProviderId || null,
        is_blocked: isBlocked
      })
    }
  }

  if (!isOpen || !card) return null

  return (
    <div 
      className="fuel-card-edit-modal-overlay" 
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="fuel-card-edit-modal-title"
    >
      <div className="fuel-card-edit-modal-content">
        <div className="fuel-card-edit-modal-header">
          <h3 id="fuel-card-edit-modal-title" className="fuel-card-edit-modal-title">
            Редактирование карты: {card.card_number}
          </h3>
          <button
            type="button"
            className="fuel-card-edit-modal-close"
            onClick={onCancel}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
        
        <div className="fuel-card-edit-modal-body">
          <div className="form-group">
            <label htmlFor="cardNumber" className="form-label">
              Номер карты
            </label>
            <input
              type="text"
              id="cardNumber"
              value={card.card_number}
              disabled
              className="form-input form-input-disabled"
            />
            <span className="form-hint">Номер карты нельзя изменить</span>
          </div>

          <div className="form-group">
            <label htmlFor="providerSelect" className="form-label">
              Провайдер
            </label>
            <select
              id="providerSelect"
              value={selectedProviderId || ''}
              onChange={(e) => setSelectedProviderId(e.target.value ? parseInt(e.target.value) : null)}
              className="form-select"
              disabled={loading}
            >
              <option value="">Не указан</option>
              {providers.filter(p => p.is_active).map(provider => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="vehicleSelect" className="form-label">
              Закреплена за ТС
            </label>
            <select
              id="vehicleSelect"
              value={selectedVehicleId || ''}
              onChange={(e) => setSelectedVehicleId(e.target.value ? parseInt(e.target.value) : null)}
              className="form-select"
              disabled={loading}
            >
              <option value="">Не закреплена</option>
              {vehicles.map(vehicle => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.original_name} {vehicle.license_plate ? `(${vehicle.license_plate})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group form-group-checkbox">
            <label className="form-label form-label-checkbox">
              <input
                type="checkbox"
                checked={isBlocked}
                onChange={(e) => setIsBlocked(e.target.checked)}
                disabled={loading}
                className="form-checkbox"
              />
              <span>Карта заблокирована</span>
            </label>
            <span className="form-hint">Заблокированные карты не будут использоваться при обработке транзакций</span>
          </div>
        </div>
        
        <div className="fuel-card-edit-modal-footer">
          <IconButton 
            icon="cancel" 
            variant="secondary" 
            onClick={onCancel}
            disabled={loading}
            title="Отмена"
            size="medium"
          />
          <IconButton 
            icon="save" 
            variant="success" 
            onClick={handleSave}
            disabled={loading}
            title={loading ? 'Сохранение...' : 'Сохранить'}
            size="medium"
          />
        </div>
      </div>
    </div>
  )
}

export default FuelCardEditModal
