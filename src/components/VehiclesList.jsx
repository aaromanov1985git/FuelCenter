import React, { useState, useEffect } from 'react'
import { Button, Input, Card, Badge, Table, Alert, useToast, Select, Modal } from './ui'
import { authFetch } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import './VehiclesList.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

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
      // Убеждаемся, что organization_id всегда присутствует в запросе (даже если null)
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
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
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

  const columns = [
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
      key: 'license_plate',
      header: 'Госномер',
      sortable: true,
      render: (_, row) => row.license_plate || '-'
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
        <Button size="sm" variant="primary" onClick={() => handleEdit(row)}>
          Редактировать
        </Button>
      )
    }
  ]

  const tableData = vehicles.map((v) => ({
    ...v,
    id: v.id,
    original_name: v.original_name || '-',
    garage_number: v.garage_number,
    license_plate: v.license_plate
  }))

  return (
    <div className="vehicles-list">
      <Card variant="elevated" padding="lg">
        <Card.Header>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <Card.Title>Справочник транспортных средств</Card.Title>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Button size="sm" variant={filter === 'all' ? 'primary' : 'secondary'} onClick={() => setFilter('all')}>
                Все
              </Button>
              <Button size="sm" variant={filter === 'pending' ? 'warning' : 'secondary'} onClick={() => setFilter('pending')}>
                Требуют проверки
              </Button>
              <Button size="sm" variant={filter === 'valid' ? 'success' : 'secondary'} onClick={() => setFilter('valid')}>
                Валидные
              </Button>
              <Button size="sm" variant={filter === 'invalid' ? 'error' : 'secondary'} onClick={() => setFilter('invalid')}>
                С ошибками
              </Button>
            </div>
          </div>
        </Card.Header>
        <Card.Body>
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
            defaultSortColumn="original_name"
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
        </Card.Body>
      </Card>

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

