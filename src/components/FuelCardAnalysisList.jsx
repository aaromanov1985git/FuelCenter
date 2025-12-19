import React, { useState, useEffect, useMemo } from 'react'
import { Card, Button, Table, Badge, Skeleton, Alert, Modal } from './ui'
import { authFetch } from '../utils/api'
import { useToast } from './ToastContainer'
import { useDebounce } from '../hooks/useDebounce'
import AdvancedSearch from './AdvancedSearch'
import FuelCardAnalysisModal from './FuelCardAnalysisModal'
import AnomaliesStats from './AnomaliesStats'
import StatusBadge from './StatusBadge'
import EmptyState from './EmptyState'
import './FuelCardAnalysisList.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

const formatDateTime = (value) => {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString('ru-RU')
  } catch {
    return value
  }
}

const formatDistance = (meters) => {
  if (!meters) return '—'
  if (meters < 1000) {
    return `${Math.round(meters)} м`
  }
  return `${(meters / 1000).toFixed(2)} км`
}

const matchStatusLabels = {
  matched: 'Совпадение',
  no_refuel: 'Нет заправки',
  location_mismatch: 'Несоответствие локации',
  quantity_mismatch: 'Несоответствие количества',
  time_mismatch: 'Несоответствие времени',
  multiple_matches: 'Несколько соответствий'
}

const matchStatusTone = {
  matched: 'success',
  no_refuel: 'error',
  location_mismatch: 'warning',
  quantity_mismatch: 'warning',
  time_mismatch: 'warning',
  multiple_matches: 'warning'
}

const anomalyTypeLabels = {
  fuel_theft: 'Кража топлива',
  card_misuse: 'Неправильное использование',
  data_error: 'Ошибка данных',
  equipment_failure: 'Сбой оборудования'
}

const FuelCardAnalysisList = () => {
  const { error: showError, success } = useToast()
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showAnalysisModal, setShowAnalysisModal] = useState(false)
  const [showStatsModal, setShowStatsModal] = useState(false)
  const [selectedResult, setSelectedResult] = useState(null)
  
  // Пагинация
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [limit] = useState(50)
  
  // Фильтры
  const [filters, setFilters] = useState({
    transaction_id: '',
    card_id: '',
    vehicle_id: '',
    match_status: '',
    is_anomaly: 'all',
    date_from: '',
    date_to: ''
  })
  
  const debouncedTransactionId = useDebounce(filters.transaction_id, 500)

  const loadResults = async () => {
    setLoading(true)
    setError('')
    
    try {
      const params = new URLSearchParams()
      params.append('skip', ((currentPage - 1) * limit).toString())
      params.append('limit', limit.toString())
      
      if (debouncedTransactionId) {
        params.append('transaction_id', debouncedTransactionId)
      }
      if (filters.card_id) {
        params.append('card_id', filters.card_id)
      }
      if (filters.vehicle_id) {
        params.append('vehicle_id', filters.vehicle_id)
      }
      if (filters.match_status) {
        params.append('match_status', filters.match_status)
      }
      if (filters.is_anomaly !== 'all') {
        params.append('is_anomaly', filters.is_anomaly === 'true')
      }
      if (filters.date_from) {
        params.append('date_from', filters.date_from)
      }
      if (filters.date_to) {
        params.append('date_to', filters.date_to)
      }
      
      const response = await authFetch(`${API_URL}/api/v1/fuel-card-analysis/results?${params}`)
      if (!response.ok) throw new Error('Ошибка загрузки данных')
      
      const result = await response.json()
      setResults(result.items || [])
      setTotal(result.total || 0)
    } catch (err) {
      if (err.isUnauthorized) return
      const errorMessage = 'Ошибка загрузки: ' + err.message
      setError(errorMessage)
      showError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadResults()
  }, [currentPage, debouncedTransactionId, filters.card_id, filters.vehicle_id, 
      filters.match_status, filters.is_anomaly, filters.date_from, filters.date_to])

  const handleAnalyze = () => {
    setShowAnalysisModal(true)
  }

  const handleAnalysisComplete = () => {
    loadResults()
    setShowAnalysisModal(false)
  }

  const handleViewDetails = (result) => {
    setSelectedResult(result)
  }

  const tableColumns = useMemo(() => [
    {
      key: 'id',
      label: 'ID',
      sortable: false,
      width: '80px'
    },
    {
      key: 'transaction_id',
      label: 'ID транзакции',
      sortable: false,
      width: '120px'
    },
    {
      key: 'match_status',
      label: 'Статус',
      sortable: false,
      width: '180px',
      render: (value) => (
        <StatusBadge 
          status={matchStatusTone[value] || 'default'} 
          text={matchStatusLabels[value] || value}
        />
      )
    },
    {
      key: 'match_confidence',
      label: 'Уверенность',
      sortable: false,
      width: '120px',
      render: (value) => value ? `${value}%` : '—'
    },
    {
      key: 'distance_to_azs',
      label: 'Расстояние до АЗС',
      sortable: false,
      width: '150px',
      render: (value) => formatDistance(value)
    },
    {
      key: 'is_anomaly',
      label: 'Аномалия',
      sortable: false,
      width: '120px',
      render: (value, row) => {
        if (!value) return <Badge variant="success">Нет</Badge>
        return (
          <Badge variant="error">
            {row.anomaly_type ? anomalyTypeLabels[row.anomaly_type] || row.anomaly_type : 'Да'}
          </Badge>
        )
      }
    },
    {
      key: 'analysis_date',
      label: 'Дата анализа',
      sortable: false,
      width: '180px',
      render: formatDateTime
    },
    {
      key: 'actions',
      label: 'Действия',
      sortable: false,
      width: '100px',
      render: (_, row) => (
        <Button
          variant="ghost"
          size="small"
          onClick={() => handleViewDetails(row)}
        >
          Детали
        </Button>
      )
    }
  ], [])

  const tableData = useMemo(() => {
    return results.map(result => ({
      id: result.id,
      transaction_id: result.transaction_id,
      match_status: result.match_status,
      match_confidence: result.match_confidence,
      distance_to_azs: result.distance_to_azs,
      is_anomaly: result.is_anomaly,
      anomaly_type: result.anomaly_type,
      analysis_date: result.analysis_date,
      ...result
    }))
  }, [results])

  return (
    <div className="fuel-card-analysis-list">
      <Card>
        <Card.Header>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <h2>Анализ топливных карт</h2>
            <div style={{ display: 'flex', gap: 'var(--spacing-element)' }}>
              <Button variant="secondary" onClick={() => setShowStatsModal(true)}>
                Статистика аномалий
              </Button>
              <Button variant="primary" onClick={handleAnalyze}>
                Запустить анализ
              </Button>
            </div>
          </div>
        </Card.Header>
        
        <Card.Body>
          {/* Фильтры */}
          <AdvancedSearch
            filters={filters}
            onFiltersChange={setFilters}
            onClear={() => setFilters({
              transaction_id: '',
              card_id: '',
              vehicle_id: '',
              match_status: '',
              is_anomaly: 'all',
              date_from: '',
              date_to: ''
            })}
            loading={loading}
            filterConfig={[
              {
                key: 'transaction_id',
                label: 'ID транзакции',
                placeholder: 'Введите ID транзакции',
                type: 'text'
              },
              {
                key: 'card_id',
                label: 'ID карты',
                placeholder: 'Введите ID карты',
                type: 'text'
              },
              {
                key: 'vehicle_id',
                label: 'ID ТС',
                placeholder: 'Введите ID ТС',
                type: 'text'
              },
              {
                key: 'match_status',
                label: 'Статус',
                placeholder: 'Выберите статус',
                type: 'select',
                options: [
                  ...Object.entries(matchStatusLabels).map(([value, label]) => ({
                    value,
                    label
                  }))
                ]
              },
              {
                key: 'is_anomaly',
                label: 'Аномалии',
                placeholder: 'Выберите фильтр',
                type: 'select',
                options: [
                  { value: 'all', label: 'Все' },
                  { value: 'true', label: 'Только аномалии' },
                  { value: 'false', label: 'Без аномалий' }
                ]
              },
              {
                key: 'date_from',
                label: 'Дата от',
                placeholder: 'Выберите дату',
                type: 'date'
              },
              {
                key: 'date_to',
                label: 'Дата до',
                placeholder: 'Выберите дату',
                type: 'date'
              }
            ]}
          />

          {error && (
            <Alert variant="error" style={{ marginBottom: 'var(--spacing-element)' }}>
              {error}
            </Alert>
          )}

          {loading && results.length === 0 ? (
            <Skeleton rows={10} columns={8} />
          ) : results.length === 0 ? (
            <EmptyState
              title="Нет результатов анализа"
              description="Запустите анализ транзакций для получения результатов"
              action={
                <Button variant="primary" onClick={handleAnalyze}>
                  Запустить анализ
                </Button>
              }
            />
          ) : (
            <Table
              columns={tableColumns}
              data={tableData}
              emptyMessage="Нет данных для отображения"
            >
              {total > limit && (
                <Table.Pagination
                  currentPage={currentPage}
                  totalPages={Math.ceil(total / limit)}
                  totalItems={total}
                  itemsPerPage={limit}
                  onPageChange={setCurrentPage}
                  disabled={loading}
                />
              )}
            </Table>
          )}
        </Card.Body>
      </Card>

      {/* Модальное окно для запуска анализа */}
      <FuelCardAnalysisModal
        isOpen={showAnalysisModal}
        onClose={() => setShowAnalysisModal(false)}
        onComplete={handleAnalysisComplete}
      />

      {/* Модальное окно статистики */}
      <Modal
        isOpen={showStatsModal}
        onClose={() => setShowStatsModal(false)}
        title="Статистика по аномалиям"
        size="lg"
      >
        <AnomaliesStats />
      </Modal>

      {/* Модальное окно деталей результата */}
      {selectedResult && (
        <Modal
          isOpen={!!selectedResult}
          onClose={() => setSelectedResult(null)}
          title={`Детали анализа #${selectedResult.id}`}
          size="lg"
        >
          <div style={{ padding: 'var(--spacing-section)' }}>
            <div style={{ display: 'grid', gap: 'var(--spacing-element)', marginBottom: 'var(--spacing-section)' }}>
              <div>
                <strong>ID транзакции:</strong> {selectedResult.transaction_id}
              </div>
              <div>
                <strong>Статус:</strong>{' '}
                <StatusBadge 
                  status={matchStatusTone[selectedResult.match_status] || 'default'} 
                  text={matchStatusLabels[selectedResult.match_status] || selectedResult.match_status}
                />
              </div>
              {selectedResult.match_confidence && (
                <div>
                  <strong>Уверенность:</strong> {selectedResult.match_confidence}%
                </div>
              )}
              {selectedResult.distance_to_azs && (
                <div>
                  <strong>Расстояние до АЗС:</strong> {formatDistance(selectedResult.distance_to_azs)}
                </div>
              )}
              {selectedResult.time_difference && (
                <div>
                  <strong>Разница во времени:</strong> {selectedResult.time_difference} сек
                </div>
              )}
              {selectedResult.quantity_difference && (
                <div>
                  <strong>Разница в количестве:</strong> {selectedResult.quantity_difference} л
                </div>
              )}
              {selectedResult.is_anomaly && (
                <div>
                  <strong>Тип аномалии:</strong>{' '}
                  {selectedResult.anomaly_type ? anomalyTypeLabels[selectedResult.anomaly_type] || selectedResult.anomaly_type : 'Не указан'}
                </div>
              )}
              {selectedResult.analysis_details && (
                <div>
                  <strong>Детали анализа:</strong>
                  <pre style={{ 
                    marginTop: 'var(--spacing-element)', 
                    padding: 'var(--spacing-element)',
                    backgroundColor: 'var(--color-bg-secondary)',
                    borderRadius: 'var(--radius-md)',
                    overflow: 'auto',
                    maxHeight: '400px'
                  }}>
                    {JSON.stringify(JSON.parse(selectedResult.analysis_details), null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default FuelCardAnalysisList
