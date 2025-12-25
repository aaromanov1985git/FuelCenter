import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import IconButton from './IconButton'
import StatusBadge from './StatusBadge'
import { useToast } from './ToastContainer'
import { authFetch } from '../utils/api'
import { Card, Button, Input, Table, Badge, Skeleton, Alert, Select, Modal, Tooltip } from './ui'
import ConfirmModal from './ConfirmModal'
import './FuelTypesList.css'
import './ColumnSettingsModal.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

const FuelTypesList = () => {
  const { error: showError, success } = useToast()
  const [fuelTypes, setFuelTypes] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editForm, setEditForm] = useState({ 
    original_name: '', 
    normalized_name: ''
  })
  const [formErrors, setFormErrors] = useState({})
  const [filter, setFilter] = useState('all') // all, pending, valid, invalid
  const [hasTransactions, setHasTransactions] = useState(false)
  
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
    const saved = localStorage.getItem('fuelTypesColumnSettings')
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
      normalized_name: { visible: true, order: 1 },
      status: { visible: true, order: 2 },
      errors: { visible: true, order: 3 },
      transactions_count: { visible: true, order: 4 },
      actions: { visible: true, order: 5 }
    }
  })
  const [draggedColumn, setDraggedColumn] = useState(null)

  const loadFuelTypes = async () => {
    setLoading(true)
    setError('')
    
    try {
      const params = new URLSearchParams()
      if (filter !== 'all') {
        params.append('is_validated', filter)
      }
      params.append('skip', ((currentPage - 1) * limit).toString())
      params.append('limit', limit.toString())
      
      const response = await authFetch(`${API_URL}/api/v1/fuel-types?${params}`)
      if (!response.ok) throw new Error('Ошибка загрузки данных')
      
      const result = await response.json()
      setFuelTypes(result.items)
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
      const response = await authFetch(`${API_URL}/api/v1/fuel-types/stats`)
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
    loadFuelTypes()
    loadStats()
  }, [filter, currentPage])

  const checkHasTransactions = async (originalName, normalizedName) => {
    try {
      // Проверяем наличие транзакций через API с фильтром по виду топлива
      if (!originalName && !normalizedName) {
        return false
      }
      const productFilter = normalizedName || originalName
      const response = await authFetch(`${API_URL}/api/v1/transactions?product=${encodeURIComponent(productFilter)}&limit=1`)
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

  const handleEdit = useCallback(async (fuelType) => {
    setEditingId(fuelType.id)
    setEditForm({
      original_name: fuelType.original_name || '',
      normalized_name: fuelType.normalized_name || fuelType.original_name || ''
    })
    setFormErrors({})
    
    // Проверяем наличие транзакций
    const hasTrans = await checkHasTransactions(fuelType.original_name, fuelType.normalized_name)
    setHasTransactions(hasTrans)
    
    setShowEditModal(true)
  }, [])

  const handleSave = async (fuelTypeId) => {
    // Валидация
    if (!editForm.normalized_name || editForm.normalized_name.trim() === '') {
      setFormErrors({ normalized_name: 'Нормализованное наименование не может быть пустым' })
      showError('Исправьте ошибки перед сохранением')
      return
    }

    try {
      setLoading(true)
      const { original_name, ...updateData } = editForm
      
      const response = await authFetch(`${API_URL}/api/v1/fuel-types/${fuelTypeId}`, {
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
      await loadFuelTypes()
      await loadStats()
      setError('')
      success('Данные вида топлива успешно обновлены')
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
    setEditForm({ original_name: '', normalized_name: '' })
    setFormErrors({})
    setHasTransactions(false)
  }

  const [deletingId, setDeletingId] = useState(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [fuelTypeToDelete, setFuelTypeToDelete] = useState(null)

  const handleDelete = useCallback((fuelType) => {
    setFuelTypeToDelete(fuelType)
    setShowDeleteModal(true)
  }, [])

  const confirmDelete = async () => {
    if (!fuelTypeToDelete) return
    
    setDeletingId(fuelTypeToDelete.id)
    try {
      const response = await authFetch(`${API_URL}/api/v1/fuel-types/${fuelTypeToDelete.id}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Ошибка удаления')
      }

      setShowDeleteModal(false)
      setFuelTypeToDelete(null)
      await loadFuelTypes()
      await loadStats()
      success('Вид топлива успешно удален')
    } catch (err) {
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
      const errorMessage = 'Ошибка удаления: ' + err.message
      showError(errorMessage)
    } finally {
      setDeletingId(null)
    }
  }

  const cancelDelete = () => {
    setShowDeleteModal(false)
    setFuelTypeToDelete(null)
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
    localStorage.setItem('fuelTypesColumnSettings', JSON.stringify(columnSettings))
  }, [columnSettings])

  // Подготовка данных для таблицы с учетом настроек
  const tableColumns = useMemo(() => {
    const allColumns = [
      { key: 'original_name', header: 'Исходное наименование' },
      { key: 'normalized_name', header: 'Нормализованное наименование' },
      { key: 'status', header: 'Статус' },
      { key: 'errors', header: 'Ошибки' },
      { key: 'transactions_count', header: 'Транзакций' },
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
    return fuelTypes.map(fuelType => {
      const errors = fuelType.validation_errors || ''
      const originalName = fuelType.original_name || '-'
      const normalizedName = fuelType.normalized_name || originalName || '-'
      
      return {
        id: fuelType.id,
        original_name: originalName !== '-' && originalName.length > 40 ? (
          <Tooltip content={originalName} position="top" maxWidth={400}>
            <span className="text-truncate">{originalName}</span>
          </Tooltip>
        ) : (
          originalName
        ),
        normalized_name: normalizedName !== '-' && normalizedName.length > 40 ? (
          <Tooltip content={normalizedName} position="top" maxWidth={400}>
            <span className="text-truncate">{normalizedName}</span>
          </Tooltip>
        ) : (
          normalizedName
        ),
        status: getStatusBadge(fuelType.is_validated),
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
        transactions_count: fuelType.transactions_count !== undefined && fuelType.transactions_count !== null 
          ? (
              <span style={{ fontFamily: 'monospace' }}>
                {fuelType.transactions_count.toLocaleString('ru-RU')}
              </span>
            )
          : '-',
        actions: (
          <div style={{ display: 'flex', gap: 'var(--spacing-tiny)' }}>
            <IconButton 
              icon="edit" 
              variant="primary" 
              onClick={() => handleEdit(fuelType)}
              title="Редактировать"
              size="small"
            />
            <IconButton 
              icon="view" 
              variant="secondary" 
              onClick={() => {
                // Переход к транзакциям с фильтром по этому виду топлива
                // Используем нормализованное имя, если оно есть, иначе исходное
                const productFilter = fuelType.normalized_name || fuelType.original_name
                // Используем событие для установки фильтра и переключения вкладки
                const event = new CustomEvent('setTransactionFilterAndTab', { 
                  detail: { 
                    product: productFilter,
                    tab: 'transactions'
                  } 
                })
                window.dispatchEvent(event)
              }}
              title={`Показать транзакции с видом топлива "${fuelType.normalized_name || fuelType.original_name}"`}
              size="small"
            />
            <IconButton 
              icon="delete" 
              variant="danger" 
              onClick={() => handleDelete(fuelType)}
              title="Удалить"
              size="small"
              disabled={deletingId === fuelType.id}
            />
          </div>
        )
      }
    })
  }, [fuelTypes, handleEdit])

  return (
    <>
      {/* Дашборд статистики */}
      {stats && (
        <Card variant="outlined" className="stats-card">
          <Card.Header>
            <Card.Title>Статистика по видам топлива</Card.Title>
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

      <Card className="fuel-types-list">
        <Card.Header>
          <Card.Title>Справочник видов топлива</Card.Title>
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

            {loading && fuelTypes.length === 0 ? (
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

      {/* Модальное окно редактирования вида топлива */}
      <Modal
        isOpen={showEditModal}
        onClose={handleCancel}
        title={editForm.normalized_name ? `Редактирование вида топлива: "${editForm.normalized_name}"` : `Редактирование вида топлива`}
        size="md"
        closeOnOverlayClick={true}
        closeOnEsc={true}
        showCloseButton={true}
      >
        <Modal.Body>
          <div className="fuel-type-edit-form">
            {/* Основная информация */}
            <div className="form-section">
              <h4 className="form-section-title">📝 Основная информация</h4>
              
              <div className="form-row">
                <Input
                  type="text"
                  label="Исходное наименование (для справки)"
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
                  label="Нормализованное наименование"
                  value={editForm.normalized_name}
                  onChange={(e) => {
                    setEditForm({...editForm, normalized_name: e.target.value})
                    setFormErrors({...formErrors, normalized_name: undefined})
                  }}
                  fullWidth
                  placeholder="Введите нормализованное наименование вида топлива"
                  required
                  error={formErrors.normalized_name}
                  name="normalized_name"
                />
              </div>

              {hasTransactions && (
                <Alert variant="info" className="alert-with-margin">
                  У данного вида топлива есть связанные транзакции. Изменение нормализованного наименования может повлиять на отчетность.
                </Alert>
              )}
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

      {/* Модальное окно подтверждения удаления */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={cancelDelete}
        onConfirm={confirmDelete}
        title="Подтверждение удаления"
        confirmText="Удалить"
        cancelText="Отмена"
        variant="danger"
        loading={deletingId !== null}
      >
        {fuelTypeToDelete && (
          <div>
            <p>Вы уверены, что хотите удалить вид топлива?</p>
            <div style={{ marginTop: 'var(--spacing-block)', padding: 'var(--spacing-block)', backgroundColor: 'var(--color-bg-secondary)', borderRadius: 'var(--border-radius)' }}>
              <p style={{ margin: 0, fontWeight: 'bold' }}>Исходное наименование:</p>
              <p style={{ margin: 'var(--spacing-tiny) 0' }}>{fuelTypeToDelete.original_name}</p>
              <p style={{ margin: 0, fontWeight: 'bold' }}>Нормализованное наименование:</p>
              <p style={{ margin: 'var(--spacing-tiny) 0' }}>{fuelTypeToDelete.normalized_name || fuelTypeToDelete.original_name}</p>
              {fuelTypeToDelete.transactions_count > 0 && (
                <Alert variant="warning" style={{ marginTop: 'var(--spacing-block)' }}>
                  У данного вида топлива есть связанные транзакции ({fuelTypeToDelete.transactions_count.toLocaleString('ru-RU')}). 
                  Удаление может повлиять на отчетность.
                </Alert>
              )}
            </div>
          </div>
        )}
      </ConfirmModal>

      {/* Модальное окно настроек полей */}
      {showColumnSettings && createPortal(
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
                    normalized_name: 'Нормализованное наименование',
                    status: 'Статус',
                    errors: 'Ошибки',
                    transactions_count: 'Транзакций',
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
                    normalized_name: { visible: true, order: 1 },
                    status: { visible: true, order: 2 },
                    errors: { visible: true, order: 3 },
                    transactions_count: { visible: true, order: 4 },
                    actions: { visible: true, order: 5 }
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
        </div>,
        document.body
      )}
    </>
  )
}

export default FuelTypesList
