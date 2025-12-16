import React, { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import { Modal, Button } from './ui'
import 'leaflet/dist/leaflet.css'
import './MapModal.css'

// Исправление иконок маркера Leaflet
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

// Компонент для обновления центра карты при изменении позиции
function ChangeView({ center, zoom }) {
  const map = useMap()
  
  useEffect(() => {
    if (center && map) {
      map.setView(center, zoom)
    }
  }, [center, zoom, map])
  
  return null
}

// Компонент для обработки кликов на карте
function LocationMarker({ position, onPositionChange }) {
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng
      onPositionChange(lat, lng)
    },
  })

  return position === null ? null : (
    <Marker position={position} />
  )
}

const MapModal = ({ isOpen, onClose, onConfirm, initialLat = null, initialLng = null }) => {
  const [position, setPosition] = useState(null)

  // Устанавливаем начальную позицию при открытии модального окна
  useEffect(() => {
    if (isOpen) {
      if (initialLat !== null && initialLng !== null && !isNaN(initialLat) && !isNaN(initialLng)) {
        setPosition([initialLat, initialLng])
      } else {
        // По умолчанию центр России (Москва)
        setPosition([55.7558, 37.6173])
      }
    } else {
      // Сбрасываем позицию при закрытии
      setPosition(null)
    }
  }, [isOpen, initialLat, initialLng])

  const handlePositionChange = (lat, lng) => {
    setPosition([lat, lng])
  }

  const handleConfirm = () => {
    if (position) {
      onConfirm(position[0], position[1])
      onClose()
    }
  }

  const handleCancel = () => {
    onClose()
  }

  if (!isOpen) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Выберите координаты на карте" size="lg">
      <Modal.Body>
        <div className="map-modal-content">
          <div className="map-instructions">
            <p>Кликните на карте, чтобы выбрать точку. Выбранные координаты:</p>
            {position && (
              <div className="coordinates-display">
                <strong>Широта:</strong> {position[0].toFixed(6)}, <strong>Долгота:</strong> {position[1].toFixed(6)}
              </div>
            )}
          </div>
          <div className="map-container-wrapper">
            <MapContainer
              center={position || [55.7558, 37.6173]}
              zoom={position ? 13 : 5}
              style={{ height: '500px', width: '100%' }}
              className="map-container"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {position && <ChangeView center={position} zoom={13} />}
              <LocationMarker position={position} onPositionChange={handlePositionChange} />
            </MapContainer>
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleCancel}>
          Отмена
        </Button>
        <Button variant="primary" onClick={handleConfirm} disabled={!position}>
          Подтвердить
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

export default MapModal
