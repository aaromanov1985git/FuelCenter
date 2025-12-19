import React, { useState, useEffect } from 'react'
import { Modal, Button, Input, Select, Alert } from './ui'
import { authFetch } from '../utils/api'
import { useToast } from './ToastContainer'
import './FuelCardAnalysisModal.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

const FuelCardAnalysisModal = ({ isOpen, onClose, onComplete }) => {
  const { error: showError, success } = useToast()
  const [loading, setLoading] = useState(false)
  const [analysisType, setAnalysisType] = useState('period') // 'transaction', 'card', 'period'
  const [formData, setFormData] = useState({
    transaction_id: '',
    card_id: '',
    date_from: '',
    date_to: '',
    card_ids: '',
    vehicle_ids: '',
    organization_ids: '',
    time_window_minutes: '30',
    quantity_tolerance_percent: '5',
    azs_radius_meters: '500'
  })
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (isOpen) {
      // Устанавливаем даты по умолчанию
      const today = new Date()
      const monthAgo = new Date(today)
      monthAgo.setMonth(monthAgo.getMonth() - 1)
      
      setFormData(prev => ({
        ...prev,
        date_from: monthAgo.toISOString().split('T')[0],
        date_to: today.toISOString().split('T')[0]
      }))
    } else {
      // Сброс при закрытии
      setFormData({
        transaction_id: '',
        card_id: '',
        date_from: '',
        date_to: '',
        card_ids: '',
        vehicle_ids: '',
        organization_ids: '',
        time_window_minutes: '30',
        quantity_tolerance_percent: '5',
        azs_radius_meters: '500'
      })
      setResult(null)
      setAnalysisType('period')
    }
  }, [isOpen])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setResult(null)

    try {
      let response

      if (analysisType === 'transaction') {
        // Анализ конкретной транзакции
        const params = new URLSearchParams()
        if (formData.time_window_minutes) params.append('time_window_minutes', formData.time_window_minutes)
        if (formData.quantity_tolerance_percent) params.append('quantity_tolerance_percent', formData.quantity_tolerance_percent)
        if (formData.azs_radius_meters) params.append('azs_radius_meters', formData.azs_radius_meters)

        response = await authFetch(
          `${API_URL}/api/v1/fuel-card-analysis/analyze-transaction/${formData.transaction_id}?${params}`
        )
      } else if (analysisType === 'card') {
        // Анализ по карте
        const params = new URLSearchParams()
        if (formData.date_from) params.append('date_from', formData.date_from + 'T00:00:00')
        if (formData.date_to) params.append('date_to', formData.date_to + 'T23:59:59')

        response = await authFetch(
          `${API_URL}/api/v1/fuel-card-analysis/analyze-card/${formData.card_id}?${params}`
        )
      } else {
        // Массовый анализ
        const requestBody = {
          date_from: formData.date_from ? formData.date_from + 'T00:00:00' : null,
          date_to: formData.date_to ? formData.date_to + 'T23:59:59' : null,
          card_ids: formData.card_ids ? formData.card_ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : null,
          vehicle_ids: formData.vehicle_ids ? formData.vehicle_ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : null,
          organization_ids: formData.organization_ids ? formData.organization_ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : null,
          time_window_minutes: formData.time_window_minutes ? parseInt(formData.time_window_minutes) : null,
          quantity_tolerance_percent: formData.quantity_tolerance_percent ? parseFloat(formData.quantity_tolerance_percent) : null,
          azs_radius_meters: formData.azs_radius_meters ? parseInt(formData.azs_radius_meters) : null
        }

        // Удаляем null значения
        Object.keys(requestBody).forEach(key => {
          if (requestBody[key] === null) delete requestBody[key]
        })

        response = await authFetch(
          `${API_URL}/api/v1/fuel-card-analysis/analyze-period`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
          }
        )
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Ошибка анализа' }))
        throw new Error(errorData.detail || 'Ошибка анализа')
      }

      const data = await response.json()
      setResult(data)
      success('Анализ успешно выполнен')
      
      // Если это не массовый анализ, закрываем модальное окно
      if (analysisType !== 'period') {
        setTimeout(() => {
          onComplete()
        }, 2000)
      }
    } catch (err) {
      if (err.isUnauthorized) return
      showError(err.message || 'Ошибка при выполнении анализа')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Запуск анализа топливных карт"
      size="lg"
    >
      <form onSubmit={handleSubmit}>
        <div className="analysis-form">
          <div className="form-section">
            <label>Тип анализа</label>
            <Select
              value={analysisType}
              onChange={(e) => setAnalysisType(e.target.value)}
            >
              <option value="period">Массовый анализ за период</option>
              <option value="transaction">Анализ конкретной транзакции</option>
              <option value="card">Анализ по карте</option>
            </Select>
          </div>

          {analysisType === 'transaction' && (
            <>
              <div className="form-section">
                <label>ID транзакции *</label>
                <Input
                  type="number"
                  value={formData.transaction_id}
                  onChange={(e) => setFormData({ ...formData, transaction_id: e.target.value })}
                  required
                />
              </div>
            </>
          )}

          {analysisType === 'card' && (
            <>
              <div className="form-section">
                <label>ID карты *</label>
                <Input
                  type="number"
                  value={formData.card_id}
                  onChange={(e) => setFormData({ ...formData, card_id: e.target.value })}
                  required
                />
              </div>
              <div className="form-section">
                <label>Дата от</label>
                <Input
                  type="date"
                  value={formData.date_from}
                  onChange={(e) => setFormData({ ...formData, date_from: e.target.value })}
                />
              </div>
              <div className="form-section">
                <label>Дата до</label>
                <Input
                  type="date"
                  value={formData.date_to}
                  onChange={(e) => setFormData({ ...formData, date_to: e.target.value })}
                />
              </div>
            </>
          )}

          {analysisType === 'period' && (
            <>
              <div className="form-section">
                <label>Дата от *</label>
                <Input
                  type="date"
                  value={formData.date_from}
                  onChange={(e) => setFormData({ ...formData, date_from: e.target.value })}
                  required
                />
              </div>
              <div className="form-section">
                <label>Дата до *</label>
                <Input
                  type="date"
                  value={formData.date_to}
                  onChange={(e) => setFormData({ ...formData, date_to: e.target.value })}
                  required
                />
              </div>
              <div className="form-section">
                <label>ID карт (через запятую, опционально)</label>
                <Input
                  value={formData.card_ids}
                  onChange={(e) => setFormData({ ...formData, card_ids: e.target.value })}
                  placeholder="1, 2, 3"
                />
              </div>
              <div className="form-section">
                <label>ID ТС (через запятую, опционально)</label>
                <Input
                  value={formData.vehicle_ids}
                  onChange={(e) => setFormData({ ...formData, vehicle_ids: e.target.value })}
                  placeholder="1, 2, 3"
                />
              </div>
              <div className="form-section">
                <label>ID организаций (через запятую, опционально)</label>
                <Input
                  value={formData.organization_ids}
                  onChange={(e) => setFormData({ ...formData, organization_ids: e.target.value })}
                  placeholder="1, 2, 3"
                />
              </div>
            </>
          )}

          <div className="form-section">
            <h3>Параметры анализа</h3>
          </div>

          <div className="form-section">
            <label>Временное окно (минуты)</label>
            <Input
              type="number"
              value={formData.time_window_minutes}
              onChange={(e) => setFormData({ ...formData, time_window_minutes: e.target.value })}
              min="1"
            />
          </div>

          <div className="form-section">
            <label>Допустимое отклонение количества (%)</label>
            <Input
              type="number"
              step="0.1"
              value={formData.quantity_tolerance_percent}
              onChange={(e) => setFormData({ ...formData, quantity_tolerance_percent: e.target.value })}
              min="0"
            />
          </div>

          <div className="form-section">
            <label>Радиус АЗС (метры)</label>
            <Input
              type="number"
              value={formData.azs_radius_meters}
              onChange={(e) => setFormData({ ...formData, azs_radius_meters: e.target.value })}
              min="1"
            />
          </div>

          {result && (
            <div className="form-section">
              <Alert variant="success">
                <h4>Результаты анализа:</h4>
                {result.statistics && (
                  <div style={{ marginTop: 'var(--spacing-element)' }}>
                    <p><strong>Всего транзакций:</strong> {result.statistics.total_transactions}</p>
                    <p><strong>Проанализировано:</strong> {result.statistics.analyzed}</p>
                    <p><strong>Совпадений:</strong> {result.statistics.matched}</p>
                    <p><strong>Без заправки:</strong> {result.statistics.no_refuel}</p>
                    <p><strong>Несоответствие локации:</strong> {result.statistics.location_mismatch}</p>
                    <p><strong>Аномалий:</strong> {result.statistics.anomalies}</p>
                    {result.statistics.anomaly_types && Object.keys(result.statistics.anomaly_types).length > 0 && (
                      <div style={{ marginTop: 'var(--spacing-element)' }}>
                        <strong>Типы аномалий:</strong>
                        <ul>
                          {Object.entries(result.statistics.anomaly_types).map(([type, count]) => (
                            <li key={type}>{type}: {count}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                {result.match_status && (
                  <div style={{ marginTop: 'var(--spacing-element)' }}>
                    <p><strong>Статус:</strong> {result.match_status}</p>
                    {result.match_confidence && (
                      <p><strong>Уверенность:</strong> {result.match_confidence}%</p>
                    )}
                  </div>
                )}
              </Alert>
            </div>
          )}

          <div className="form-actions">
            <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
              Отмена
            </Button>
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? 'Выполняется...' : 'Запустить анализ'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

export default FuelCardAnalysisModal
