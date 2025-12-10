import React, { useState, useEffect } from 'react'
import IconButton from './IconButton'
import StatusBadge from './StatusBadge'
import { SkeletonTable, SkeletonCard } from './Skeleton'
import { useToast } from './ToastContainer'
import { authFetch } from '../utils/api'
import './GasStationsList.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const GasStationsList = () => {
  const { error: showError, success } = useToast()
  const [gasStations, setGasStations] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ 
    original_name: '', 
    azs_number: '', 
    location: '', 
    region: '', 
    settlement: '' 
  })
  const [filter, setFilter] = useState('all') // all, pending, valid, invalid
  
  // Пагинация
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [limit] = useState(50) // Количество записей на странице

  // Состояния для дашборда
  const [stats, setStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(false)

  const loadGasStations = async () => {
    setLoading(true)
    setError('')
    
    try {
      const params = new URLSearchParams()
      if (filter !== 'all') {
        params.append('is_validated', filter)
      }
      params.append('skip', ((currentPage - 1) * limit).toString())
      params.append('limit', limit.toString())
      
      const response = await authFetch(`${API_URL}/api/v1/gas-stations?${params}`)
      if (!response.ok) throw new Error('Ошибка загрузки данных')
      
      const result = await response.json()
      setGasStations(result.items)
      setTotal(result.total)
    } catch (err) {
      setError('Ошибка загрузки: ' + err.message)
      showError('Ошибка загрузки АЗС: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const loadStats = async () => {
    setStatsLoading(true)
    
    try {
      const response = await authFetch(`${API_URL}/api/v1/gas-stations/stats`)
      if (!response.ok) throw new Error('Ошибка загрузки статистики')
      
      const result = await response.json()
      setStats(result)
    } catch (err) {
      showError('Ошибка загрузки статистики: ' + err.message)
    } finally {
      setStatsLoading(false)
    }
  }

  useEffect(() => {
    setCurrentPage(1) // Сбрасываем на первую страницу при смене фильтра
  }, [filter])

  useEffect(() => {
    loadGasStations()
    loadStats()
  }, [filter, currentPage])

  const handleEdit = (gasStation) => {
    setEditingId(gasStation.id)
    setEditForm({
      original_name: gasStation.original_name || '',
      azs_number: gasStation.azs_number || '',
      location: gasStation.location || '',
      region: gasStation.region || '',
      settlement: gasStation.settlement || ''
    })
  }

  const handleSave = async (gasStationId) => {
    try {
      setLoading(true)
      const response = await authFetch(`${API_URL}/api/v1/gas-stations/${gasStationId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(editForm)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Ошибка сохранения')
      }

      setEditingId(null)
      await loadGasStations()
      await loadStats()
      setError('')
      success('АЗС успешно обновлена')
    } catch (err) {
      const errorMessage = 'Ошибка сохранения: ' + err.message
      setError(errorMessage)
      showError(errorMessage)
    } finally {
      setLoading(false)
    }
  }
  
  // Проверяем, нужно ли перейти на предыдущую страницу после удаления
  useEffect(() => {
    if (total > 0 && currentPage > 1 && (currentPage - 1) * limit >= total) {
      setCurrentPage(prev => Math.max(1, prev - 1))
    }
  }, [total, currentPage, limit])

  const handleCancel = () => {
    setEditingId(null)
    setEditForm({ original_name: '', azs_number: '', location: '', region: '', settlement: '' })
  }

  const getStatusBadge = (status) => {
    const statusMap = {
      pending: 'pending',
      valid: 'valid',
      invalid: 'invalid'
    }
    return <StatusBadge status={statusMap[status] || 'pending'} size="small" />
  }

  return (
    <div className="gas-stations-list">
      {/* Дашборд статистики */}
      {stats && (
        <div className="dashboard-section errors-warnings-section">
          <h3>Статистика по АЗС</h3>
          
          <div className="errors-warnings-grid">
            <div className="errors-warnings-card">
              <div className="errors-warnings-card-header">
                <span className="errors-warnings-icon">⛽</span>
                <h4>Автозаправочные станции</h4>
              </div>
              <div className="errors-warnings-stats">
                <div className="stat-item stat-error">
                  <span className="stat-value">{stats.invalid}</span>
                  <span className="stat-label">С ошибками</span>
                </div>
                <div className="stat-item stat-warning">
                  <span className="stat-value">{stats.pending}</span>
                  <span className="stat-label">Требуют проверки</span>
                </div>
                <div className="stat-item stat-success">
                  <span className="stat-value">{stats.valid}</span>
                  <span className="stat-label">Валидные</span>
                </div>
                <div className="stat-item stat-total">
                  <span className="stat-value">{stats.total}</span>
                  <span className="stat-label">Всего</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {statsLoading && (
        <div className="dashboard-section">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
            <SkeletonCard />
          </div>
        </div>
      )}

      <div className="gas-stations-header">
        <h2>Справочник автозаправочных станций</h2>
        <div className="filter-buttons">
          <button 
            className={filter === 'all' ? 'active' : ''} 
            onClick={() => setFilter('all')}
          >
            Все
          </button>
          <button 
            className={filter === 'pending' ? 'active' : ''} 
            onClick={() => setFilter('pending')}
          >
            Требуют проверки
          </button>
          <button 
            className={filter === 'valid' ? 'active' : ''} 
            onClick={() => setFilter('valid')}
          >
            Валидные
          </button>
          <button 
            className={filter === 'invalid' ? 'active' : ''} 
            onClick={() => setFilter('invalid')}
          >
            С ошибками
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading && gasStations.length === 0 ? (
        <SkeletonTable rows={10} columns={7} />
      ) : (
        <div className="gas-stations-table-wrapper">
          <table className="gas-stations-table">
            <thead>
              <tr>
                <th>Исходное наименование</th>
                <th>Номер АЗС</th>
                <th>Местоположение</th>
                <th>Регион</th>
                <th>Населенный пункт</th>
                <th>Статус</th>
                <th>Ошибки</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {gasStations.map(gasStation => (
                <tr key={gasStation.id}>
                  <td>
                    {editingId === gasStation.id ? (
                      <input
                        type="text"
                        value={editForm.original_name}
                        onChange={(e) => setEditForm({...editForm, original_name: e.target.value})}
                        className="edit-input"
                        placeholder="Исходное наименование"
                      />
                    ) : (
                      gasStation.original_name
                    )}
                  </td>
                  <td>
                    {editingId === gasStation.id ? (
                      <input
                        type="text"
                        value={editForm.azs_number}
                        onChange={(e) => setEditForm({...editForm, azs_number: e.target.value})}
                        className="edit-input"
                        placeholder="Номер АЗС"
                      />
                    ) : (
                      gasStation.azs_number || '-'
                    )}
                  </td>
                  <td>
                    {editingId === gasStation.id ? (
                      <input
                        type="text"
                        value={editForm.location}
                        onChange={(e) => setEditForm({...editForm, location: e.target.value})}
                        className="edit-input"
                        placeholder="Местоположение"
                      />
                    ) : (
                      gasStation.location || '-'
                    )}
                  </td>
                  <td>
                    {editingId === gasStation.id ? (
                      <input
                        type="text"
                        value={editForm.region}
                        onChange={(e) => setEditForm({...editForm, region: e.target.value})}
                        className="edit-input"
                        placeholder="Регион"
                      />
                    ) : (
                      gasStation.region || '-'
                    )}
                  </td>
                  <td>
                    {editingId === gasStation.id ? (
                      <input
                        type="text"
                        value={editForm.settlement}
                        onChange={(e) => setEditForm({...editForm, settlement: e.target.value})}
                        className="edit-input"
                        placeholder="Населенный пункт"
                      />
                    ) : (
                      gasStation.settlement || '-'
                    )}
                  </td>
                  <td>{getStatusBadge(gasStation.is_validated)}</td>
                  <td className="errors-cell">
                    {gasStation.validation_errors ? (
                      <span className="error-text" title={gasStation.validation_errors}>
                        {gasStation.validation_errors}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>
                    {editingId === gasStation.id ? (
                      <div className="action-buttons">
                        <IconButton 
                          icon="save" 
                          variant="success" 
                          onClick={() => handleSave(gasStation.id)}
                          disabled={loading}
                          title="Сохранить"
                          size="small"
                        />
                        <IconButton 
                          icon="cancel" 
                          variant="secondary" 
                          onClick={handleCancel}
                          disabled={loading}
                          title="Отмена"
                          size="small"
                        />
                      </div>
                    ) : (
                      <IconButton 
                        icon="edit" 
                        variant="primary" 
                        onClick={() => handleEdit(gasStation)}
                        title="Редактировать"
                        size="small"
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {gasStations.length === 0 && (
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
    </div>
  )
}

export default GasStationsList

