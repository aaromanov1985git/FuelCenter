import React, { useState, useEffect } from 'react'
import { Card, Button, Select, Input, Alert, Skeleton } from './ui'
import { authFetch } from '../utils/api'
import { useToast } from './ToastContainer'
import { Badge } from './ui'
import './AnomaliesStats.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

const anomalyTypeLabels = {
  fuel_theft: 'Кража топлива',
  card_misuse: 'Неправильное использование',
  data_error: 'Ошибка данных',
  equipment_failure: 'Сбой оборудования'
}

const matchStatusLabels = {
  matched: 'Совпадение',
  no_refuel: 'Нет заправки',
  location_mismatch: 'Несоответствие локации',
  quantity_mismatch: 'Несоответствие количества',
  time_mismatch: 'Несоответствие времени',
  multiple_matches: 'Несколько соответствий'
}

const AnomaliesStats = () => {
  const { error: showError } = useToast()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({
    date_from: '',
    date_to: '',
    organization_id: '',
    anomaly_type: ''
  })

  useEffect(() => {
    loadStats()
  }, [filters.date_from, filters.date_to, filters.organization_id, filters.anomaly_type])

  const loadStats = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.date_from) params.append('date_from', filters.date_from + 'T00:00:00')
      if (filters.date_to) params.append('date_to', filters.date_to + 'T23:59:59')
      if (filters.organization_id) params.append('organization_id', filters.organization_id)
      if (filters.anomaly_type) params.append('anomaly_type', filters.anomaly_type)

      const response = await authFetch(
        `${API_URL}/api/v1/fuel-card-analysis/anomalies/stats?${params}`
      )
      if (!response.ok) throw new Error('Ошибка загрузки данных')
      
      const data = await response.json()
      setStats(data)
    } catch (err) {
      if (err.isUnauthorized) return
      showError(err.message || 'Ошибка загрузки статистики')
    } finally {
      setLoading(false)
    }
  }

  // Устанавливаем даты по умолчанию при первой загрузке
  useEffect(() => {
    if (!filters.date_from && !filters.date_to) {
      const today = new Date()
      const monthAgo = new Date(today)
      monthAgo.setMonth(monthAgo.getMonth() - 1)
      
      setFilters(prev => ({
        ...prev,
        date_from: monthAgo.toISOString().split('T')[0],
        date_to: today.toISOString().split('T')[0]
      }))
    }
  }, [])

  if (loading && !stats) {
    return <Skeleton rows={5} columns={2} />
  }

  return (
    <div className="anomalies-stats">
      <div className="stats-filters" style={{ marginBottom: 'var(--spacing-section)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--spacing-element)' }}>
          <Input
            type="date"
            placeholder="Дата от"
            value={filters.date_from}
            onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
          />
          <Input
            type="date"
            placeholder="Дата до"
            value={filters.date_to}
            onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
          />
          <Input
            type="number"
            placeholder="ID организации"
            value={filters.organization_id}
            onChange={(e) => setFilters({ ...filters, organization_id: e.target.value })}
          />
          <Select
            value={filters.anomaly_type}
            onChange={(e) => setFilters({ ...filters, anomaly_type: e.target.value })}
            placeholder="Тип аномалии"
          >
            <option value="">Все типы</option>
            {Object.entries(anomalyTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </div>
      </div>

      {stats && (
        <div className="stats-content">
          <Card>
            <Card.Header>
              <h3>Общая статистика</h3>
            </Card.Header>
            <Card.Body>
              <div className="stat-item">
                <span className="stat-label">Всего аномалий:</span>
                <Badge variant="error" size="large">{stats.total_anomalies}</Badge>
              </div>
            </Card.Body>
          </Card>

          {stats.by_type && Object.keys(stats.by_type).length > 0 && (
            <Card style={{ marginTop: 'var(--spacing-section)' }}>
              <Card.Header>
                <h3>По типам аномалий</h3>
              </Card.Header>
              <Card.Body>
                <div className="stats-grid">
                  {Object.entries(stats.by_type).map(([type, count]) => (
                    <div key={type} className="stat-item">
                      <span className="stat-label">{anomalyTypeLabels[type] || type}:</span>
                      <Badge variant="error">{count}</Badge>
                    </div>
                  ))}
                </div>
              </Card.Body>
            </Card>
          )}

          {stats.by_status && Object.keys(stats.by_status).length > 0 && (
            <Card style={{ marginTop: 'var(--spacing-section)' }}>
              <Card.Header>
                <h3>По статусам соответствия</h3>
              </Card.Header>
              <Card.Body>
                <div className="stats-grid">
                  {Object.entries(stats.by_status).map(([status, count]) => (
                    <div key={status} className="stat-item">
                      <span className="stat-label">{matchStatusLabels[status] || status}:</span>
                      <Badge variant="warning">{count}</Badge>
                    </div>
                  ))}
                </div>
              </Card.Body>
            </Card>
          )}

          {stats.total_anomalies === 0 && (
            <Alert variant="success" style={{ marginTop: 'var(--spacing-section)' }}>
              Аномалий не обнаружено за выбранный период
            </Alert>
          )}
        </div>
      )}
    </div>
  )
}

export default AnomaliesStats
