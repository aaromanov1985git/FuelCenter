import React, { useState } from 'react'
import { Card, Button, Input, Alert, Modal } from './ui'
import { authFetch } from '../utils/api'
import { useToast } from './ToastContainer'
import './RefuelsUpload.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

const RefuelsUpload = ({ isOpen, onClose }) => {
  const { error: showError, success } = useToast()
  const [loading, setLoading] = useState(false)
  const [refuels, setRefuels] = useState([{
    vehicle_id: '',
    refuel_date: '',
    fuel_type: '',
    quantity: '',
    fuel_level_before: '',
    fuel_level_after: '',
    odometer_reading: '',
    source_system: 'GLONASS',
    source_id: '',
    latitude: '',
    longitude: '',
    location_accuracy: ''
  }])

  const handleAddRefuel = () => {
    setRefuels([...refuels, {
      vehicle_id: '',
      refuel_date: '',
      fuel_type: '',
      quantity: '',
      fuel_level_before: '',
      fuel_level_after: '',
      odometer_reading: '',
      source_system: 'GLONASS',
      source_id: '',
      latitude: '',
      longitude: '',
      location_accuracy: ''
    }])
  }

  const handleRemoveRefuel = (index) => {
    setRefuels(refuels.filter((_, i) => i !== index))
  }

  const handleChange = (index, field, value) => {
    const updated = [...refuels]
    updated[index][field] = value
    setRefuels(updated)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Валидация и преобразование данных
      const refuelsData = refuels
        .filter(refuel => refuel.vehicle_id && refuel.refuel_date && refuel.quantity)
        .map(refuel => ({
          vehicle_id: parseInt(refuel.vehicle_id),
          refuel_date: refuel.refuel_date + (refuel.refuel_date.includes('T') ? '' : 'T00:00:00'),
          fuel_type: refuel.fuel_type || null,
          quantity: parseFloat(refuel.quantity),
          fuel_level_before: refuel.fuel_level_before ? parseFloat(refuel.fuel_level_before) : null,
          fuel_level_after: refuel.fuel_level_after ? parseFloat(refuel.fuel_level_after) : null,
          odometer_reading: refuel.odometer_reading ? parseFloat(refuel.odometer_reading) : null,
          source_system: refuel.source_system || 'GLONASS',
          source_id: refuel.source_id || null,
          latitude: refuel.latitude ? parseFloat(refuel.latitude) : null,
          longitude: refuel.longitude ? parseFloat(refuel.longitude) : null,
          location_accuracy: refuel.location_accuracy ? parseFloat(refuel.location_accuracy) : null
        }))

      if (refuelsData.length === 0) {
        throw new Error('Необходимо заполнить хотя бы одну заправку с обязательными полями (ID ТС, дата, количество)')
      }

      const response = await authFetch(
        `${API_URL}/api/v1/fuel-card-analysis/refuels/upload`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ refuels: refuelsData })
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Ошибка загрузки' }))
        throw new Error(errorData.detail || 'Ошибка загрузки заправок')
      }

      const result = await response.json()
      success(`Успешно загружено ${result.created} заправок`)
      
      if (result.errors && result.errors.length > 0) {
        showError(`Ошибки при загрузке: ${result.errors.length} записей`)
      }

      // Сброс формы
      setRefuels([{
        vehicle_id: '',
        refuel_date: '',
        fuel_type: '',
        quantity: '',
        fuel_level_before: '',
        fuel_level_after: '',
        odometer_reading: '',
        source_system: 'GLONASS',
        source_id: '',
        latitude: '',
        longitude: '',
        location_accuracy: ''
      }])
      
      onClose()
    } catch (err) {
      if (err.isUnauthorized) return
      showError(err.message || 'Ошибка при загрузке заправок')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Загрузка данных о заправках ТС"
      size="xl"
    >
      <form onSubmit={handleSubmit}>
        <div className="refuels-upload">
          <Alert variant="info" style={{ marginBottom: 'var(--spacing-section)' }}>
            Заполните данные о заправках. Обязательные поля: ID ТС, дата заправки, количество топлива.
          </Alert>

          <div className="refuels-list">
            {refuels.map((refuel, index) => (
              <Card key={index} style={{ marginBottom: 'var(--spacing-element)' }}>
                <Card.Header>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4>Заправка #{index + 1}</h4>
                    {refuels.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="small"
                        onClick={() => handleRemoveRefuel(index)}
                      >
                        Удалить
                      </Button>
                    )}
                  </div>
                </Card.Header>
                <Card.Body>
                  <div className="refuel-form-grid">
                    <div className="form-field">
                      <label>ID ТС *</label>
                      <Input
                        type="number"
                        value={refuel.vehicle_id}
                        onChange={(e) => handleChange(index, 'vehicle_id', e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-field">
                      <label>Дата и время заправки *</label>
                      <Input
                        type="datetime-local"
                        value={refuel.refuel_date}
                        onChange={(e) => handleChange(index, 'refuel_date', e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-field">
                      <label>Тип топлива</label>
                      <Input
                        value={refuel.fuel_type}
                        onChange={(e) => handleChange(index, 'fuel_type', e.target.value)}
                        placeholder="Дизельное топливо"
                      />
                    </div>
                    <div className="form-field">
                      <label>Количество (л) *</label>
                      <Input
                        type="number"
                        step="0.01"
                        value={refuel.quantity}
                        onChange={(e) => handleChange(index, 'quantity', e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-field">
                      <label>Уровень до заправки (%)</label>
                      <Input
                        type="number"
                        step="0.1"
                        value={refuel.fuel_level_before}
                        onChange={(e) => handleChange(index, 'fuel_level_before', e.target.value)}
                      />
                    </div>
                    <div className="form-field">
                      <label>Уровень после заправки (%)</label>
                      <Input
                        type="number"
                        step="0.1"
                        value={refuel.fuel_level_after}
                        onChange={(e) => handleChange(index, 'fuel_level_after', e.target.value)}
                      />
                    </div>
                    <div className="form-field">
                      <label>Показания одометра</label>
                      <Input
                        type="number"
                        step="0.1"
                        value={refuel.odometer_reading}
                        onChange={(e) => handleChange(index, 'odometer_reading', e.target.value)}
                      />
                    </div>
                    <div className="form-field">
                      <label>Источник данных</label>
                      <Input
                        value={refuel.source_system}
                        onChange={(e) => handleChange(index, 'source_system', e.target.value)}
                        placeholder="GLONASS"
                      />
                    </div>
                    <div className="form-field">
                      <label>ID в системе-источнике</label>
                      <Input
                        value={refuel.source_id}
                        onChange={(e) => handleChange(index, 'source_id', e.target.value)}
                      />
                    </div>
                    <div className="form-field">
                      <label>Широта</label>
                      <Input
                        type="number"
                        step="0.000001"
                        value={refuel.latitude}
                        onChange={(e) => handleChange(index, 'latitude', e.target.value)}
                      />
                    </div>
                    <div className="form-field">
                      <label>Долгота</label>
                      <Input
                        type="number"
                        step="0.000001"
                        value={refuel.longitude}
                        onChange={(e) => handleChange(index, 'longitude', e.target.value)}
                      />
                    </div>
                    <div className="form-field">
                      <label>Точность местоположения (м)</label>
                      <Input
                        type="number"
                        step="0.1"
                        value={refuel.location_accuracy}
                        onChange={(e) => handleChange(index, 'location_accuracy', e.target.value)}
                      />
                    </div>
                  </div>
                </Card.Body>
              </Card>
            ))}
          </div>

          <div className="form-actions">
            <Button type="button" variant="secondary" onClick={handleAddRefuel}>
              Добавить заправку
            </Button>
            <div style={{ display: 'flex', gap: 'var(--spacing-element)' }}>
              <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
                Отмена
              </Button>
              <Button type="submit" variant="primary" disabled={loading}>
                {loading ? 'Загрузка...' : 'Загрузить'}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </Modal>
  )
}

export default RefuelsUpload
