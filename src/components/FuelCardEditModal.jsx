import React, { useState, useEffect } from 'react'
import { Modal, Input, Select, Button, Checkbox } from './ui'
import FormField from './FormField'
import { authFetch } from '../utils/api'
import './FuelCardEditModal.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

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

  const providerOptions = [
    { value: '', label: 'Не указан' },
    ...providers.filter(p => p.is_active).map(provider => ({
      value: provider.id.toString(),
      label: provider.name
    }))
  ]

  const vehicleOptions = [
    { value: '', label: 'Не закреплена' },
    ...vehicles.map(vehicle => ({
      value: vehicle.id.toString(),
      label: `${vehicle.original_name}${vehicle.license_plate ? ` (${vehicle.license_plate})` : ''}`
    }))
  ]

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={`Редактирование карты: ${card.card_number}`}
      size="md"
    >
      <Modal.Body>
        <div className="form-section">
          <h3>Основная информация</h3>
          <div className="form-group">
            <label>Номер карты</label>
            <Input
              type="text"
              value={card.card_number}
              disabled
              fullWidth
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'block' }}>
              Номер карты нельзя изменить
            </span>
          </div>
        </div>
        <div className="form-section">
          <h3>Связи</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Провайдер</label>
              <Select
                value={selectedProviderId ? selectedProviderId.toString() : ''}
                onChange={(value) => setSelectedProviderId(value ? parseInt(value) : null)}
                options={providerOptions}
                disabled={loading}
                fullWidth
              />
            </div>
            <div className="form-group">
              <label>Закреплена за ТС</label>
              <Select
                value={selectedVehicleId ? selectedVehicleId.toString() : ''}
                onChange={(value) => setSelectedVehicleId(value ? parseInt(value) : null)}
                options={vehicleOptions}
                disabled={loading}
                fullWidth
              />
            </div>
          </div>
        </div>
        <div className="form-section">
          <div className="form-group">
            <label>
              <Checkbox
                checked={isBlocked}
                onChange={setIsBlocked}
                disabled={loading}
                label="Карта заблокирована"
              />
            </label>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem', display: 'block' }}>
              Заблокированные карты не будут использоваться при обработке транзакций
            </span>
          </div>
        </div>
      </Modal.Body>

      <Modal.Footer>
        <Button
          variant="secondary"
          onClick={onCancel}
          disabled={loading}
        >
          Отмена
        </Button>
        <Button
          variant="success"
          onClick={handleSave}
          disabled={loading}
          loading={loading}
        >
          Сохранить
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

export default FuelCardEditModal
