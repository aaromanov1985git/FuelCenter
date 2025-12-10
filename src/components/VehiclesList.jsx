import React, { useState, useEffect } from 'react'
import IconButton from './IconButton'
import StatusBadge from './StatusBadge'
import MaskedInput from './MaskedInput'
import { SkeletonTable, SkeletonCard } from './Skeleton'
import { useToast } from './ToastContainer'
import { authFetch } from '../utils/api'
import './VehiclesList.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const VehiclesList = () => {
  const { error: showError } = useToast()
  const [vehicles, setVehicles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ garage_number: '', license_plate: '' })
  const [filter, setFilter] = useState('all') // all, pending, valid, invalid
  
  // Пагинация
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [limit] = useState(50) // Количество записей на странице

  // Состояния для компактного дашборда
  const [errorsWarnings, setErrorsWarnings] = useState(null)
  const [errorsLoading, setErrorsLoading] = useState(false)

  const loadVehicles = async () => {
    setLoading(true)
    setError('')
    
    try {
      const params = new URLSearchParams()
      if (filter !== 'all') {
        params.append('is_validated', filter)
      }
      params.append('skip', ((currentPage - 1) * limit).toString())
      params.append('limit', limit.toString())
      
      const response = await authFetch(`${API_URL}/api/v1/vehicles?${params}`)
      if (!response.ok) throw new Error('Ошибка загрузки данных')
      
      const result = await response.json()
      setVehicles(result.items)
      setTotal(result.total)
    } catch (err) {
      setError('Ошибка загрузки: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const loadErrorsWarnings = async () => {
    setErrorsLoading(true)
    
    try {
      const response = await authFetch(`${API_URL}/api/v1/dashboard/errors-warnings`)
      if (!response.ok) throw new Error('Ошибка загрузки данных')
      
      const result = await response.json()
      setErrorsWarnings(result)
    } catch (err) {
      const errorMessage = 'Ошибка загрузки статистики по ошибкам: ' + err.message
      showError(errorMessage)
    } finally {
      setErrorsLoading(false)
    }
  }

  useEffect(() => {
    setCurrentPage(1) // Сбрасываем на первую страницу при смене фильтра
  }, [filter])

  useEffect(() => {
    loadVehicles()
    loadErrorsWarnings()
  }, [filter, currentPage])

  const handleEdit = (vehicle) => {
    setEditingId(vehicle.id)
    setEditForm({
      garage_number: vehicle.garage_number || '',
      license_plate: vehicle.license_plate || ''
    })
  }

  const handleSave = async (vehicleId) => {
    try {
      setLoading(true)
      const response = await authFetch(`${API_URL}/api/v1/vehicles/${vehicleId}`, {
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
      await loadVehicles()
      setError('')
    } catch (err) {
      setError('Ошибка сохранения: ' + err.message)
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
    setEditForm({ garage_number: '', license_plate: '' })
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
    <div className="vehicles-list">
      {/* Компактный дашборд ошибок и предупреждений */}
      {errorsWarnings && (
        <div className="dashboard-section errors-warnings-section">
          <h3>Ошибки и предупреждения</h3>
          
          <div className="errors-warnings-grid">
            {/* Статистика по транспортным средствам */}
            <div className="errors-warnings-card">
              <div className="errors-warnings-card-header">
                <span className="errors-warnings-icon">🚗</span>
                <h4>Транспорт</h4>
              </div>
              <div className="errors-warnings-stats">
                <div className="stat-item stat-error">
                  <span className="stat-value">{errorsWarnings.vehicles.invalid}</span>
                  <span className="stat-label">С ошибками</span>
                </div>
                <div className="stat-item stat-warning">
                  <span className="stat-value">{errorsWarnings.vehicles.pending}</span>
                  <span className="stat-label">Требуют проверки</span>
                </div>
                <div className="stat-item stat-success">
                  <span className="stat-value">{errorsWarnings.vehicles.valid}</span>
                  <span className="stat-label">Валидные</span>
                </div>
                <div className="stat-item stat-total">
                  <span className="stat-value">{errorsWarnings.vehicles.total}</span>
                  <span className="stat-label">Всего</span>
                </div>
              </div>
            </div>

            {/* Транзакции с ошибками */}
            <div className="errors-warnings-card">
              <div className="errors-warnings-card-header">
                <span className="errors-warnings-icon">⚠️</span>
                <h4>Транзакции</h4>
              </div>
              <div className="errors-warnings-stats">
                <div className="stat-item stat-error">
                  <span className="stat-value">{errorsWarnings.transactions_with_errors}</span>
                  <span className="stat-label">С проблемными ТС</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {errorsLoading && (
        <div className="dashboard-section">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
            {Array.from({ length: 2 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </div>
      )}

      <div className="vehicles-header">
        <h2>Справочник транспортных средств</h2>
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

      {loading && vehicles.length === 0 ? (
        <SkeletonTable rows={10} columns={6} />
      ) : (
        <div className="vehicles-table-wrapper">
          <table className="vehicles-table">
            <thead>
              <tr>
                <th>Исходное наименование</th>
                <th>Гаражный номер</th>
                <th>Госномер</th>
                <th>Статус</th>
                <th>Ошибки</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map(vehicle => (
                <tr key={vehicle.id}>
                  <td>{vehicle.original_name}</td>
                  <td>
                    {editingId === vehicle.id ? (
                      <input
                        type="text"
                        value={editForm.garage_number}
                        onChange={(e) => setEditForm({...editForm, garage_number: e.target.value})}
                        className="edit-input"
                        placeholder="Гаражный номер (необязательно)"
                      />
                    ) : (
                      vehicle.garage_number || '-'
                    )}
                  </td>
                  <td>
                    {editingId === vehicle.id ? (
                      <MaskedInput
                        maskType="licensePlate"
                        value={editForm.license_plate}
                        onChange={(e) => setEditForm({...editForm, license_plate: e.target.value.toUpperCase()})}
                        className="edit-input"
                        placeholder="А123ВС77"
                      />
                    ) : (
                      vehicle.license_plate || '-'
                    )}
                  </td>
                  <td>{getStatusBadge(vehicle.is_validated)}</td>
                  <td className="errors-cell">
                    {vehicle.validation_errors ? (
                      <span className="error-text" title={vehicle.validation_errors}>
                        {vehicle.validation_errors}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>
                    {editingId === vehicle.id ? (
                      <div className="action-buttons">
                        <IconButton 
                          icon="save" 
                          variant="success" 
                          onClick={() => handleSave(vehicle.id)}
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
                        onClick={() => handleEdit(vehicle)}
                        title="Редактировать"
                        size="small"
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {vehicles.length === 0 && (
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

export default VehiclesList

