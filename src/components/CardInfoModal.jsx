import React, { useState, useEffect } from 'react'
import { Modal, Button, Alert, Skeleton } from './ui'
import { authFetch } from '../utils/api'
import './CardInfoModal.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

/**
 * Модальное окно для отображения информации по карте из Web API
 */
const CardInfoModal = ({
  isOpen,
  onClose,
  cardNumber,
  providerTemplateId,
  onCardUpdated
}) => {
  const [cardInfo, setCardInfo] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [cardUpdated, setCardUpdated] = useState(false)

  useEffect(() => {
    if (isOpen && cardNumber && providerTemplateId) {
      loadCardInfo()
    } else {
      setCardInfo(null)
      setError(null)
    }
  }, [isOpen, cardNumber, providerTemplateId])

  const loadCardInfo = async () => {
    if (!cardNumber || !providerTemplateId) {
      setError('Не указан номер карты или шаблон провайдера')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await authFetch(`${API_URL}/api/v1/fuel-cards/info`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          card_number: cardNumber,
          provider_template_id: providerTemplateId,
          flags: 23, // ФИО + телефон
          update_card: true // Автоматически обновить топливную карту
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Ошибка получения информации по карте')
      }

      const data = await response.json()
      setCardInfo(data)
      
      // Если карта была обновлена, уведомляем родительский компонент
      if (onCardUpdated) {
        onCardUpdated()
        setCardUpdated(true)
      }
    } catch (err) {
      setError(err.message || 'Ошибка получения информации по карте')
    } finally {
      setLoading(false)
    }
  }

  const formatValue = (value) => {
    if (value === null || value === undefined || value === '') {
      return '-'
    }
    return String(value)
  }

  if (!isOpen) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Информация по карте: ${cardNumber}`}
      size="lg"
    >
      <Modal.Body>
        {loading && (
          <div style={{ padding: '1rem' }}>
            <Skeleton rows={10} columns={2} />
          </div>
        )}

        {error && (
          <Alert variant="error" style={{ marginBottom: '1rem' }}>
            {error}
          </Alert>
        )}

        {!loading && !error && cardUpdated && (
          <Alert variant="success" style={{ marginBottom: '1rem' }}>
            Топливная карта успешно обновлена данными из API
          </Alert>
        )}

        {!loading && !error && cardInfo && (
          <div className="card-info-content">
            <div className="card-info-section">
              <h3>Основная информация</h3>
              <div className="card-info-grid">
                <div className="card-info-item">
                  <label>Номер карты</label>
                  <div>{formatValue(cardInfo.card_number)}</div>
                </div>
                <div className="card-info-item">
                  <label>Тип приложения</label>
                  <div>{formatValue(cardInfo.application_type_name)} ({formatValue(cardInfo.application_type)})</div>
                </div>
                <div className="card-info-item">
                  <label>Состояние</label>
                  <div className={cardInfo.state === 0 ? 'status-active' : 'status-blocked'}>
                    {formatValue(cardInfo.state_name)}
                  </div>
                </div>
                <div className="card-info-item">
                  <label>Баланс</label>
                  <div>{formatValue(cardInfo.balance)}</div>
                </div>
                <div className="card-info-item">
                  <label>Код организации (COD_A)</label>
                  <div>{formatValue(cardInfo.cod_a)}</div>
                </div>
                <div className="card-info-item">
                  <label>Код владельца (COD_OWN)</label>
                  <div>{formatValue(cardInfo.cod_own)}</div>
                </div>
                <div className="card-info-item">
                  <label>Ключ приложения</label>
                  <div>{formatValue(cardInfo.application_key)}</div>
                </div>
                <div className="card-info-item">
                  <label>Бонусная программа</label>
                  <div>{formatValue(cardInfo.bonus_program)}</div>
                </div>
              </div>
            </div>

            {(cardInfo.person_name || cardInfo.first_name || cardInfo.last_name || cardInfo.patronymic) && (
              <div className="card-info-section">
                <h3>Реквизиты владельца</h3>
                <div className="card-info-grid">
                  {cardInfo.person_name && (
                    <div className="card-info-item full-width">
                      <label>Краткое наименование (PersonName)</label>
                      <div>{formatValue(cardInfo.person_name)}</div>
                    </div>
                  )}
                  {cardInfo.first_name && (
                    <div className="card-info-item">
                      <label>Имя</label>
                      <div>{formatValue(cardInfo.first_name)}</div>
                    </div>
                  )}
                  {cardInfo.last_name && (
                    <div className="card-info-item">
                      <label>Фамилия</label>
                      <div>{formatValue(cardInfo.last_name)}</div>
                    </div>
                  )}
                  {cardInfo.patronymic && (
                    <div className="card-info-item">
                      <label>Отчество</label>
                      <div>{formatValue(cardInfo.patronymic)}</div>
                    </div>
                  )}
                  {cardInfo.phone_number && (
                    <div className="card-info-item">
                      <label>Телефон</label>
                      <div>{formatValue(cardInfo.phone_number)}</div>
                    </div>
                  )}
                  {cardInfo.birth_date && (
                    <div className="card-info-item">
                      <label>Дата рождения</label>
                      <div>{formatValue(cardInfo.birth_date)}</div>
                    </div>
                  )}
                  {cardInfo.sex && (
                    <div className="card-info-item">
                      <label>Пол</label>
                      <div>{formatValue(cardInfo.sex)}</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal.Body>

      <Modal.Footer>
        <Button
          variant="secondary"
          onClick={onClose}
          disabled={loading}
        >
          Закрыть
        </Button>
        {!loading && cardInfo && (
          <Button
            variant="primary"
            onClick={loadCardInfo}
          >
            Обновить
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  )
}

export default CardInfoModal
