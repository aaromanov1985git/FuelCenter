import React, { useState, useEffect, useMemo, useCallback } from 'react'
import IconButton from './IconButton'
import StatusBadge from './StatusBadge'
import { useToast } from './ToastContainer'
import { authFetch } from '../utils/api'
import { Card, Button, Input, Table, Badge, Skeleton, Alert, Select, Modal, Tooltip } from './ui'
import MapModal from './MapModal'
import ConfirmModal from './ConfirmModal'
import './GasStationsList.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

const GasStationsList = () => {
  const { error: showError, success } = useToast()
  const [gasStations, setGasStations] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showMapModal, setShowMapModal] = useState(false)
  const [editForm, setEditForm] = useState({ 
    original_name: '', 
    name: '',
    provider_id: null,
    azs_number: '', 
    location: '', 
    region: '', 
    settlement: '',
    latitude: '',
    longitude: ''
  })
  const [formErrors, setFormErrors] = useState({})
  const [providers, setProviders] = useState([])
  const [filter, setFilter] = useState('all') // all, pending, valid, invalid
  const [originalProviderId, setOriginalProviderId] = useState(null)
  const [hasTransactions, setHasTransactions] = useState(false)
  const [showProviderChangeConfirm, setShowProviderChangeConfirm] = useState(false)
  const [pendingProviderId, setPendingProviderId] = useState(null)
  
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
      name: { visible: true, order: 1 },
      provider: { visible: true, order: 2 },
      azs_number: { visible: true, order: 3 },
      location: { visible: true, order: 4 },
      region: { visible: true, order: 5 },
      settlement: { visible: true, order: 6 },
      coordinates: { visible: true, order: 7 },
      status: { visible: true, order: 8 },
      errors: { visible: true, order: 9 },
      actions: { visible: true, order: 10 }
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

  const checkHasTransactions = async (azsNumber) => {
    try {
      // Проверяем наличие транзакций через API с фильтром по номеру АЗС
      if (!azsNumber) {
        return false
      }
      const response = await authFetch(`${API_URL}/api/v1/transactions?azs_number=${encodeURIComponent(azsNumber)}&limit=1`)
      if (response.ok) {
        const data = await response.json()
        return data.total > 0
      }
      return false
    } catch (err) {
      console.error('Ошибка проверки транзакций:', err)
      return false
    }
  }

  const handleEdit = useCallback(async (gasStation) => {
    setEditingId(gasStation.id)
    const providerId = gasStation.provider_id || null
    setEditForm({
      original_name: gasStation.original_name || '',
      name: gasStation.name || gasStation.original_name || '',
      provider_id: providerId,
      azs_number: gasStation.azs_number || '',
      location: gasStation.location || '',
      region: gasStation.region || '',
      settlement: gasStation.settlement || '',
      latitude: gasStation.latitude !== null && gasStation.latitude !== undefined ? gasStation.latitude.toString() : '',
      longitude: gasStation.longitude !== null && gasStation.longitude !== undefined ? gasStation.longitude.toString() : ''
    })
    setOriginalProviderId(providerId)
    setFormErrors({})
    
    // Проверяем наличие транзакций по номеру АЗС
    const hasTrans = await checkHasTransactions(gasStation.azs_number)
    setHasTransactions(hasTrans)
    
    setShowEditModal(true)
  }, [])

  const handleSave = async (gasStationId) => {
    // Проверяем валидность координат перед отправкой
    const latError = validateCoordinate(editForm.latitude, 'latitude')
    const lngError = validateCoordinate(editForm.longitude, 'longitude')
    
    if (latError || lngError) {
      setFormErrors({
        latitude: latError || undefined,
        longitude: lngError || undefined
      })
      showError('Исправьте ошибки в координатах перед сохранением')
      return
    }

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
      setFormErrors({})
      await loadGasStations()
      await loadStats()
      setError('')
      success('Данные АЗС успешно обновлены')
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
    setEditForm({ original_name: '', name: '', provider_id: null, azs_number: '', location: '', region: '', settlement: '', latitude: '', longitude: '' })
    setFormErrors({})
    setOriginalProviderId(null)
    setHasTransactions(false)
    setShowProviderChangeConfirm(false)
    setPendingProviderId(null)
  }

  const handleProviderChangeConfirm = () => {
    setEditForm({...editForm, provider_id: pendingProviderId})
    setShowProviderChangeConfirm(false)
    setPendingProviderId(null)
  }

  const handleProviderChangeCancel = () => {
    // Возвращаем исходное значение провайдера
    setEditForm({...editForm, provider_id: originalProviderId})
    setShowProviderChangeConfirm(false)
    setPendingProviderId(null)
  }

  const validateCoordinate = (value, type) => {
    if (!value || value.trim() === '') return null // Координаты необязательны
    const num = parseFloat(value)
    if (isNaN(num)) {
      return `Введите корректное число`
    }
    if (type === 'latitude' && (num < -90 || num > 90)) {
      return `Широта должна быть от -90 до 90`
    }
    if (type === 'longitude' && (num < -180 || num > 180)) {
      return `Долгота должна быть от -180 до 180`
    }
    return null
  }

  const handleLatitudeChange = (e) => {
    const value = e.target.value
    setEditForm({...editForm, latitude: value})
    const error = validateCoordinate(value, 'latitude')
    setFormErrors(prev => ({ ...prev, latitude: error || undefined }))
  }

  const handleLongitudeChange = (e) => {
    const value = e.target.value
    setEditForm({...editForm, longitude: value})
    const error = validateCoordinate(value, 'longitude')
    setFormErrors(prev => ({ ...prev, longitude: error || undefined }))
  }

  const handleMapConfirm = (lat, lng) => {
    setEditForm(prev => ({
      ...prev,
      latitude: lat.toString(),
      longitude: lng.toString()
    }))
    // Очищаем ошибки координат при выборе на карте
    setFormErrors(prev => ({
      ...prev,
      latitude: undefined,
      longitude: undefined
    }))
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
      { key: 'name', header: 'Наименование' },
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
      const name = gasStation.name || originalName || '-'
      
      return {
        id: gasStation.id,
        original_name: originalName !== '-' && originalName.length > 40 ? (
          <Tooltip content={originalName} position="top" maxWidth={400}>
            <span className="text-truncate">{originalName}</span>
          </Tooltip>
        ) : (
          originalName
        ),
        name: name !== '-' && name.length > 40 ? (
          <Tooltip content={name} position="top" maxWidth={400}>
            <span className="text-truncate">{name}</span>
          </Tooltip>
        ) : (
          name
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
        title={editForm.name ? `Редактирование АЗС: "${editForm.name}"` : `Редактирование АЗС №${editForm.azs_number || '?'}`}
        size="md"
        closeOnOverlayClick={true}
        closeOnEsc={true}
        showCloseButton={true}
      >
        <Modal.Body>
          <div className="gas-station-edit-form">
            {/* Основная информация */}
            <div className="form-section">
              <h4 className="form-section-title">📝 Основная информация</h4>
              
              <div className="form-row">
                <Input
                  type="text"
                  label="Текущее название (для справки)"
                  value={editForm.original_name}
                  onChange={(e) => setEditForm({...editForm, original_name: e.target.value})}
                  disabled
                  fullWidth
                  name="original_name"
                />
              </div>
              
              <div className="form-row">
                <Input
                  type="text"
                  label="Новое название АЗС"
                  value={editForm.name}
                  onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                  fullWidth
                  placeholder="Введите наименование АЗС"
                  required
                  name="name"
                />
              </div>
              
              <div className="form-row form-row-2">
                <Select
                  label="Провайдер"
                  value={editForm.provider_id ? editForm.provider_id.toString() : ''}
                  onChange={(value) => {
                    const newProviderId = value ? parseInt(value) : null
                    // Если провайдер изменился и есть транзакции - показываем предупреждение
                    if (hasTransactions && newProviderId !== originalProviderId) {
                      setPendingProviderId(newProviderId)
                      setShowProviderChangeConfirm(true)
                    } else {
                      setEditForm({...editForm, provider_id: newProviderId})
                    }
                  }}
                  options={[
                    { value: '', label: 'Не указан' },
                    ...providers.filter(p => p.is_active).map(provider => ({
                      value: provider.id.toString(),
                      label: provider.name
                    }))
                  ]}
                  fullWidth
                  required
                />
                <Input
                  type="text"
                  label="Номер АЗС"
                  value={editForm.azs_number}
                  onChange={(e) => setEditForm({...editForm, azs_number: e.target.value})}
                  placeholder="Номер АЗС"
                  fullWidth
                  required
                  name="azs_number"
                />
              </div>
            </div>

            {/* География */}
            <div className="form-section">
              <h4 className="form-section-title">📍 География</h4>

              <div className="form-row">
                <Input
                  type="text"
                  label="Адрес"
                  value={editForm.location}
                  onChange={(e) => setEditForm({...editForm, location: e.target.value})}
                  placeholder="Улица, дом, корпус"
                  fullWidth
                  required
                  name="location"
                />
              </div>

              <div className="form-row form-row-2">
                <Input
                  type="text"
                  label="Регион"
                  value={editForm.region}
                  onChange={(e) => setEditForm({...editForm, region: e.target.value})}
                  placeholder="Например: Московская область"
                  fullWidth
                  required
                  name="region"
                />
                <Input
                  type="text"
                  label="Населенный пункт"
                  value={editForm.settlement}
                  onChange={(e) => setEditForm({...editForm, settlement: e.target.value})}
                  placeholder="Город или деревня"
                  fullWidth
                  required
                  name="settlement"
                />
              </div>

              <div className="form-row form-row-2">
                <Input
                  type="number"
                  step="any"
                  label="Широта"
                  value={editForm.latitude}
                  onChange={handleLatitudeChange}
                  placeholder="Например: 55.7558"
                  fullWidth
                  error={formErrors.latitude}
                  name="latitude"
                />
                <Input
                  type="number"
                  step="any"
                  label="Долгота"
                  value={editForm.longitude}
                  onChange={handleLongitudeChange}
                  placeholder="Например: 37.6176"
                  fullWidth
                  error={formErrors.longitude}
                  name="longitude"
                />
              </div>

              <div className="form-row">
                <Button
                  variant="secondary"
                  onClick={() => setShowMapModal(true)}
                  icon={
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                    </svg>
                  }
                  iconPosition="left"
                >
                  Выбрать на карте
                </Button>
              </div>
            </div>

            <div className="form-actions">
              <Button
                variant="secondary"
                onClick={handleCancel}
                disabled={loading}
                icon={
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                }
                iconPosition="left"
              >
                Отмена
              </Button>
              <Button
                variant="primary"
                onClick={() => editingId && handleSave(editingId)}
                disabled={loading}
                loading={loading}
                icon={
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                }
                iconPosition="left"
              >
                {loading ? 'Сохранение...' : 'Сохранить'}
              </Button>
            </div>
          </div>
        </Modal.Body>
      </Modal>

      {/* Модальное окно выбора координат на карте */}
      <MapModal
        isOpen={showMapModal}
        onClose={() => setShowMapModal(false)}
        onConfirm={handleMapConfirm}
        initialLat={editForm.latitude && editForm.latitude !== '' ? parseFloat(editForm.latitude) : null}
        initialLng={editForm.longitude && editForm.longitude !== '' ? parseFloat(editForm.longitude) : null}
      />

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
                    name: 'Наименование',
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
                    name: { visible: true, order: 1 },
                    provider: { visible: true, order: 2 },
                    azs_number: { visible: true, order: 3 },
                    location: { visible: true, order: 4 },
                    region: { visible: true, order: 5 },
                    settlement: { visible: true, order: 6 },
                    coordinates: { visible: true, order: 7 },
                    status: { visible: true, order: 8 },
                    errors: { visible: true, order: 9 },
                    actions: { visible: true, order: 10 }
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

      {/* Модальное окно подтверждения изменения Провайдера */}
      <ConfirmModal
        isOpen={showProviderChangeConfirm}
        onConfirm={handleProviderChangeConfirm}
        onCancel={handleProviderChangeCancel}
        title="Изменение Провайдера"
        message="У данной АЗС есть связанные транзакции, загруженные при импорте. Изменение Провайдера может привести к несоответствию данных. Вы уверены, что хотите изменить Провайдера?"
        confirmText="Да, изменить"
        cancelText="Отмена"
        variant="warning"
      />
    </>
  )
}

export default GasStationsList

