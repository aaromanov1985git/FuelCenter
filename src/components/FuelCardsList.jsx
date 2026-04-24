import React, { useState, useEffect, useMemo } from 'react'
import { logger } from '../utils/logger'
import FuelCardEditModal from './FuelCardEditModal'
import IconButton from './IconButton'
import { useToast } from './ToastContainer'
import AdvancedSearch from './AdvancedSearch'
import { useDebounce } from '../hooks/useDebounce'
import { authFetch } from '../utils/api'
import { Card, Button, Table, Badge, Skeleton, Alert } from './ui'
import './FuelCardsList.css'

const PROVIDER_STYLES = {
  'Газпромнефть': { grad: 'linear-gradient(135deg,#7c5cff,#4338ca)', accent: '#b16cff' },
  'Лукойл':       { grad: 'linear-gradient(135deg,#ef4444,#b91c1c)', accent: '#fca5a5' },
  'Роснефть':     { grad: 'linear-gradient(135deg,#ffb547,#b45309)', accent: '#fde68a' },
  'Татнефть':     { grad: 'linear-gradient(135deg,#22d3a7,#065f46)', accent: '#6ee7b7' },
  default:        { grad: 'linear-gradient(135deg,#626b7f,#374151)', accent: '#97a0b3' },
}

const IconGrid = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d="M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z" stroke="currentColor" strokeWidth="1.4"/>
  </svg>
)
const IconList = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d="M3 4h10M3 8h10M3 12h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
)

const FuelCardVisual = ({ card, providerName, onEdit }) => {
  const ps = PROVIDER_STYLES[providerName] || PROVIDER_STYLES.default
  const isBlocked = card.is_blocked
  const number = card.card_number || '•••• •••• •••• ••••'

  return (
    <div className="fc-visual-wrap">
      {/* Gradient card face */}
      <div className="fc-card-face" style={{ background: ps.grad }}>
        <div className="fc-card-glow" style={{ background: ps.accent }} />
        <div className="fc-card-top">
          <div>
            <div className="fc-card-provider">{providerName || '—'}</div>
            <div className="fc-card-owner">{card.normalized_owner || card.original_owner_name || '—'}</div>
          </div>
          <div className="fc-card-chip">
            <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
              <path d="M1 4h14M1 6h14M1 8h14" stroke="#fff" strokeWidth="1" opacity=".6"/>
            </svg>
          </div>
        </div>
        <div className="fc-card-number">{number}</div>
        <div className="fc-card-footer">
          <span>Статус</span>
          <span className="fc-card-expires">
            {isBlocked ? 'Заблокирована' : 'Активна'}
          </span>
        </div>
      </div>

      {/* Info below card */}
      <div className="fc-card-info">
        <div className="fc-card-status-row">
          <span
            className="fc-status-chip"
            style={{ color: isBlocked ? 'var(--red)' : 'var(--green)', background: isBlocked ? 'var(--red-soft)' : 'var(--green-soft)' }}
          >
            {isBlocked ? 'Заблокирована' : 'Активна'}
          </span>
          <button className="fc-edit-btn" onClick={() => onEdit(card)} title="Редактировать">⋯</button>
        </div>
      </div>
    </div>
  )
}

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

const FuelCardsList = () => {
  const { error: showError, success } = useToast()
  const [cards, setCards] = useState([])
  const [allCards, setAllCards] = useState([]) // Все карты для статистики
  const [vehicles, setVehicles] = useState([])
  const [providers, setProviders] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [editingCard, setEditingCard] = useState(null)
  const [viewMode, setViewMode] = useState('list') // 'list' | 'grid'
  
  // Пагинация
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [limit, setLimit] = useState(10) // Количество записей на странице
  
  // Фильтры
  const [filters, setFilters] = useState({
    card_number: '',
    provider: '', // Теперь это ID провайдера
    status: '' // 'all', 'active', 'blocked'
  })
  
  const debouncedCardNumber = useDebounce(filters.card_number, 500)
  // Для провайдера не нужен debounce, так как это селект

  // Загрузка всех карт для статистики
  const loadAllCards = async () => {
    try {
      const response = await authFetch(`${API_URL}/api/v1/fuel-cards?limit=10000`)
      if (response.ok) {
        const result = await response.json()
        setAllCards(result.items)
      }
    } catch (err) {
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
      logger.error('Ошибка загрузки всех карт для статистики', { error: err.message })
    }
  }

  const loadCards = async () => {
    setLoading(true)
    setError('')
    
    try {
      const params = new URLSearchParams()
      params.append('skip', ((currentPage - 1) * limit).toString())
      params.append('limit', limit.toString())
      
      // Добавляем фильтр по статусу
      if (filters.status === 'blocked') {
        params.append('is_blocked', 'true')
      } else if (filters.status === 'active') {
        params.append('is_blocked', 'false')
      }
      // Если статус не выбран или пустой, показываем все
      
      // Фильтр по номеру карты
      if (debouncedCardNumber) {
        params.append('card_number', debouncedCardNumber)
      }
      
      // Фильтр по провайдеру (ID)
      if (filters.provider) {
        params.append('provider_id', filters.provider)
      }
      
      const response = await authFetch(`${API_URL}/api/v1/fuel-cards?${params}`)
      if (!response.ok) throw new Error('Ошибка загрузки данных')
      
      const result = await response.json()
      
      // Устанавливаем total из ответа API
      setTotal(result.total || 0)
      setCards(result.items)
      
      logger.debug('Карты загружены', { 
        total: result.total, 
        itemsCount: result.items.length, 
        currentPage,
        limit
      })
    } catch (err) {
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
      setError('Ошибка загрузки: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const loadVehicles = async () => {
    try {
      const response = await authFetch(`${API_URL}/api/v1/vehicles?limit=1000`)
      if (response.ok) {
        const result = await response.json()
        setVehicles(result.items)
        logger.debug('ТС загружены в FuelCardsList', { count: result.items.length })
      }
    } catch (err) {
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
      logger.error('Ошибка загрузки ТС', { error: err.message })
    }
  }

  const loadProviders = async () => {
    try {
      const response = await authFetch(`${API_URL}/api/v1/providers?limit=1000`)
      if (response.ok) {
        const result = await response.json()
        setProviders(result.items)
        logger.debug('Провайдеры загружены в FuelCardsList', { count: result.items.length })
      }
    } catch (err) {
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
      logger.error('Ошибка загрузки провайдеров', { error: err.message })
    }
  }

  // Вычисление статистики
  const stats = useMemo(() => {
    if (allCards.length === 0) return null
    
    const total = allCards.length
    const blocked = allCards.filter(c => c.is_blocked).length
    const active = total - blocked
    const assigned = allCards.filter(c => c.vehicle_id).length
    const unassigned = total - assigned
    
    return {
      total,
      blocked,
      active,
      assigned,
      unassigned
    }
  }, [allCards])

  useEffect(() => {
    loadAllCards()
    loadVehicles()
    loadProviders()
  }, [])

  useEffect(() => {
    setCurrentPage(1) // Сбрасываем на первую страницу при изменении фильтров
  }, [debouncedCardNumber, filters.provider, filters.status])

  useEffect(() => {
    loadCards()
  }, [currentPage, debouncedCardNumber, filters.provider, filters.status, limit])

  const handleEdit = (card) => {
    setEditingCard(card)
  }

  const handleSave = async (cardId, data) => {
    try {
      setLoading(true)
      setError('')
      
      const response = await authFetch(`${API_URL}/api/v1/fuel-cards/${cardId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Ошибка сохранения')
      }

      // Показываем уведомление об успешном сохранении СРАЗУ
      success('Топливная карта успешно обновлена')

      // Обновляем список карт в фоне (не блокируем UI)
      loadCards().catch(() => {})

      // Закрываем форму после успешного сохранения
      setEditingCard(null)
    } catch (err) {
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
      const errorMessage = 'Ошибка сохранения: ' + err.message
      setError(errorMessage)
      showError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    setEditingCard(null)
  }
  
  // Проверяем, нужно ли перейти на предыдущую страницу после удаления
  useEffect(() => {
    if (total > 0 && currentPage > 1 && (currentPage - 1) * limit >= total) {
      setCurrentPage(prev => Math.max(1, prev - 1))
    }
  }, [total, currentPage, limit])

  const getVehicleName = (vehicleId) => {
    if (!vehicleId) return '-'
    const vehicle = vehicles.find(v => v.id === vehicleId)
    return vehicle ? vehicle.original_name : `ID: ${vehicleId}`
  }

  const getProviderName = (providerId) => {
    if (!providerId) return '-'
    const provider = providers.find(p => p.id === providerId)
    return provider ? provider.name : `ID: ${providerId}`
  }

  // Подготовка данных для таблицы
  const tableColumns = [
    { key: 'card_number', header: 'Номер карты' },
    { key: 'provider', header: 'Провайдер' },
    { key: 'owner', header: 'Владелец' },
    { key: 'vehicle', header: 'Закреплена за ТС' },
    { key: 'status', header: 'Статус' },
    { key: 'actions', header: 'Действия' }
  ]

  const tableData = cards.map(card => ({
    id: card.id,
    card_number: card.card_number,
    provider: getProviderName(card.provider_id),
    owner: card.normalized_owner || card.original_owner_name || '-',
    vehicle: getVehicleName(card.vehicle_id),
    status: card.is_blocked ? (
      <Badge variant="error" size="sm">Заблокирована</Badge>
    ) : (
      <Badge variant="success" size="sm">Активна</Badge>
    ),
    actions: (
      <IconButton 
        icon="edit" 
        variant="primary" 
        onClick={() => handleEdit(card)}
        title="Редактировать"
        size="small"
      />
    ),
    className: card.is_blocked ? 'blocked-card' : ''
  }))

  return (
    <>
      {/* Компактный дашборд */}
      {stats && (
        <div className="stats-grid">
          <Card variant="outlined" padding="sm">
            <div className="stat-card-header">
              <span>💳</span>
              <h4 className="stat-card-title">Всего карт</h4>
            </div>
            <div className="stat-card-value">
              {stats.total}
            </div>
          </Card>

          <Card variant="outlined" padding="sm">
            <div className="stat-card-header">
              <span>✅</span>
              <h4 className="stat-card-title">Активных</h4>
            </div>
            <div className="stat-card-value success">
              {stats.active}
            </div>
            <div className="stat-card-percent">
              {stats.total > 0 ? ((stats.active / stats.total) * 100).toFixed(1) : 0}%
            </div>
          </Card>

          <Card variant="outlined" padding="sm">
            <div className="stat-card-header">
              <span>🚫</span>
              <h4 className="stat-card-title">Заблокированных</h4>
            </div>
            <div className="stat-card-value error">
              {stats.blocked}
            </div>
            <div className="stat-card-percent">
              {stats.total > 0 ? ((stats.blocked / stats.total) * 100).toFixed(1) : 0}%
            </div>
          </Card>

          <Card variant="outlined" padding="sm">
            <div className="stat-card-header">
              <span>🚗</span>
              <h4 className="stat-card-title">Закрепленных</h4>
            </div>
            <div className="stat-card-value success">
              {stats.assigned}
            </div>
            <div className="stat-card-percent">
              {stats.total > 0 ? ((stats.assigned / stats.total) * 100).toFixed(1) : 0}%
            </div>
          </Card>

          <Card variant="outlined" padding="sm">
            <div className="stat-card-header">
              <span>📭</span>
              <h4 className="stat-card-title">Не закрепленных</h4>
            </div>
            <div className="stat-card-value warning">
              {stats.unassigned}
            </div>
            <div className="stat-card-percent">
              {stats.total > 0 ? ((stats.unassigned / stats.total) * 100).toFixed(1) : 0}%
            </div>
          </Card>
        </div>
      )}

      <Card>
        <Card.Header>
          <Card.Title>Справочник топливных карт</Card.Title>
          <div className="fc-view-toggle">
            <button
              className={`fc-view-btn${viewMode === 'list' ? ' active' : ''}`}
              onClick={() => setViewMode('list')}
              title="Список"
            >
              <IconList />
            </button>
            <button
              className={`fc-view-btn${viewMode === 'grid' ? ' active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Сетка"
            >
              <IconGrid />
            </button>
          </div>
        </Card.Header>

        <Card.Body>
          {/* Фильтры и поиск */}
          <AdvancedSearch
            filters={filters}
            onFiltersChange={setFilters}
            onClear={() => setFilters({ card_number: '', provider: '', status: '' })}
            loading={loading}
            filterConfig={[
              {
                key: 'card_number',
                label: 'Номер карты',
                placeholder: 'Введите номер карты',
                type: 'text'
              },
              {
                key: 'provider',
                label: 'Провайдер',
                placeholder: 'Выберите провайдера',
                type: 'select',
                options: providers
                  .filter(p => p.is_active)
                  .map(provider => ({
                    value: provider.id.toString(),
                    label: provider.name
                  }))
              },
              {
                key: 'status',
                label: 'Статус',
                placeholder: 'Выберите статус',
                type: 'select',
                options: [
                  { value: '', label: 'Все' },
                  { value: 'active', label: 'Активные' },
                  { value: 'blocked', label: 'Заблокированные' }
                ]
              }
            ]}
          />

          {error && (
            <Alert variant="error" style={{ marginBottom: 'var(--spacing-element)' }}>
              {error}
            </Alert>
          )}

          {loading && cards.length === 0 ? (
            <Skeleton rows={10} columns={5} />
          ) : viewMode === 'grid' ? (
            <div className="fc-grid">
              {cards.map(card => (
                <FuelCardVisual
                  key={card.id}
                  card={card}
                  providerName={getProviderName(card.provider_id)}
                  onEdit={handleEdit}
                />
              ))}
              {cards.length === 0 && (
                <div className="fc-grid-empty">Нет данных для отображения</div>
              )}
            </div>
          ) : (
            <Table
              columns={tableColumns}
              data={tableData}
              emptyMessage="Нет данных для отображения"
            />
          )}
          {total > 0 && Math.ceil(total / limit) > 1 && (
            <Table.Pagination
              currentPage={currentPage}
              totalPages={Math.ceil(total / limit)}
              total={total}
              pageSize={limit}
              onPageChange={setCurrentPage}
              onPageSizeChange={(newLimit) => {
                setLimit(newLimit)
                setCurrentPage(1)
              }}
              pageSizeOptions={[10, 25, 50, 100]}
            />
          )}
        </Card.Body>
      </Card>

      <FuelCardEditModal
        isOpen={editingCard !== null}
        card={editingCard}
        vehicles={vehicles}
        providers={providers}
        onSave={handleSave}
        onCancel={handleCancel}
        loading={loading}
        onCardUpdated={async () => {
          // Перезагружаем данные карты после обновления из API
          if (editingCard) {
            try {
              const response = await authFetch(`${API_URL}/api/v1/fuel-cards/${editingCard.id}`)
              if (response.ok) {
                const updatedCard = await response.json()
                setEditingCard(updatedCard)
                await loadCards()
              }
            } catch (err) {
              // Игнорируем ошибки
            }
          }
        }}
      />
    </>
  )
}

export default FuelCardsList

