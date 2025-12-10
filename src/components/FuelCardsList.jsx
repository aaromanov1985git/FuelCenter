import React, { useState, useEffect, useMemo } from 'react'
import { logger } from '../utils/logger'
import FuelCardEditModal from './FuelCardEditModal'
import IconButton from './IconButton'
import { SkeletonTable, SkeletonCard } from './Skeleton'
import { useToast } from './ToastContainer'
import AdvancedSearch from './AdvancedSearch'
import { useDebounce } from '../hooks/useDebounce'
import { authFetch } from '../utils/api'
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

      setEditingCard(null)
      await loadCards()
      setError('')
      success('Топливная карта успешно обновлена')
    } catch (err) {
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

  return (
    <div className="fuel-cards-list">
      {/* Компактный дашборд */}
      {stats && (
        <div className="dashboard-section fuel-cards-dashboard-section">
          <h3>Статистика по топливным картам</h3>
          
          <div className="fuel-cards-dashboard-grid">
            <div className="fuel-cards-dashboard-card">
              <div className="fuel-cards-dashboard-card-header">
                <span className="fuel-cards-dashboard-icon">💳</span>
                <h4>Всего карт</h4>
              </div>
              <div className="fuel-cards-dashboard-stat-value">
                {stats.total}
              </div>
            </div>

            <div className="fuel-cards-dashboard-card">
              <div className="fuel-cards-dashboard-card-header">
                <span className="fuel-cards-dashboard-icon">✅</span>
                <h4>Активных</h4>
              </div>
              <div className="fuel-cards-dashboard-stat-value stat-success">
                {stats.active}
              </div>
              <div className="fuel-cards-dashboard-stat-percent">
                {stats.total > 0 
                  ? ((stats.active / stats.total) * 100).toFixed(1)
                  : 0}%
              </div>
            </div>

            <div className="fuel-cards-dashboard-card">
              <div className="fuel-cards-dashboard-card-header">
                <span className="fuel-cards-dashboard-icon">🚫</span>
                <h4>Заблокированных</h4>
              </div>
              <div className="fuel-cards-dashboard-stat-value stat-error">
                {stats.blocked}
              </div>
              <div className="fuel-cards-dashboard-stat-percent">
                {stats.total > 0 
                  ? ((stats.blocked / stats.total) * 100).toFixed(1)
                  : 0}%
              </div>
            </div>

            <div className="fuel-cards-dashboard-card">
              <div className="fuel-cards-dashboard-card-header">
                <span className="fuel-cards-dashboard-icon">🚗</span>
                <h4>Закрепленных</h4>
              </div>
              <div className="fuel-cards-dashboard-stat-value stat-success">
                {stats.assigned}
              </div>
              <div className="fuel-cards-dashboard-stat-percent">
                {stats.total > 0 
                  ? ((stats.assigned / stats.total) * 100).toFixed(1)
                  : 0}%
              </div>
            </div>

            <div className="fuel-cards-dashboard-card">
              <div className="fuel-cards-dashboard-card-header">
                <span className="fuel-cards-dashboard-icon">📭</span>
                <h4>Не закрепленных</h4>
              </div>
              <div className="fuel-cards-dashboard-stat-value stat-warning">
                {stats.unassigned}
              </div>
              <div className="fuel-cards-dashboard-stat-percent">
                {stats.total > 0 
                  ? ((stats.unassigned / stats.total) * 100).toFixed(1)
                  : 0}%
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="fuel-cards-header">
        <h2>Справочник топливных карт</h2>
      </div>

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

      {error && <div className="error-message">{error}</div>}

      {loading && cards.length === 0 ? (
        <SkeletonTable rows={10} columns={5} />
      ) : (
        <div className="cards-table-wrapper">
          <table className="cards-table">
            <thead>
              <tr>
                <th>Номер карты</th>
                <th>Провайдер</th>
                <th>Закреплена за ТС</th>
                <th>Статус</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {cards.map(card => (
                <tr key={card.id} className={card.is_blocked ? 'blocked-card' : ''}>
                  <td data-label="Номер карты">{card.card_number}</td>
                  <td data-label="Провайдер">{getProviderName(card.provider_id)}</td>
                  <td data-label="Закреплена за ТС">{getVehicleName(card.vehicle_id)}</td>
                  <td data-label="Статус">
                    {card.is_blocked ? (
                      <span className="blocked-badge">Заблокирована</span>
                    ) : (
                      <span className="active-badge">Активна</span>
                    )}
                  </td>
                  <td data-label="Действия">
                    <IconButton 
                      icon="edit" 
                      variant="primary" 
                      onClick={() => handleEdit(card)}
                      title="Редактировать"
                      size="small"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {cards.length === 0 && (
            <div className="empty-state">Нет данных для отображения</div>
          )}
        </div>
      )}
      
      {/* Пагинация */}
      {total > limit && (
        <div className="pagination">
          <button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1 || loading}
            className="pagination-btn"
          >
            Предыдущая
          </button>
          <span className="pagination-info">
            Страница {currentPage} из {Math.ceil(total / limit)} (всего: {total})
          </span>
          <button
            onClick={() => setCurrentPage(prev => Math.min(Math.ceil(total / limit), prev + 1))}
            disabled={currentPage >= Math.ceil(total / limit) || loading}
            className="pagination-btn"
          >
            Следующая
          </button>
        </div>
      )}

      <FuelCardEditModal
        isOpen={editingCard !== null}
        card={editingCard}
        vehicles={vehicles}
        providers={providers}
        onSave={handleSave}
        onCancel={handleCancel}
        loading={loading}
      />
    </div>
  )
}

export default FuelCardsList

