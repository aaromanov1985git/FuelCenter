import React, { useState, useEffect, useMemo } from 'react'
import { logger } from '../utils/logger'
import FuelCardEditModal from './FuelCardEditModal'
import IconButton from './IconButton'
import { useToast } from './ToastContainer'
import AdvancedSearch from './AdvancedSearch'
import { useDebounce } from '../hooks/useDebounce'
import { authFetch } from '../utils/api'
import { Card, Table, Skeleton, Alert, Icon } from './ui'
import './FuelCardsList.css'

const API_URL = import.meta.env.VITE_API_URL || ''

// Форматирование номера карты группами по 4
const formatCardNumber = (num) => {
  if (!num) return ''
  const s = String(num).replace(/\s+/g, '')
  return s.replace(/(.{4})/g, '$1 ').trim()
}

const FuelCardsList = () => {
  const { error: showError, success } = useToast()
  const [cards, setCards] = useState([])
  const [allCards, setAllCards] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [providers, setProviders] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [editingCard, setEditingCard] = useState(null)
  const [view, setView] = useState('grid') // grid | list

  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [limit, setLimit] = useState(12)

  const [filters, setFilters] = useState({
    card_number: '',
    provider: '',
    status: ''
  })

  const debouncedCardNumber = useDebounce(filters.card_number, 500)

  const loadAllCards = async () => {
    try {
      const response = await authFetch(`${API_URL}/api/v1/fuel-cards?limit=10000`)
      if (response.ok) {
        const result = await response.json()
        setAllCards(result.items)
      }
    } catch (err) {
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

      if (filters.status === 'blocked') {
        params.append('is_blocked', 'true')
      } else if (filters.status === 'active') {
        params.append('is_blocked', 'false')
      }

      if (debouncedCardNumber) {
        params.append('card_number', debouncedCardNumber)
      }

      if (filters.provider) {
        params.append('provider_id', filters.provider)
      }

      const response = await authFetch(`${API_URL}/api/v1/fuel-cards?${params}`)
      if (!response.ok) throw new Error('Ошибка загрузки данных')

      const result = await response.json()

      setTotal(result.total || 0)
      setCards(result.items)

      logger.debug('Карты загружены', {
        total: result.total,
        itemsCount: result.items.length,
        currentPage,
        limit
      })
    } catch (err) {
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
      if (err.isUnauthorized) {
        return
      }
      logger.error('Ошибка загрузки провайдеров', { error: err.message })
    }
  }

  const stats = useMemo(() => {
    if (allCards.length === 0) return null

    const total = allCards.length
    const blocked = allCards.filter(c => c.is_blocked).length
    const active = total - blocked
    const assigned = allCards.filter(c => c.vehicle_id).length

    return {
      total,
      blocked,
      active,
      assigned
    }
  }, [allCards])

  useEffect(() => {
    loadAllCards()
    loadVehicles()
    loadProviders()
  }, [])

  useEffect(() => {
    setCurrentPage(1)
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

      success('Топливная карта успешно обновлена')

      loadCards().catch(() => {})

      setEditingCard(null)
    } catch (err) {
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

  // Данные для табличного представления
  const tableColumns = [
    { key: 'card_number', header: '№ карты' },
    { key: 'provider', header: 'Провайдер' },
    { key: 'owner', header: 'Держатель' },
    { key: 'vehicle', header: 'Автомобиль' },
    { key: 'status', header: 'Статус' },
    { key: 'actions', header: '' }
  ]

  const tableData = cards.map(card => ({
    id: card.id,
    card_number: (
      <span className="fc-cell-number">{formatCardNumber(card.card_number)}</span>
    ),
    provider: (
      <span className="fc-cell-provider">
        <span className="fc-provider-dot" aria-hidden="true" />
        {getProviderName(card.provider_id)}
      </span>
    ),
    owner: card.normalized_owner || card.original_owner_name || '-',
    vehicle: getVehicleName(card.vehicle_id),
    status: card.is_blocked ? (
      <span className="fc-chip fc-chip-red">Заблокирована</span>
    ) : (
      <span className="fc-chip fc-chip-green">Активна</span>
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
    className: card.is_blocked ? 'fc-row-blocked' : ''
  }))

  // Одна панель данных вместо «пластиковой карты»: блок .fc-card-top занимал
  // 150px из 284px карточки и нёс 73.5px строчных боксов — 51% высоты было
  // заливкой, а белый текст на градиенте давал 1.81–3.30:1 при пороге 4.5.
  const renderFuelCard = (card) => {
    const providerName = getProviderName(card.provider_id)
    const isBlocked = card.is_blocked
    const statusLabel = isBlocked ? 'Заблокирована' : 'Активна'
    const statusClass = isBlocked ? 'fc-chip fc-chip-red' : 'fc-chip fc-chip-green'
    const vehicleLabel = getVehicleName(card.vehicle_id)
    const ownerLabel = card.normalized_owner || card.original_owner_name || '—'
    const numberLabel = formatCardNumber(card.card_number) || '—'

    return (
      <div
        key={card.id}
        className={`fc-card-wrap ${isBlocked ? 'fc-card-blocked' : ''}`}
        data-testid={`fuel-card-${card.id}`}
      >
        <div className="fc-card">
          <div className="fc-card-row">
            <span className="fc-card-number" title={numberLabel}>{numberLabel}</span>
            <span className="fc-card-id">#{card.id}</span>
          </div>
          <div className="fc-card-row">
            <span className="fc-card-provider">
              <span className="fc-provider-dot" aria-hidden="true" />
              <span className="fc-card-provider-name" title={providerName}>{providerName}</span>
            </span>
            <span className={statusClass}>{statusLabel}</span>
          </div>
          <div className="fc-card-meta">
            <div className="fc-card-meta-item">
              <span className="fc-card-meta-label">Держатель</span>
              <span className="fc-card-meta-value" title={ownerLabel}>{ownerLabel}</span>
            </div>
            <div className="fc-card-meta-item">
              <span className="fc-card-meta-label">Автомобиль</span>
              <span className="fc-card-meta-value" title={vehicleLabel}>{vehicleLabel}</span>
            </div>
          </div>
          <div className="fc-card-actions">
            <IconButton
              icon="edit"
              variant="primary"
              onClick={() => handleEdit(card)}
              title="Редактировать"
              size="small"
            />
          </div>
        </div>
      </div>
    )
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="fc-root">
      {/* Четыре плитки вместо пяти, шесть чисел вместо девяти: «Не закреплённых»
          = «Всего» − «Закреплённых», а проценты активных и заблокированных
          давали в сумме ровно 100.0%. Независимых чисел в полосе — три. */}
      {stats && (
        <div className="fc-stats-grid">
          <div className="fc-stat">
            <div className="fc-stat-bar" />
            <div>
              <div className="fc-stat-label">Всего карт</div>
              <div className="fc-stat-value">{stats.total}</div>
            </div>
          </div>

          <div className="fc-stat">
            <div className="fc-stat-bar" />
            <div>
              <div className="fc-stat-label">Активных</div>
              <div className="fc-stat-value">{stats.active}</div>
            </div>
          </div>

          <div className="fc-stat">
            <div className="fc-stat-bar" />
            <div>
              <div className="fc-stat-label">Заблокировано</div>
              <div className="fc-stat-value">{stats.blocked}</div>
              <div className="fc-stat-sub">
                {stats.total > 0 ? ((stats.blocked / stats.total) * 100).toFixed(1) : 0}%
              </div>
            </div>
          </div>

          <div className="fc-stat">
            <div className="fc-stat-bar" />
            <div>
              <div className="fc-stat-label">Закреплено</div>
              <div className="fc-stat-value">{stats.assigned}</div>
              <div className="fc-stat-sub">из {stats.total}</div>
            </div>
          </div>
        </div>
      )}

      <Card className="fc-main-card">
        <Card.Header>
          <div className="fc-header-row">
            <Card.Title>Справочник топливных карт</Card.Title>
            <div className="fc-view-toggle" role="group" aria-label="Вид отображения">
              <button
                type="button"
                className={`fc-view-btn ${view === 'grid' ? 'is-active' : ''}`}
                onClick={() => setView('grid')}
                data-testid="fuel-cards-view-grid"
                aria-pressed={view === 'grid'}
                title="Плиткой"
              >
                <Icon name="grid" size={14} />
                <span>Плитка</span>
              </button>
              <button
                type="button"
                className={`fc-view-btn ${view === 'list' ? 'is-active' : ''}`}
                onClick={() => setView('list')}
                data-testid="fuel-cards-view-list"
                aria-pressed={view === 'list'}
                title="Списком"
              >
                <Icon name="rows" size={14} />
                <span>Список</span>
              </button>
            </div>
          </div>
        </Card.Header>

        <Card.Body>
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
          ) : (
            <>
              {view === 'grid' ? (
                cards.length === 0 ? (
                  <div className="fc-empty">Нет данных для отображения</div>
                ) : (
                  <div className="fc-grid">
                    {cards.map(card => renderFuelCard(card))}
                  </div>
                )
              ) : (
                <div className="fc-table-wrap">
                  <Table
                    columns={tableColumns}
                    data={tableData}
                    emptyMessage="Нет данных для отображения"
                  />
                </div>
              )}

              {total > 0 && totalPages > 1 && (
                <Table.Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  total={total}
                  pageSize={limit}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={(newLimit) => {
                    setLimit(newLimit)
                    setCurrentPage(1)
                  }}
                  pageSizeOptions={[12, 24, 48, 96]}
                />
              )}
            </>
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
          if (editingCard) {
            try {
              const response = await authFetch(`${API_URL}/api/v1/fuel-cards/${editingCard.id}`)
              if (response.ok) {
                const updatedCard = await response.json()
                setEditingCard(updatedCard)
                await loadCards()
              }
            } catch (err) {
              // ignore
            }
          }
        }}
      />
    </div>
  )
}

export default FuelCardsList
