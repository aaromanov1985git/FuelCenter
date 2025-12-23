import React, { useState, useEffect } from 'react'
import { Modal, Input, Select, Button, Checkbox, Alert } from './ui'
import FormField from './FormField'
import { authFetch } from '../utils/api'
import CardInfoModal from './CardInfoModal'
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
  loading = false,
  onCardUpdated
}) => {
  const [selectedVehicleId, setSelectedVehicleId] = useState(null)
  const [selectedProviderId, setSelectedProviderId] = useState(null)
  const [isBlocked, setIsBlocked] = useState(false)
  const [originalOwnerName, setOriginalOwnerName] = useState('')
  const [normalizedOwner, setNormalizedOwner] = useState('')
  const [showCardInfo, setShowCardInfo] = useState(false)
  const [apiTemplates, setApiTemplates] = useState([])
  const [selectedTemplateId, setSelectedTemplateId] = useState(null)
  const [loadingTemplates, setLoadingTemplates] = useState(false)

  // Загрузка шаблонов провайдеров с типом "web" или "api" (для получения информации по карте)
  useEffect(() => {
    if (isOpen && selectedProviderId) {
      loadApiTemplates()
    } else {
      setApiTemplates([])
      setSelectedTemplateId(null)
    }
  }, [isOpen, selectedProviderId])

  const loadApiTemplates = async () => {
    if (!selectedProviderId) {
      setApiTemplates([])
      return
    }

    setLoadingTemplates(true)
    try {
      const response = await authFetch(`${API_URL}/api/v1/providers/${selectedProviderId}/templates`)
      if (response.ok) {
        const result = await response.json()
        // Фильтруем шаблоны с типом "web" или "api" (поддерживают получение информации по карте) и активные
        const apiTemplatesList = result.items.filter(
          t => (t.connection_type === 'web' || t.connection_type === 'api') && t.is_active
        )
        setApiTemplates(apiTemplatesList)
        // Автоматически выбираем первый шаблон, если он один
        if (apiTemplatesList.length === 1) {
          setSelectedTemplateId(apiTemplatesList[0].id)
        }
      }
    } catch (err) {
      // Игнорируем ошибки загрузки шаблонов
    } finally {
      setLoadingTemplates(false)
    }
  }

  // Инициализация значений при открытии модального окна
  useEffect(() => {
    if (isOpen && card) {
      setSelectedVehicleId(card.vehicle_id || null)
      setSelectedProviderId(card.provider_id || null)
      setIsBlocked(card.is_blocked || false)
      setOriginalOwnerName(card.original_owner_name || '')
      setNormalizedOwner(card.normalized_owner || '')
      setShowCardInfo(false)
      if (!selectedTemplateId) {
        setSelectedTemplateId(null)
      }
    }
  }, [isOpen, card?.id])

  // Обновление полей при изменении данных карты (после сохранения)
  useEffect(() => {
    if (isOpen && card) {
      // Обновляем только если значения действительно изменились
      const newVehicleId = card.vehicle_id || null
      const newProviderId = card.provider_id || null
      const newIsBlocked = card.is_blocked || false
      const newOriginalOwnerName = card.original_owner_name || ''
      const newNormalizedOwner = card.normalized_owner || ''

      if (newVehicleId !== selectedVehicleId) {
        setSelectedVehicleId(newVehicleId)
      }
      if (newProviderId !== selectedProviderId) {
        setSelectedProviderId(newProviderId)
      }
      if (newIsBlocked !== isBlocked) {
        setIsBlocked(newIsBlocked)
      }
      if (newOriginalOwnerName !== originalOwnerName) {
        setOriginalOwnerName(newOriginalOwnerName)
      }
      if (newNormalizedOwner !== normalizedOwner) {
        setNormalizedOwner(newNormalizedOwner)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, card])


  const handleSave = () => {
    if (card) {
      onSave(card.id, {
        vehicle_id: selectedVehicleId || null,
        provider_id: selectedProviderId || null,
        is_blocked: isBlocked,
        // original_owner_name не отправляем, так как оно не редактируется
        normalized_owner: normalizedOwner || null
      })
    }
  }

  const handleCardInfoUpdated = async () => {
    // Обновляем данные карты после получения информации из API
    if (card && onCardUpdated) {
      // Вызываем callback для обновления данных в родительском компоненте
      await onCardUpdated()
      // Обновляем локальные значения после обновления card
      if (card.original_owner_name !== undefined) {
        setOriginalOwnerName(card.original_owner_name || '')
      }
      if (card.is_blocked !== undefined) {
        setIsBlocked(card.is_blocked || false)
      }
    }
  }

  const handleNormalize = async () => {
    if (!originalOwnerName) return

    try {
      const response = await authFetch(`${API_URL}/api/v1/fuel-cards/normalize-owner`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          owner_name: originalOwnerName
        })
      })

      if (response.ok) {
        const data = await response.json()
        if (data.normalized) {
          setNormalizedOwner(data.normalized)
        }
      }
    } catch (err) {
      console.error('Ошибка при нормализации:', err)
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
        <div className="form-section compact">
          <div className="form-row">
            <div className="form-group">
              <label>Номер карты</label>
              <Input
                type="text"
                value={card.card_number}
                disabled
                fullWidth
              />
            </div>
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
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Исходное наименование Владельца</label>
              <Input
                type="text"
                value={originalOwnerName}
                disabled
                fullWidth
                placeholder="Из Web API"
              />
            </div>
            <div className="form-group">
              <label>Нормализованный владелец</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Input
                  type="text"
                  value={normalizedOwner}
                  onChange={(e) => setNormalizedOwner(e.target.value)}
                  disabled={loading}
                  fullWidth
                  placeholder="Госномер, гаражный номер или название"
                />
                {originalOwnerName && (
                  <Button
                    variant="secondary"
                    onClick={handleNormalize}
                    disabled={loading || !originalOwnerName}
                    title="Нормализовать"
                    style={{ flexShrink: 0, minWidth: 'auto', padding: '0.5rem 1rem' }}
                  >
                    ⚡
                  </Button>
                )}
              </div>
            </div>
          </div>
          <div className="form-row">
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
            <div className="form-group">
              <label style={{ marginBottom: '0.5rem', display: 'block' }}>
                <Checkbox
                  checked={isBlocked}
                  onChange={setIsBlocked}
                  disabled={loading}
                  label="Карта заблокирована"
                />
              </label>
            </div>
          </div>

          {selectedProviderId && (
            <div className="form-row" style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
              <div className="form-group">
                <label>Шаблон API</label>
                {loadingTemplates ? (
                  <div style={{ padding: '0.5rem 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    Загрузка...
                  </div>
                ) : apiTemplates.length > 0 ? (
                  <Select
                    value={selectedTemplateId ? selectedTemplateId.toString() : ''}
                    onChange={(value) => setSelectedTemplateId(value ? parseInt(value) : null)}
                    options={[
                      { value: '', label: 'Не выбран' },
                      ...apiTemplates.map(template => ({
                        value: template.id.toString(),
                        label: `${template.name} (${template.connection_type})`
                      }))
                    ]}
                    disabled={loading}
                    fullWidth
                  />
                ) : (
                  <div style={{ padding: '0.5rem 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    Нет шаблонов "web" или "api"
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>&nbsp;</label>
                <Button
                  variant="primary"
                  onClick={() => setShowCardInfo(true)}
                  disabled={loading || !selectedTemplateId}
                  style={{ width: '100%' }}
                >
                  Получить информацию
                </Button>
              </div>
            </div>
          )}
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

      <CardInfoModal
        isOpen={showCardInfo}
        onClose={() => setShowCardInfo(false)}
        cardNumber={card?.card_number}
        providerTemplateId={selectedTemplateId}
        onCardUpdated={handleCardInfoUpdated}
      />
    </Modal>
  )
}

export default FuelCardEditModal
