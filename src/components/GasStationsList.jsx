import React, { useState, useEffect, useMemo, useCallback } from 'react'
import IconButton from './IconButton'
import StatusBadge from './StatusBadge'
import { useToast } from './ToastContainer'
import { authFetch } from '../utils/api'
import { Card, Button, Input, Table, Badge, Skeleton, Alert, Select, Modal, Tooltip } from './ui'
import './GasStationsList.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

const GasStationsList = () => {
  const { error: showError, success } = useToast()
  const [gasStations, setGasStations] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editForm, setEditForm] = useState({ 
    original_name: '', 
    provider_id: null,
    azs_number: '', 
    location: '', 
    region: '', 
    settlement: '',
    latitude: '',
    longitude: ''
  })
  const [providers, setProviders] = useState([])
  const [filter, setFilter] = useState('all') // all, pending, valid, invalid
  
  // Пагинация
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [limit] = useState(50) // Количество записей на странице

  // Состояния для дашборда
  const [stats, setStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(false)

  // Состояния для настройки полей
  const [showColumnSettings, setShowColumnSettings] = useState(false)
  const [columnSettings, setColumnSettings] = useState(() => {
    // Загружаем настройки из localStorage или используем значения по умолчанию
    const saved = localStorage.getItem('gasStationsColumnSettings')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch (e) {
        console.error('Ошибка загрузки настроек колонок:', e)
      }
    }
    // Значения по умолчанию - все колонки видимы
    return {
      original_name: { visible: true, order: 0 },
      provider: { visible: true, order: 1 },
      azs_number: { visible: true, order: 2 },
      location: { visible: true, order: 3 },
      region: { visible: true, order: 4 },
      settlement: { visible: true, order: 5 },
      coordinates: { visible: true, order: 6 },
      status: { visible: true, order: 7 },
      errors: { visible: true, order: 8 },
      actions: { visible: true, order: 9 }
    }
  })
  const [draggedColumn, setDraggedColumn] = useState(null)

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
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
      // Улучшенная обработка ошибок сети
      let errorMessage = 'Ошибка загрузки: ' + err.message
      if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
        errorMessage = 'Ошибка подключения к серверу. Проверьте, что бэкенд запущен и доступен.'
      }
      setError(errorMessage)
      showError(errorMessage)
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
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
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

  const loadProviders = async () => {
    try {
      const response = await authFetch(`${API_URL}/api/v1/providers?limit=1000`)
      if (response.ok) {
        const result = await response.json()
        setProviders(result.items || [])
      }
    } catch (err) {
      // Игнорируем ошибки загрузки провайдеров
    }
  }

  const getProviderName = useCallback((providerId) => {
    if (!providerId) return '-'
    const provider = providers.find(p => p.id === providerId)
    return provider ? provider.name : `ID: ${providerId}`
  }, [providers])

  useEffect(() => {
    loadProviders()
  }, [])

  const handleEdit = useCallback((gasStation) => {
    setEditingId(gasStation.id)
    setEditForm({
      original_name: gasStation.original_name || '',
      provider_id: gasStation.provider_id || null,
      azs_number: gasStation.azs_number || '',
      location: gasStation.location || '',
      region: gasStation.region || '',
      settlement: gasStation.settlement || '',
      latitude: gasStation.latitude !== null && gasStation.latitude !== undefined ? gasStation.latitude.toString() : '',
      longitude: gasStation.longitude !== null && gasStation.longitude !== undefined ? gasStation.longitude.toString() : ''
    })
    setShowEditModal(true)
  }, [])

  const handleSave = async (gasStationId) => {
    try {
      setLoading(true)
      // Исключаем original_name из данных для отправки - это поле нельзя редактировать
      const { original_name, ...updateData } = editForm
      // Преобразуем координаты в числа, если они заполнены
      if (updateData.latitude !== '') {
        updateData.latitude = parseFloat(updateData.latitude)
        if (isNaN(updateData.latitude)) {
          updateData.latitude = null
        }
      } else {
        updateData.latitude = null
      }
      if (updateData.longitude !== '') {
        updateData.longitude = parseFloat(updateData.longitude)
        if (isNaN(updateData.longitude)) {
          updateData.longitude = null
        }
      } else {
        updateData.longitude = null
      }
      const response = await authFetch(`${API_URL}/api/v1/gas-stations/${gasStationId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Ошибка сохранения')
      }

      setEditingId(null)
      setShowEditModal(false)
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
    setShowEditModal(false)
    setEditForm({ original_name: '', provider_id: null, azs_number: '', location: '', region: '', settlement: '', latitude: '', longitude: '' })
  }

  const getStatusBadge = (status) => {
    const statusMap = {
      pending: 'pending',
      valid: 'valid',
      invalid: 'invalid'
    }
    return <StatusBadge status={statusMap[status] || 'pending'} size="small" />
  }

  // Сохранение настроек колонок в localStorage
  useEffect(() => {
    localStorage.setItem('gasStationsColumnSettings', JSON.stringify(columnSettings))
  }, [columnSettings])

  // Подготовка данных для таблицы с учетом настроек
  const tableColumns = useMemo(() => {
    const allColumns = [
      { key: 'original_name', header: 'Исходное наименование' },
      { key: 'provider', header: 'Провайдер' },
      { key: 'azs_number', header: 'Номер АЗС' },
      { key: 'location', header: 'Местоположение' },
      { key: 'region', header: 'Регион' },
      { key: 'settlement', header: 'Населенный пункт' },
      { key: 'coordinates', header: 'Координаты' },
      { key: 'status', header: 'Статус' },
      { key: 'errors', header: 'Ошибки' },
      { key: 'actions', header: 'Действия' }
    ]

    // Фильтруем и сортируем колонки согласно настройкам
    // Колонка "actions" всегда видима
    return allColumns
      .filter(col => {
        if (col.key === 'actions') return true // Действия всегда видимы
        return columnSettings[col.key]?.visible !== false
      })
      .sort((a, b) => {
        const orderA = columnSettings[a.key]?.order ?? 999
        const orderB = columnSettings[b.key]?.order ?? 999
        return orderA - orderB
      })
  }, [columnSettings])

  const tableData = useMemo(() => {
    return gasStations.map(gasStation => {
      const location = gasStation.location || '-'
      const errors = gasStation.validation_errors || ''
      const originalName = gasStation.original_name || '-'
      
      return {
        id: gasStation.id,
        original_name: originalName !== '-' && originalName.length > 40 ? (
          <Tooltip content={originalName} position="top" maxWidth={400}>
            <span className="text-truncate">{originalName}</span>
          </Tooltip>
        ) : (
          originalName
        ),
        provider: getProviderName(gasStation.provider_id),
        azs_number: gasStation.azs_number || '-',
        location: location !== '-' && location.length > 50 ? (
          <Tooltip content={location} position="top" maxWidth={400}>
            <span className="text-truncate">{location}</span>
          </Tooltip>
        ) : (
          location
        ),
        region: gasStation.region || '-',
        settlement: gasStation.settlement || '-',
        coordinates: gasStation.latitude !== null && gasStation.longitude !== null 
          ? `${gasStation.latitude}, ${gasStation.longitude}`
          : '-',
        status: getStatusBadge(gasStation.is_validated),
        errors: errors ? (
          errors.length > 50 ? (
            <Tooltip content={errors} position="top" maxWidth={400}>
              <span className="error-text text-truncate">{errors}</span>
            </Tooltip>
          ) : (
            <span className="error-text" title={errors}>
              {errors}
            </span>
          )
        ) : (
          '-'
        ),
        actions: (
          <IconButton 
            icon="edit" 
            variant="primary" 
            onClick={() => handleEdit(gasStation)}
            title="Редактировать"
            size="small"
          />
        )
      }
    })
  }, [gasStations, getProviderName, handleEdit])

  return (
    <>
      {/* Дашборд статистики */}
      {stats && (
        <Card variant="outlined" className="stats-card">
          <Card.Header>
            <Card.Title>Статистика по АЗС</Card.Title>
          </Card.Header>
          <Card.Body>
            <div className="stats-grid-compact">
              <Card variant="outlined" padding="sm">
                <div className="stat-card-label">
                  С ошибками
                </div>
                <div className="stat-card-value-compact error">
                  {stats.invalid}
                </div>
              </Card>
              <Card variant="outlined" padding="sm">
                <div className="stat-card-label">
                  Требуют проверки
                </div>
                <div className="stat-card-value-compact warning">
                  {stats.pending}
                </div>
              </Card>
              <Card variant="outlined" padding="sm">
                <div className="stat-card-label">
                  Валидные
                </div>
                <div className="stat-card-value-compact success">
                  {stats.valid}
                </div>
              </Card>
              <Card variant="outlined" padding="sm">
                <div className="stat-card-label">
                  Всего
                </div>
                <div className="stat-card-value-compact">
                  {stats.total}
                </div>
              </Card>
            </div>
          </Card.Body>
        </Card>
      )}

      {statsLoading && (
        <Card variant="outlined" className="stats-loading-card">
          <Card.Body>
            <Skeleton rows={1} columns={4} />
          </Card.Body>
        </Card>
      )}

      <Card className="gas-stations-list">
        <Card.Header>
          <Card.Title>Справочник автозаправочных станций</Card.Title>
            <Card.Actions>
              <div style={{ display: 'flex', gap: 'var(--spacing-small)', alignItems: 'center' }}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowColumnSettings(true)}
                  title="Настроить поля"
                >
                  ⚙️ Настроить поля
                </Button>
                <div className="filter-buttons-container">
                  <Button
                    variant={filter === 'all' ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setFilter('all')}
                  >
                    Все
                  </Button>
                  <Button
                    variant={filter === 'pending' ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setFilter('pending')}
                  >
                    Требуют проверки
                  </Button>
                  <Button
                    variant={filter === 'valid' ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setFilter('valid')}
                  >
                    Валидные
                  </Button>
                  <Button
                    variant={filter === 'invalid' ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setFilter('invalid')}
                  >
                    С ошибками
                  </Button>
                </div>
              </div>
            </Card.Actions>
          </Card.Header>

          <Card.Body>
            {error && (
              <Alert variant="error" className="alert-with-margin">
                {error}
              </Alert>
            )}

            {loading && gasStations.length === 0 ? (
              <Skeleton rows={10} columns={8} />
            ) : (
            <Table
              columns={tableColumns}
              data={tableData}
              emptyMessage="Нет данных для отображения"
              compact
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

      {/* Модальное окно редактирования АЗС */}
      <Modal
        isOpen={showEditModal}
        onClose={handleCancel}
        title={`Редактирование АЗС ${editForm.azs_number || ''}`}
        size="md"
        closeOnOverlayClick={true}
        closeOnEsc={true}
        showCloseButton={true}
      >
        <Modal.Body>
          <div className="gas-station-edit-form">
            <div className="form-row">
              <Input
                type="text"
                label="Исходное наименование"
                value={editForm.original_name}
                onChange={(e) => setEditForm({...editForm, original_name: e.target.value})}
                disabled
                fullWidth
                title="Исходное наименование нельзя редактировать"
              />
            </div>
            
            <div className="form-row">
              <Select
                label="Провайдер"
                value={editForm.provider_id ? editForm.provider_id.toString() : ''}
                onChange={(value) => setEditForm({...editForm, provider_id: value ? parseInt(value) : null})}
                options={[
                  { value: '', label: 'Не указан' },
                  ...providers.filter(p => p.is_active).map(provider => ({
                    value: provider.id.toString(),
                    label: provider.name
                  }))
                ]}
                fullWidth
              />
            </div>

            <div className="form-row">
              <Input
                type="text"
                label="Номер АЗС"
                value={editForm.azs_number}
                onChange={(e) => setEditForm({...editForm, azs_number: e.target.value})}
                placeholder="Номер АЗС"
                fullWidth
              />
            </div>

            <div className="form-row">
              <Input
                type="text"
                label="Местоположение"
                value={editForm.location}
                onChange={(e) => setEditForm({...editForm, location: e.target.value})}
                placeholder="Местоположение"
                fullWidth
              />
            </div>

            <div className="form-row form-row-2">
              <Input
                type="text"
                label="Регион"
                value={editForm.region}
                onChange={(e) => setEditForm({...editForm, region: e.target.value})}
                placeholder="Регион"
                fullWidth
              />
              <Input
                type="text"
                label="Населенный пункт"
                value={editForm.settlement}
                onChange={(e) => setEditForm({...editForm, settlement: e.target.value})}
                placeholder="Населенный пункт"
                fullWidth
              />
            </div>

            <div className="form-row form-row-2">
              <Input
                type="number"
                step="any"
                label="Широта"
                value={editForm.latitude}
                onChange={(e) => setEditForm({...editForm, latitude: e.target.value})}
                placeholder="Широта"
                fullWidth
              />
              <Input
                type="number"
                step="any"
                label="Долгота"
                value={editForm.longitude}
                onChange={(e) => setEditForm({...editForm, longitude: e.target.value})}
                placeholder="Долгота"
                fullWidth
              />
            </div>

            <div className="form-actions">
              <Button
                variant="secondary"
                onClick={handleCancel}
                disabled={loading}
              >
                Отмена
              </Button>
              <Button
                variant="primary"
                onClick={() => editingId && handleSave(editingId)}
                disabled={loading}
              >
                {loading ? 'Сохранение...' : 'Сохранить'}
              </Button>
            </div>
          </div>
        </Modal.Body>
      </Modal>

      {/* Модальное окно настроек полей */}
      {showColumnSettings && (
        <div className="column-settings-modal" onClick={(e) => {
          if (e.target.classList.contains('column-settings-modal')) {
            setShowColumnSettings(false)
          }
        }}>
          <div className="column-settings-content" onClick={(e) => e.stopPropagation()}>
            <div className="column-settings-header">
              <h3 className="column-settings-title">Настройка полей таблицы</h3>
              <button
                className="column-settings-close"
                onClick={() => setShowColumnSettings(false)}
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>
            <p style={{ marginBottom: 'var(--spacing-block)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              Перетащите поля для изменения порядка. Отметьте галочками поля, которые хотите видеть в таблице.
            </p>
            <ul className="column-settings-list">
              {Object.entries(columnSettings)
                .sort(([, a], [, b]) => a.order - b.order)
                .map(([key, settings]) => {
                  const columnLabels = {
                    original_name: 'Исходное наименование',
                    provider: 'Провайдер',
                    azs_number: 'Номер АЗС',
                    location: 'Местоположение',
                    region: 'Регион',
                    settlement: 'Населенный пункт',
                    coordinates: 'Координаты',
                    status: 'Статус',
                    errors: 'Ошибки',
                    actions: 'Действия'
                  }
                  
                  return (
                    <li
                      key={key}
                      className={`column-settings-item ${draggedColumn === key ? 'dragging' : ''}`}
                      draggable
                      onDragStart={(e) => {
                        setDraggedColumn(key)
                        e.dataTransfer.effectAllowed = 'move'
                      }}
                      onDragOver={(e) => {
                        e.preventDefault()
                        e.dataTransfer.dropEffect = 'move'
                      }}
                      onDrop={(e) => {
                        e.preventDefault()
                        if (draggedColumn && draggedColumn !== key) {
                          const draggedOrder = columnSettings[draggedColumn].order
                          const targetOrder = columnSettings[key].order
                          
                          setColumnSettings(prev => {
                            const newSettings = { ...prev }
                            // Меняем порядок
                            Object.keys(newSettings).forEach(k => {
                              if (k === draggedColumn) {
                                newSettings[k] = { ...newSettings[k], order: targetOrder }
                              } else if (newSettings[k].order === targetOrder && k !== draggedColumn) {
                                newSettings[k] = { ...newSettings[k], order: draggedOrder }
                              }
                            })
                            return newSettings
                          })
                        }
                        setDraggedColumn(null)
                      }}
                      onDragEnd={() => setDraggedColumn(null)}
                    >
                      <span className="column-settings-item-handle">☰</span>
                      <input
                        type="checkbox"
                        className="column-settings-item-checkbox"
                        checked={settings.visible}
                        disabled={key === 'actions'} // Действия всегда видимы
                        onChange={(e) => {
                          setColumnSettings(prev => ({
                            ...prev,
                            [key]: { ...prev[key], visible: e.target.checked }
                          }))
                        }}
                      />
                      <span className="column-settings-item-label">
                        {columnLabels[key] || key}
                        {key === 'actions' && <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginLeft: 'var(--spacing-tiny)' }}>(обязательно)</span>}
                      </span>
                    </li>
                  )
                })}
            </ul>
            <div className="column-settings-actions">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  // Сброс к значениям по умолчанию
                  setColumnSettings({
                    original_name: { visible: true, order: 0 },
                    provider: { visible: true, order: 1 },
                    azs_number: { visible: true, order: 2 },
                    location: { visible: true, order: 3 },
                    region: { visible: true, order: 4 },
                    settlement: { visible: true, order: 5 },
                    coordinates: { visible: true, order: 6 },
                    status: { visible: true, order: 7 },
                    errors: { visible: true, order: 8 },
                    actions: { visible: true, order: 9 }
                  })
                }}
              >
                Сбросить
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowColumnSettings(false)}
              >
                Применить
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default GasStationsList

