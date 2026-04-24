import React, { useState, useEffect, useMemo } from 'react'
import { Button, Input, Card, Badge, Table, Alert, useToast, Select, Modal } from './ui'
import { authFetch } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import './VehiclesList.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

// Russian license plate component — styled to match redesign_vehicles.html
// White background, black border, bold letters, country flag block on the right
const LicensePlate = ({ value }) => {
  if (!value) return <span className="veh-plate veh-plate--empty">—</span>
  // Try to split "А123ВС 77" into main + region (last group of digits)
  const trimmed = String(value).trim().toUpperCase()
  const match = trimmed.match(/^(.+?)[\s\-]?(\d{2,3})$/)
  let main = trimmed
  let region = ''
  if (match) {
    main = match[1].trim()
    region = match[2]
  }
  return (
    <span className="veh-plate" title={value}>
      <span className="veh-plate__main">{main}</span>
      {region && <span className="veh-plate__region">{region}</span>}
      <span className="veh-plate__flag" aria-hidden="true">
        <span className="veh-plate__flag-stripe veh-plate__flag-stripe--white" />
        <span className="veh-plate__flag-stripe veh-plate__flag-stripe--blue" />
        <span className="veh-plate__flag-stripe veh-plate__flag-stripe--red" />
        <span className="veh-plate__flag-code">RUS</span>
      </span>
    </span>
  )
}

const VehiclesList = () => {
  const { user: currentUser } = useAuth()
  const { error: showError, success } = useToast()
  const [vehicles, setVehicles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ garage_number: '', license_plate: '', organization_id: null })
  const [filter, setFilter] = useState('all') // all, pending, valid, invalid
  const [organizations, setOrganizations] = useState([])
  const [showEditModal, setShowEditModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

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
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
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

  const loadOrganizations = async () => {
    try {
      const response = await authFetch(`${API_URL}/api/v1/organizations?limit=1000`)
      if (response.ok) {
        const data = await response.json()
        setOrganizations(data.items || [])
      }
    } catch (err) {
      // Игнорируем ошибки загрузки организаций
    }
  }

  useEffect(() => {
    loadOrganizations()
  }, [])

  const handleEdit = (vehicle) => {
    setEditingId(vehicle.id)
    setEditForm({
      garage_number: vehicle.garage_number || '',
      license_plate: vehicle.license_plate || '',
      organization_id: vehicle.organization_id || null
    })
    setShowEditModal(true)
  }

  const handleSave = async (vehicleId) => {
    try {
      setLoading(true)
      const payload = {
        garage_number: editForm.garage_number || null,
        license_plate: editForm.license_plate || null,
        organization_id: editForm.organization_id || null
      }
      logger.debug('Сохранение ТС:', { vehicleId, payload })
      const response = await authFetch(`${API_URL}/api/v1/vehicles/${vehicleId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errorData = await response.json()
        logger.error('Ошибка сохранения ТС:', errorData)
        throw new Error(errorData.detail || 'Ошибка сохранения')
      }

      const result = await response.json()
      logger.debug('ТС успешно сохранено:', result)
      setEditingId(null)
      await loadVehicles()
      setError('')
    } catch (err) {
      if (err.isUnauthorized) {
        return
      }
      setError('Ошибка сохранения: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (total > 0 && currentPage > 1 && (currentPage - 1) * limit >= total) {
      setCurrentPage(prev => Math.max(1, prev - 1))
    }
  }, [total, currentPage, limit])

  const handleCancel = () => {
    setEditingId(null)
    setEditForm({ garage_number: '', license_plate: '', organization_id: null })
    setShowEditModal(false)
  }

  const handleSaveModal = async () => {
    if (editingId) {
      await handleSave(editingId)
      setShowEditModal(false)
    }
  }

  const getStatusBadge = (status) => {
    const map = {
      valid: { variant: 'success', label: 'Валидно' },
      invalid: { variant: 'error', label: 'Ошибки' },
      pending: { variant: 'warning', label: 'Требует проверки' }
    }
    const conf = map[status] || map.pending
    return (
      <Badge size="sm" variant={conf.variant}>
        {conf.label}
      </Badge>
    )
  }

  // Client-side search over already-loaded rows (does not affect server filter)
  const searchedVehicles = useMemo(() => {
    if (!searchQuery) return vehicles
    const q = searchQuery.toLowerCase()
    return vehicles.filter(v => {
      const org = organizations.find(o => o.id === v.organization_id)
      return [
        v.original_name,
        v.garage_number,
        v.license_plate,
        org?.name
      ].some(x => x && String(x).toLowerCase().includes(q))
    })
  }, [vehicles, searchQuery, organizations])

  // Stats derived from currently loaded page — best effort
  const stats = useMemo(() => {
    const counts = { total: total || vehicles.length, valid: 0, invalid: 0, pending: 0 }
    vehicles.forEach(v => {
      if (v.is_validated === 'valid') counts.valid += 1
      else if (v.is_validated === 'invalid') counts.invalid += 1
      else counts.pending += 1
    })
    return counts
  }, [vehicles, total])

  const columns = [
    {
      key: 'license_plate',
      header: 'Госномер',
      sortable: true,
      render: (_, row) => <LicensePlate value={row.license_plate} />
    },
    { key: 'original_name', header: 'Исходное наименование', sortable: true },
    {
      key: 'organization',
      header: 'Организация',
      sortable: false,
      render: (_, row) => {
        const org = organizations.find(o => o.id === row.organization_id)
        return org ? <Badge variant="secondary">{org.name}</Badge> : '-'
      }
    },
    {
      key: 'garage_number',
      header: 'Гаражный номер',
      sortable: true,
      render: (_, row) => row.garage_number || '-'
    },
    {
      key: 'is_validated',
      header: 'Статус',
      sortable: true,
      render: (val) => getStatusBadge(val)
    },
    {
      key: 'validation_errors',
      header: 'Ошибки',
      sortable: false,
      render: (val) =>
        val ? (
          <span className="vehicle-error-text" title={val}>
            {val}
          </span>
        ) : (
          '-'
        )
    },
    {
      key: 'actions',
      header: 'Действия',
      sortable: false,
      render: (_, row) => (
        <Button size="sm" variant="primary" onClick={() => handleEdit(row)} data-testid={`vehicle-edit-${row.id}`}>
          Редактировать
        </Button>
      )
    }
  ]

  const tableData = searchedVehicles.map((v) => ({
    ...v,
    id: v.id,
    original_name: v.original_name || '-',
    garage_number: v.garage_number,
    license_plate: v.license_plate
  }))

  const filters = [
    { key: 'all',      label: 'Все',                tone: 'neutral' },
    { key: 'pending',  label: 'Требуют проверки',   tone: 'amber'   },
    { key: 'valid',    label: 'Валидные',           tone: 'green'   },
    { key: 'invalid',  label: 'С ошибками',         tone: 'red'     }
  ]

  return (
    <div className="vehicles-list veh-root" data-testid="vehicles-list">
      {/* Stat cards — mirrors reference dashboard */}
      <div className="veh-stats" data-testid="vehicles-stats">
        <div className="veh-stat" data-tone="neutral">
          <span className="veh-stat__bar" />
          <div className="veh-stat__body">
            <div className="veh-stat__label t-label">Всего ТС</div>
            <div className="veh-stat__value t-value">{stats.total}</div>
          </div>
        </div>
        <div className="veh-stat" data-tone="green">
          <span className="veh-stat__bar" />
          <div className="veh-stat__body">
            <div className="veh-stat__label t-label">Валидные</div>
            <div className="veh-stat__value t-value">{stats.valid}</div>
          </div>
        </div>
        <div className="veh-stat" data-tone="amber">
          <span className="veh-stat__bar" />
          <div className="veh-stat__body">
            <div className="veh-stat__label t-label">Требуют проверки</div>
            <div className="veh-stat__value t-value">{stats.pending}</div>
          </div>
        </div>
        <div className="veh-stat" data-tone="red">
          <span className="veh-stat__bar" />
          <div className="veh-stat__body">
            <div className="veh-stat__label t-label">С ошибками</div>
            <div className="veh-stat__value t-value">{stats.invalid}</div>
          </div>
        </div>
      </div>

      {/* Filter/search row */}
      <div className="veh-toolbar" data-testid="vehicles-toolbar">
        <div className="veh-search">
          <svg className="veh-search__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            className="veh-search__input"
            placeholder="Поиск по номеру, наименованию, организации..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="vehicles-search"
          />
        </div>
        <div className="veh-filters" role="tablist">
          {filters.map(f => (
            <button
              key={f.key}
              type="button"
              className={`veh-chip${filter === f.key ? ' veh-chip--active' : ''}`}
              data-tone={f.tone}
              onClick={() => setFilter(f.key)}
              role="tab"
              aria-selected={filter === f.key}
              data-testid={`vehicles-filter-${f.key}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main data card */}
      <div className="veh-card">
        <div className="veh-card__head">
          <h2 className="veh-card__title">Справочник транспортных средств</h2>
          {total > 0 && (
            <span className="veh-card__meta t-label">
              Всего записей: <strong>{total}</strong>
            </span>
          )}
        </div>
        <div className="veh-card__body">
          {error && (
            <Alert variant="error" title="Ошибка загрузки">
              {error}
            </Alert>
          )}

          <Table
            columns={columns}
            data={tableData}
            loading={loading}
            striped
            hoverable
            compact
            defaultSortColumn="license_plate"
          />

          {total > limit && (
            <Table.Pagination
              currentPage={currentPage}
              totalPages={Math.ceil(total / limit)}
              total={total}
              pageSize={limit}
              onPageChange={(page) => setCurrentPage(page)}
            />
          )}
        </div>
      </div>

      {/* Модальное окно редактирования ТС */}
      <Modal
        isOpen={showEditModal}
        onClose={handleCancel}
        title="Редактировать транспортное средство"
        size="md"
      >
        <Modal.Body>
          <div className="form-section">
            <h3>Основная информация</h3>
            <div className="form-group">
              <label>Исходное наименование</label>
              <Input
                value={vehicles.find(v => v.id === editingId)?.original_name || ''}
                disabled
                fullWidth
              />
            </div>
            <div className="form-group">
              <label>Организация</label>
              <Select
                value={editForm.organization_id ? editForm.organization_id.toString() : ''}
                onChange={(value) => setEditForm({ ...editForm, organization_id: value ? parseInt(value) : null })}
                options={[
                  { value: '', label: 'Не указана' },
                  ...organizations.filter(o => o.is_active).map(org => ({
                    value: org.id.toString(),
                    label: org.name
                  }))
                ]}
                fullWidth
              />
            </div>
          </div>
          <div className="form-section">
            <h3>Дополнительные данные</h3>
            <div className="form-row">
              <div className="form-group">
                <label>Гаражный номер</label>
                <Input
                  value={editForm.garage_number}
                  onChange={(e) => setEditForm({ ...editForm, garage_number: e.target.value })}
                  placeholder="Гаражный номер"
                  fullWidth
                />
              </div>
              <div className="form-group">
                <label>Госномер</label>
                <Input
                  value={editForm.license_plate}
                  onChange={(e) => setEditForm({ ...editForm, license_plate: e.target.value.toUpperCase() })}
                  placeholder="А123ВС77"
                  fullWidth
                />
              </div>
            </div>
            {editForm.license_plate && (
              <div className="veh-plate-preview">
                <span className="t-label">Предпросмотр:</span>
                <LicensePlate value={editForm.license_plate} />
              </div>
            )}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleCancel} disabled={loading}>
            Отмена
          </Button>
          <Button variant="primary" onClick={handleSaveModal} disabled={loading}>
            Сохранить
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}

export default VehiclesList
