import React, { useState } from 'react'
import { Card, Button, Input, Alert, Modal } from './ui'
import { authFetch } from '../utils/api'
import { useToast } from './ToastContainer'
import './LocationsUpload.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

const LocationsUpload = ({ isOpen, onClose }) => {
  const { error: showError, success } = useToast()
  const [loading, setLoading] = useState(false)
  const [locations, setLocations] = useState([{
    vehicle_id: '',
    timestamp: '',
    latitude: '',
    longitude: '',
    speed: '',
    heading: '',
    accuracy: '',
    source: 'GLONASS'
  }])

  const handleAddLocation = () => {
    setLocations([...locations, {
      vehicle_id: '',
      timestamp: '',
      latitude: '',
      longitude: '',
      speed: '',
      heading: '',
      accuracy: '',
      source: 'GLONASS'
    }])
  }

  const handleRemoveLocation = (index) => {
    setLocations(locations.filter((_, i) => i !== index))
  }

  const handleChange = (index, field, value) => {
    const updated = [...locations]
    updated[index][field] = value
    setLocations(updated)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      // Валидация и преобразование данных
      const locationsData = locations
        .filter(location => location.vehicle_id && location.timestamp && location.latitude && location.longitude)
        .map(location => ({
          vehicle_id: parseInt(location.vehicle_id),
          timestamp: location.timestamp + (location.timestamp.includes('T') ? '' : 'T00:00:00'),
          latitude: parseFloat(location.latitude),
          longitude: parseFloat(location.longitude),
          speed: location.speed ? parseFloat(location.speed) : null,
          heading: location.heading ? parseFloat(location.heading) : null,
          accuracy: location.accuracy ? parseFloat(location.accuracy) : null,
          source: location.source || 'GLONASS'
        }))

      if (locationsData.length === 0) {
        throw new Error('Необходимо заполнить хотя бы одно местоположение с обязательными полями (ID ТС, время, координаты)')
      }

      const response = await authFetch(
        `${API_URL}/api/v1/fuel-card-analysis/locations/upload`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ locations: locationsData })
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Ошибка загрузки' }))
        throw new Error(errorData.detail || 'Ошибка загрузки местоположений')
      }

      const result = await response.json()
      success(`Успешно загружено ${result.created} местоположений`)
      
      if (result.errors && result.errors.length > 0) {
        showError(`Ошибки при загрузке: ${result.errors.length} записей`)
      }

      // Сброс формы
      setLocations([{
        vehicle_id: '',
        timestamp: '',
        latitude: '',
        longitude: '',
        speed: '',
        heading: '',
        accuracy: '',
        source: 'GLONASS'
      }])
      
      onClose()
    } catch (err) {
      if (err.isUnauthorized) return
      showError(err.message || 'Ошибка при загрузке местоположений')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Загрузка данных о местоположениях ТС"
      size="xl"
    >
      <form onSubmit={handleSubmit}>
        <div className="locations-upload">
          <Alert variant="info" style={{ marginBottom: 'var(--spacing-section)' }}>
            Заполните данные о местоположениях ТС. Обязательные поля: ID ТС, время, широта, долгота.
          </Alert>

          <div className="locations-list">
            {locations.map((location, index) => (
              <Card key={index} style={{ marginBottom: 'var(--spacing-element)' }}>
                <Card.Header>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4>Местоположение #{index + 1}</h4>
                    {locations.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="small"
                        onClick={() => handleRemoveLocation(index)}
                      >
                        Удалить
                      </Button>
                    )}
                  </div>
                </Card.Header>
                <Card.Body>
                  <div className="location-form-grid">
                    <div className="form-field">
                      <label>ID ТС *</label>
                      <Input
                        type="number"
                        value={location.vehicle_id}
                        onChange={(e) => handleChange(index, 'vehicle_id', e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-field">
                      <label>Время *</label>
                      <Input
                        type="datetime-local"
                        value={location.timestamp}
                        onChange={(e) => handleChange(index, 'timestamp', e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-field">
                      <label>Широта *</label>
                      <Input
                        type="number"
                        step="0.000001"
                        value={location.latitude}
                        onChange={(e) => handleChange(index, 'latitude', e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-field">
                      <label>Долгота *</label>
                      <Input
                        type="number"
                        step="0.000001"
                        value={location.longitude}
                        onChange={(e) => handleChange(index, 'longitude', e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-field">
                      <label>Скорость (км/ч)</label>
                      <Input
                        type="number"
                        step="0.1"
                        value={location.speed}
                        onChange={(e) => handleChange(index, 'speed', e.target.value)}
                      />
                    </div>
                    <div className="form-field">
                      <label>Направление (градусы)</label>
                      <Input
                        type="number"
                        step="0.1"
                        value={location.heading}
                        onChange={(e) => handleChange(index, 'heading', e.target.value)}
                      />
                    </div>
                    <div className="form-field">
                      <label>Точность (м)</label>
                      <Input
                        type="number"
                        step="0.1"
                        value={location.accuracy}
                        onChange={(e) => handleChange(index, 'accuracy', e.target.value)}
                      />
                    </div>
                    <div className="form-field">
                      <label>Источник</label>
                      <Input
                        value={location.source}
                        onChange={(e) => handleChange(index, 'source', e.target.value)}
                        placeholder="GLONASS"
                      />
                    </div>
                  </div>
                </Card.Body>
              </Card>
            ))}
          </div>

          <div className="form-actions">
            <Button type="button" variant="secondary" onClick={handleAddLocation}>
              Добавить местоположение
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

export default LocationsUpload
