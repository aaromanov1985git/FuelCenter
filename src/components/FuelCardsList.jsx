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
  
  // Пагинация
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [limit] = useState(50) // Количество записей на странице
  
  // Фильтры
  const [filters, setFilters] = useState({
    card_number: '',
    provider: '',
    status: '' // 'all', 'active', 'blocked'
  })
  
  const debouncedCardNumber = useDebounce(filters.card_number, 500)
  const debouncedProvider = useDebounce(filters.provider, 500)

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
      
      const response = await authFetch(`${API_URL}/api/v1/fuel-cards?${params}`)
      if (!response.ok) throw new Error('Ошибка загрузки данных')
      
      const result = await response.json()
      
      // Фильтруем по провайдеру на клиенте, если нужно
      let filteredItems = result.items
      if (debouncedProvider) {
        filteredItems = result.items.filter(card => {
          const providerName = getProviderName(card.provider_id).toLowerCase()
          return providerName.includes(debouncedProvider.toLowerCase())
        })
        // Обновляем total для фильтрации по провайдеру
        setTotal(filteredItems.length)
      } else {
        setTotal(result.total)
      }
      
      setCards(filteredItems)
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
  }, [debouncedCardNumber, debouncedProvider, filters.status])

  useEffect(() => {
    loadCards()
  }, [currentPage, debouncedCardNumber, debouncedProvider, filters.status])

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

      // Получаем обновленные данные карты и обновляем форму
      const updatedCardResponse = await authFetch(`${API_URL}/api/v1/fuel-cards/${cardId}`)
      if (updatedCardResponse.ok) {
        const updatedCard = await updatedCardResponse.json()
        // Обновляем карту в состоянии - это обновит форму
        setEditingCard(updatedCard)
      }

      // Обновляем список карт в фоне (не блокируем UI)
      loadCards().catch(() => {})
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
        </Card.Header>

        <Card.Body>
          {/* Фильтры и поиск */}
          {cards.length > 0 && (
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
              placeholder: 'Введите название провайдера',
              type: 'text'
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
      )}

          {error && (
            <Alert variant="error" style={{ marginBottom: 'var(--spacing-element)' }}>
              {error}
            </Alert>
          )}

          {loading && cards.length === 0 ? (
            <Skeleton rows={10} columns={5} />
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

