import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import IconButton from './IconButton'
import StatusBadge from './StatusBadge'
import Icon from './ui/Icon'
import { useToast } from './ToastContainer'
import { useDebounce } from '../hooks/useDebounce'
import { authFetch } from '../utils/api'
import { logger } from '../utils/logger'
import { Card, Button, Input, Table, Badge, Skeleton, Alert, Select, Modal, Tooltip } from './ui'
import MapModal from './MapModal'
import ConfirmModal from './ConfirmModal'
import './GasStationsList.css'
import './ColumnSettingsModal.css'

const API_URL = import.meta.env.VITE_API_URL || ''

// Mapping provider names to accent colors (heuristic by common Russian provider names)
const getProviderAccent = (name) => {
  if (!name) return 'var(--text-2)'
  const n = name.toLowerCase()
  if (n.includes('газпром')) return 'var(--accent)'
  if (n.includes('лукойл')) return 'var(--cyan)'
  if (n.includes('роснефть')) return 'var(--green)'
  if (n.includes('татнефть')) return 'var(--amber)'
  if (n.includes('башнефть')) return 'var(--pink)'
  return 'var(--text-2)'
}

/**
 * Набор колонок по умолчанию.
 *
 * Раньше показывались все десять сразу, и таблица выходила 2061px при области
 * 1158px: «Статус», ради которого наверху стоят четыре плитки, не был виден без
 * горизонтальной прокрутки. При этом «Регион», «Населённый пункт»,
 * «Координаты» и «Ошибки» пусты на 94–96% строк, а «Исходное наименование»
 * почти всегда дословно повторяет «Наименование».
 *
 * Поэтому по умолчанию открыты только те колонки, что несут значение в каждой
 * строке. Остальные никуда не делись — включаются в «Настроить поля», и выбор
 * запоминается.
 */
const COLUMN_SETTINGS_VERSION = 2

const DEFAULT_COLUMN_SETTINGS = {
  __v: COLUMN_SETTINGS_VERSION,
  name: { visible: true, order: 0 },
  original_name: { visible: false, order: 1 },
  provider: { visible: true, order: 2 },
  azs_number: { visible: true, order: 3 },
  location: { visible: true, order: 4 },
  region: { visible: false, order: 5 },
  settlement: { visible: false, order: 6 },
  coordinates: { visible: false, order: 7 },
  status: { visible: true, order: 8 },
  errors: { visible: false, order: 9 },
  actions: { visible: true, order: 10 }
}

/** Пустое значение: приглушённое тире вместо дефиса в общем тоне текста. */
const emptyCell = <span className="gsl-cell-empty">—</span>

/**
 * Содержимое текстовой ячейки: одна строка, лишнее срезается многоточием.
 *
 * Полное значение отдаём системной подсказкой `title` — на полусотне строк это
 * втрое дешевле, чем полторы сотни экземпляров Tooltip с обработчиками, и
 * работает ровно там, где текст обрезан. Оформленный Tooltip оставлен для
 * случая, когда подсказка несёт отдельный смысл (аргумент hint), а не просто
 * повторяет обрезанное.
 *
 * @param {string|null|undefined} value - значение поля
 * @param {string} [hint] - пояснение, которое само по себе информативно
 * @returns {React.ReactNode} Ячейка или приглушённое тире, если значения нет
 */
const cellText = (value, hint) => {
  const text = value === null || value === undefined ? '' : String(value).trim()
  if (text === '' || text === '-') return emptyCell

  if (hint) {
    return (
      <Tooltip content={hint} position="top" maxWidth={360}>
        <span className="gsl-ellipsis gsl-ellipsis--hinted">{text}</span>
      </Tooltip>
    )
  }
  return <span className="gsl-ellipsis" title={text}>{text}</span>
}

/* Здесь лежал локальный набор inline-svg 12-14px со stroke-width 2 — третий
   набор иконок в проекте, со своей геометрией и своими размерами. Все значки
   теперь идут через примитив ui/Icon: контурные 16px в currentColor. */
const Icons = {
  pin: <Icon name="pin" />,
  search: <Icon name="search" />,
  grid: <Icon name="grid" />,
  list: <Icon name="rows" />,
  edit: <Icon name="edit" />,
  trash: <Icon name="trash" />,
  upload: <Icon name="upload" />,
  download: <Icon name="download" />,
  settings: <Icon name="gear" />,
  map: <Icon name="pin" />,
  check: <Icon name="check" />,
  close: <Icon name="close" />,
}

const GasStationsList = () => {
  const { error: showError, success, warning } = useToast()
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
  // Снимок формы на открытии: «Сохранить» активна, только если что-то изменили
  const [initialEditForm, setInitialEditForm] = useState(null)
  const [formErrors, setFormErrors] = useState({})
  const [providers, setProviders] = useState([])
  const [filter, setFilter] = useState('all')
  const [originalProviderId, setOriginalProviderId] = useState(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProviderId, setSelectedProviderId] = useState('')
  const debouncedSearchQuery = useDebounce(searchQuery, 500)
  const [hasTransactions, setHasTransactions] = useState(false)
  const [showProviderChangeConfirm, setShowProviderChangeConfirm] = useState(false)
  const [pendingProviderId, setPendingProviderId] = useState(null)

  const [deletingId, setDeletingId] = useState(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [gasStationToDelete, setGasStationToDelete] = useState(null)

  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [limit] = useState(50)

  const [sortBy, setSortBy] = useState(null)
  const [sortOrder, setSortOrder] = useState('asc')

  const [stats, setStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(false)

  // View mode: 'cards' | 'list'
  const [view, setView] = useState(() => {
    return localStorage.getItem('gasStationsView') || 'list'
  })
  useEffect(() => {
    localStorage.setItem('gasStationsView', view)
  }, [view])

  const [showColumnSettings, setShowColumnSettings] = useState(false)
  const [columnSettings, setColumnSettings] = useState(() => {
    const saved = localStorage.getItem('gasStationsColumnSettings')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        // Старые сохранённые настройки включали все десять колонок сразу —
        // именно они и делали таблицу вдвое шире окна. Без метки версии их
        // нельзя отличить от осознанного выбора пользователя, поэтому
        // настройки без версии отбрасываем и берём новый набор по умолчанию.
        if (parsed && parsed.__v === COLUMN_SETTINGS_VERSION) return parsed
      } catch (e) {
        logger.error('Ошибка загрузки настроек колонок:', e)
      }
    }
    return DEFAULT_COLUMN_SETTINGS
  })
  const [draggedColumn, setDraggedColumn] = useState(null)

  const loadGasStations = async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (filter !== 'all') params.append('is_validated', filter)
      if (selectedProviderId) params.append('provider_id', selectedProviderId)
      if (debouncedSearchQuery) params.append('search', debouncedSearchQuery)
      if (sortBy) {
        params.append('sort_by', sortBy)
        params.append('sort_order', sortOrder)
      }
      params.append('skip', ((currentPage - 1) * limit).toString())
      params.append('limit', limit.toString())

      const response = await authFetch(`${API_URL}/api/v1/gas-stations?${params}`)
      if (!response.ok) throw new Error('Ошибка загрузки данных')
      const result = await response.json()
      setGasStations(result.items)
      setTotal(result.total)
    } catch (err) {
      if (err.isUnauthorized) return
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
      if (err.isUnauthorized) return
      showError('Ошибка загрузки статистики: ' + err.message)
    } finally {
      setStatsLoading(false)
    }
  }

  useEffect(() => {
    setCurrentPage(1)
  }, [filter, selectedProviderId, debouncedSearchQuery])

  useEffect(() => {
    loadGasStations()
    loadStats()
  }, [filter, currentPage, selectedProviderId, debouncedSearchQuery, sortBy, sortOrder])

  const handleSort = useCallback((columnKey, newSortOrder) => {
    const columnToFieldMap = {
      'original_name': 'original_name',
      'name': 'name',
      'azs_number': 'azs_number',
      'location': 'location',
      'region': 'region',
      'settlement': 'settlement',
      'status': 'is_validated',
      'coordinates': null,
      'errors': null,
      'actions': null,
      'provider': null
    }
    const fieldName = columnToFieldMap[columnKey]
    if (fieldName) {
      setSortBy(fieldName)
      setSortOrder(newSortOrder)
      setCurrentPage(1)
    } else {
      setSortBy(null)
      setSortOrder('asc')
    }
  }, [])

  const loadProviders = async () => {
    try {
      const response = await authFetch(`${API_URL}/api/v1/providers?limit=1000`)
      if (response.ok) {
        const result = await response.json()
        setProviders(result.items || [])
      }
    } catch (err) {}
  }

  const getProviderName = useCallback((providerId) => {
    if (!providerId) return '-'
    const provider = providers.find(p => p.id === providerId)
    return provider ? provider.name : `ID: ${providerId}`
  }, [providers])

  useEffect(() => { loadProviders() }, [])

  const checkHasTransactions = async (azsNumber) => {
    try {
      if (!azsNumber) return false
      const response = await authFetch(`${API_URL}/api/v1/transactions?azs_number=${encodeURIComponent(azsNumber)}&limit=1`)
      if (response.ok) {
        const data = await response.json()
        return data.total > 0
      }
      return false
    } catch (err) {
      logger.error('Ошибка проверки транзакций:', err)
      return false
    }
  }

  const handleEdit = useCallback(async (gasStation) => {
    setEditingId(gasStation.id)
    const providerId = gasStation.provider_id || null
    const formValues = {
      original_name: gasStation.original_name || '',
      name: gasStation.name || gasStation.original_name || '',
      provider_id: providerId,
      azs_number: gasStation.azs_number || '',
      location: gasStation.location || '',
      region: gasStation.region || '',
      settlement: gasStation.settlement || '',
      latitude: gasStation.latitude !== null && gasStation.latitude !== undefined ? gasStation.latitude.toString() : '',
      longitude: gasStation.longitude !== null && gasStation.longitude !== undefined ? gasStation.longitude.toString() : ''
    }
    setEditForm(formValues)
    setInitialEditForm(formValues)
    setOriginalProviderId(providerId)
    setFormErrors({})
    const hasTrans = await checkHasTransactions(gasStation.azs_number)
    setHasTransactions(hasTrans)
    setShowEditModal(true)
  }, [])

  const handleDelete = useCallback((gasStation) => {
    setGasStationToDelete(gasStation)
    setShowDeleteModal(true)
  }, [])

  const confirmDelete = async () => {
    if (!gasStationToDelete) return
    setDeletingId(gasStationToDelete.id)
    try {
      const response = await authFetch(`${API_URL}/api/v1/gas-stations/${gasStationToDelete.id}`, { method: 'DELETE' })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Ошибка удаления')
      }
      setShowDeleteModal(false)
      setGasStationToDelete(null)
      await loadGasStations()
      await loadStats()
      success('АЗС успешно удалена')
    } catch (err) {
      if (err.isUnauthorized) return
      const errorMessage = 'Ошибка удаления: ' + err.message
      showError(errorMessage)
    } finally {
      setDeletingId(null)
    }
  }

  const cancelDelete = () => {
    setShowDeleteModal(false)
    setGasStationToDelete(null)
  }

  const handleImport = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/excel'
    ]
    if (!validTypes.includes(file.type) && !file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      showError('Пожалуйста, выберите файл Excel (.xlsx или .xls)')
      return
    }
    try {
      setLoading(true)
      const formData = new FormData()
      formData.append('file', file)
      const response = await authFetch(`${API_URL}/api/v1/gas-stations/import`, { method: 'POST', body: formData })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Ошибка импорта' }))
        throw new Error(errorData.detail || 'Ошибка импорта')
      }
      const result = await response.json()
      const message = `Импорт завершен: создано ${result.created}, обновлено ${result.updated}, пропущено ${result.skipped}`
      if (result.errors && result.errors.length > 0) {
        warning(`${message}. Ошибок: ${result.errors.length}`)
        logger.warn('Ошибки импорта:', result.errors)
      } else if (result.warnings && result.warnings.length > 0) {
        warning(`${message}. Предупреждений: ${result.warnings.length}`)
        logger.warn('Предупреждения импорта:', result.warnings)
      } else {
        success(message)
      }
      await loadGasStations()
      await loadStats()
      event.target.value = ''
    } catch (err) {
      if (err.isUnauthorized) return
      showError('Ошибка импорта: ' + err.message)
      event.target.value = ''
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (filter && filter !== 'all') params.append('is_validated', filter)
      if (selectedProviderId) {
        const providerId = typeof selectedProviderId === 'string' ? parseInt(selectedProviderId, 10) : selectedProviderId
        if (!isNaN(providerId)) params.append('provider_id', providerId.toString())
      }
      if (debouncedSearchQuery && debouncedSearchQuery.trim()) params.append('search', debouncedSearchQuery.trim())
      const paramsString = params.toString()
      const exportUrl = paramsString ? `${API_URL}/api/v1/gas-stations/export?${paramsString}` : `${API_URL}/api/v1/gas-stations/export`
      const response = await authFetch(exportUrl)
      if (!response.ok) {
        let errorMessage = 'Ошибка экспорта'
        try {
          const contentType = response.headers.get('content-type')
          if (contentType && contentType.includes('application/json')) {
            const errorData = await response.json()
            if (Array.isArray(errorData.detail)) {
              errorMessage = errorData.detail.map(err => {
                if (typeof err === 'object' && err.msg) return `${err.loc?.join('.') || 'Параметр'}: ${err.msg}`
                return String(err)
              }).join('; ')
            } else if (typeof errorData.detail === 'string') {
              errorMessage = errorData.detail
            } else if (errorData.message) {
              errorMessage = errorData.message
            } else {
              errorMessage = JSON.stringify(errorData)
            }
          } else {
            const text = await response.text()
            errorMessage = text || `Ошибка ${response.status}: ${response.statusText}`
          }
        } catch (e) {
          errorMessage = `Ошибка ${response.status}: ${response.statusText || 'Неизвестная ошибка'}`
        }
        throw new Error(errorMessage)
      }
      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('spreadsheet')) {
        try {
          const errorData = await response.json()
          throw new Error(errorData.detail || errorData.message || 'Неверный формат ответа')
        } catch (e) {
          if (e instanceof Error && e.message !== 'Unexpected end of JSON input') throw e
          throw new Error('Сервер вернул неверный формат данных')
        }
      }
      const contentDisposition = response.headers.get('Content-Disposition')
      let filename = `gas_stations_export_${new Date().toISOString().split('T')[0]}.xlsx`
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
        if (filenameMatch && filenameMatch[1]) filename = filenameMatch[1].replace(/['"]/g, '')
      }
      const blob = await response.blob()
      const blobUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(blobUrl)
      document.body.removeChild(a)
      success('Экспорт АЗС завершен')
    } catch (err) {
      if (err.isUnauthorized) return
      let errorMessage = 'Ошибка экспорта'
      try {
        if (err instanceof Error) errorMessage = err.message || errorMessage
        else if (typeof err === 'string') errorMessage = err
        else if (err && typeof err === 'object') errorMessage = err.message || err.detail || err.error || err.toString() || JSON.stringify(err)
        else errorMessage = String(err) || errorMessage
      } catch (e) {
        errorMessage = 'Неизвестная ошибка при экспорте'
        logger.error('Критическая ошибка при обработке ошибки экспорта:', e)
      }
      showError(`Ошибка экспорта: ${errorMessage}`)
      logger.error('Ошибка экспорта АЗС:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (gasStationId) => {
    const errors = {
      name: editForm.name.trim() ? undefined : 'Укажите наименование — оно выводится в отчётах',
      azs_number: editForm.azs_number.trim() ? undefined : 'Укажите номер — по нему к АЗС привязываются транзакции',
      latitude: validateCoordinate(editForm.latitude, 'latitude') || undefined,
      longitude: validateCoordinate(editForm.longitude, 'longitude') || undefined,
    }
    if (Object.values(errors).some(Boolean)) {
      setFormErrors(errors)
      return
    }
    try {
      setLoading(true)
      const { original_name, ...updateData } = editForm
      for (const field of ['name', 'azs_number', 'location', 'region', 'settlement']) {
        updateData[field] = updateData[field].trim()
      }
      updateData.latitude = parseCoordinate(updateData.latitude)
      updateData.longitude = parseCoordinate(updateData.longitude)
      const response = await authFetch(`${API_URL}/api/v1/gas-stations/${gasStationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
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

  useEffect(() => {
    if (total > 0 && currentPage > 1 && (currentPage - 1) * limit >= total) {
      setCurrentPage(prev => Math.max(1, prev - 1))
    }
  }, [total, currentPage, limit])

  const handleCancel = () => {
    setEditingId(null)
    setShowEditModal(false)
    setEditForm({ original_name: '', name: '', provider_id: null, azs_number: '', location: '', region: '', settlement: '', latitude: '', longitude: '' })
    setInitialEditForm(null)
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
    setEditForm({...editForm, provider_id: originalProviderId})
    setShowProviderChangeConfirm(false)
    setPendingProviderId(null)
  }

  // Координаты вводят и с точкой, и с запятой (русская раскладка)
  const parseCoordinate = (value) => {
    if (value === null || value === undefined || String(value).trim() === '') return null
    const num = Number(String(value).trim().replace(',', '.'))
    return Number.isFinite(num) ? num : null
  }

  const validateCoordinate = (value, type) => {
    if (!value || String(value).trim() === '') return null
    const num = parseCoordinate(value)
    if (num === null) return 'Введите число, например 61.1234'
    if (type === 'latitude' && (num < -90 || num > 90)) return 'Широта — от −90 до 90'
    if (type === 'longitude' && (num < -180 || num > 180)) return 'Долгота — от −180 до 180'
    return null
  }

  const updateField = (field, value) => {
    setEditForm(prev => ({ ...prev, [field]: value }))
    if (formErrors[field]) setFormErrors(prev => ({ ...prev, [field]: undefined }))
  }

  const handleLatitudeChange = (e) => {
    const value = e.target.value
    setEditForm(prev => ({ ...prev, latitude: value }))
    setFormErrors(prev => ({ ...prev, latitude: validateCoordinate(value, 'latitude') || undefined }))
  }

  const handleLongitudeChange = (e) => {
    const value = e.target.value
    setEditForm(prev => ({ ...prev, longitude: value }))
    setFormErrors(prev => ({ ...prev, longitude: validateCoordinate(value, 'longitude') || undefined }))
  }

  // Пара «61.1234, 65.5678» из карт, вставленная в любое поле координат, раскладывается на широту и долготу
  const handleCoordinatesPaste = (e) => {
    const text = (e.clipboardData?.getData('text') || '').trim()
    // «61.12, 65.33» или «61,12; 65,33»; одиночное «61,12» — это дробь, а не пара
    const pair = text.match(/^(-?\d+\.\d+)\s*[,;\s]\s*(-?\d+\.\d+)$/) || text.match(/^(-?\d+,\d+)\s*[;\s]\s*(-?\d+,\d+)$/)
    if (!pair) return
    e.preventDefault()
    const [latitude, longitude] = [pair[1], pair[2]]
    setEditForm(prev => ({ ...prev, latitude, longitude }))
    setFormErrors(prev => ({
      ...prev,
      latitude: validateCoordinate(latitude, 'latitude') || undefined,
      longitude: validateCoordinate(longitude, 'longitude') || undefined,
    }))
  }

  const isEditDirty = Boolean(initialEditForm) && Object.keys(initialEditForm).some(
    key => String(editForm[key] ?? '') !== String(initialEditForm[key] ?? '')
  )

  const handleMapConfirm = (lat, lng) => {
    setEditForm(prev => ({ ...prev, latitude: lat.toString(), longitude: lng.toString() }))
    setFormErrors(prev => ({ ...prev, latitude: undefined, longitude: undefined }))
  }

  const getStatusBadge = (status) => {
    const statusMap = { pending: 'pending', valid: 'valid', invalid: 'invalid' }
    return <StatusBadge status={statusMap[status] || 'pending'} size="small" />
  }

  useEffect(() => {
    localStorage.setItem('gasStationsColumnSettings', JSON.stringify(columnSettings))
  }, [columnSettings])

  // Derive KPI cards from stats (with provider-based KPIs if possible)
  const kpiCards = useMemo(() => {
    const totalCount = stats?.total ?? 0
    const validCount = stats?.valid ?? 0
    const pendingCount = stats?.pending ?? 0
    const invalidCount = stats?.invalid ?? 0
    // Поле accent убрано: цвет KPI-числа и риски приходил инлайном из JS,
    // перебивал любые токены по специфичности и делал плитку неуправляемой из
    // CSS. Цвет числа теперь .gsl-kpi-value (var(--text-1)), риска —
    // .gsl-kpi-accent (var(--border-strong)); см. GasStationsList.css.
    return [
      { label: 'Всего АЗС', value: totalCount },
      { label: 'Валидные', value: validCount },
      { label: 'Требуют проверки', value: pendingCount },
      { label: 'С ошибками', value: invalidCount },
    ]
  }, [stats])

  const tableColumns = useMemo(() => {
    // Ширины: узким колонкам — пиксели, текстовым — ничего. При
    // table-layout: fixed (см. .gsl-table в GasStationsList.css) колонки без
    // ширины делят остаток поровну, поэтому наименование и адрес занимают всё
    // свободное место и обрезаются многоточием, а не распирают таблицу.
    const allColumns = [
      { key: 'name', header: 'Наименование', sortable: true, cellClassName: 'gsl-cell-text' },
      { key: 'original_name', header: 'Исходное наименование', sortable: true, cellClassName: 'gsl-cell-text' },
      { key: 'provider', header: 'Провайдер', sortable: false, width: 118, cellClassName: 'gsl-cell-text' },
      { key: 'azs_number', header: 'Номер', sortable: true, width: 128, cellClassName: 'gsl-cell-text' },
      { key: 'location', header: 'Местоположение', sortable: true, cellClassName: 'gsl-cell-text' },
      { key: 'region', header: 'Регион', sortable: true, width: 150, cellClassName: 'gsl-cell-text' },
      { key: 'settlement', header: 'Населенный пункт', sortable: true, width: 170, cellClassName: 'gsl-cell-text' },
      { key: 'coordinates', header: 'Координаты', sortable: false, width: 150, cellClassName: 'gsl-cell-text' },
      // 176px, а не 148: в 148 не влезал бейдж «Требует проверки» и его резало
      // правым краем колонки — ровно в тех строках, ради которых на страницу и
      // заходят.
      { key: 'status', header: 'Статус', sortable: true, width: 176 },
      { key: 'errors', header: 'Ошибки', sortable: false, cellClassName: 'gsl-cell-text' },
      // Липкая справа: на узких окнах таблица всё ещё может не поместиться, а
      // «Действия» — единственный вход в редактирование строки.
      { key: 'actions', header: 'Действия', sortable: false, sticky: 'right', width: 88 }
    ]
    return allColumns
      .filter(col => {
        if (col.key === 'actions') return true
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
      // Номер АЗС у части провайдеров приходит равным наименованию — тогда
      // колонка печатала третью копию той же строки и ничего не сообщала.
      // Показываем номер, только когда он отличается от наименований.
      const rawNumber = (gasStation.azs_number || '').trim()
      const numberIsName = rawNumber !== '' && (rawNumber === name.trim() || rawNumber === originalName.trim())

      // Исходное наименование по умолчанию скрыто, поэтому расхождение с
      // нормализованным показываем подсказкой — иначе оно теряется совсем.
      const nameDiffers = originalName !== '-' && originalName.trim() !== name.trim()

      return {
        id: gasStation.id,
        original_name: cellText(originalName),
        name: nameDiffers
          ? cellText(name, `Нормализовано из «${originalName}»`)
          : cellText(name),
        provider: cellText(getProviderName(gasStation.provider_id)),
        azs_number: numberIsName || rawNumber === ''
          ? emptyCell
          : cellText(rawNumber),
        location: cellText(location),
        region: cellText(gasStation.region),
        settlement: cellText(gasStation.settlement),
        coordinates: gasStation.latitude !== null && gasStation.longitude !== null
          ? cellText(`${gasStation.latitude}, ${gasStation.longitude}`)
          : emptyCell,
        // Текст ошибки живёт в подсказке к статусу: колонка «Ошибки» пуста у
        // 94% строк и по умолчанию скрыта, а сама ошибка нужна ровно там, где
        // видно, что запись невалидна.
        status: errors ? (
          <Tooltip content={errors} position="top" maxWidth={360}>
            <span className="gsl-status-with-hint">{getStatusBadge(gasStation.is_validated)}</span>
          </Tooltip>
        ) : getStatusBadge(gasStation.is_validated),
        errors: errors ? cellText(errors) : emptyCell,
        actions: (
          <div style={{ display: 'flex', gap: '8px' }}>
            <IconButton icon="edit" variant="primary" onClick={() => handleEdit(gasStation)} title="Редактировать" size="small"/>
            <IconButton icon="trash" variant="error" onClick={() => handleDelete(gasStation)} title="Удалить" size="small" disabled={deletingId === gasStation.id}/>
          </div>
        )
      }
    })
  }, [gasStations, getProviderName, handleEdit, handleDelete, deletingId])

  // Station card for the grid view
  const StationCard = ({ station }) => {
    const providerName = getProviderName(station.provider_id)
    const accent = getProviderAccent(providerName)
    const azsNum = station.azs_number || station.id
    const address = [station.settlement, station.location].filter(Boolean).join(', ') || station.region || '—'
    const statusKey = station.is_validated || 'pending'

    return (
      <div className="gsl-card">
        <div className="gsl-card-head">
          <div className="gsl-card-head-main">
            <div className="gsl-card-title-row">
              <span className="gsl-card-num">АЗС №{azsNum}</span>
              {providerName && providerName !== '-' && (
                <span className="gsl-chip" style={{ color: accent, background: 'color-mix(in srgb, currentColor 12%, transparent)' }}>
                  {providerName}
                </span>
              )}
            </div>
            <div className="gsl-card-address">
              <span className="gsl-card-pin">{Icons.pin}</span>
              <span className="gsl-card-address-text">{address}</span>
            </div>
          </div>
          <div className="gsl-card-tile" style={{ color: accent }}>
            {Icons.pin}
          </div>
        </div>

        <div className="gsl-card-stats">
          <div className="gsl-card-stat">
            <div className="gsl-card-stat-label">Статус</div>
            <div className="gsl-card-stat-value">
              <StatusBadge status={statusKey} size="small"/>
            </div>
          </div>
          <div className="gsl-card-stat">
            <div className="gsl-card-stat-label">Координаты</div>
            <div className="gsl-card-stat-value gsl-card-stat-coords">
              {station.latitude !== null && station.longitude !== null
                ? `${Number(station.latitude).toFixed(3)}, ${Number(station.longitude).toFixed(3)}`
                : '—'}
            </div>
          </div>
        </div>

        {station.name && (
          <div className="gsl-card-name" title={station.name}>{station.name}</div>
        )}

        <div className="gsl-card-footer">
          <div className="gsl-card-meta">
            {station.region && <span className="gsl-card-fuel-chip">{station.region}</span>}
          </div>
          <div className="gsl-card-actions">
            <button type="button" className="gsl-icon-btn" onClick={() => handleEdit(station)} title="Редактировать" aria-label="Редактировать">
              {Icons.edit}
            </button>
            <button type="button" className="gsl-icon-btn gsl-icon-btn-danger" onClick={() => handleDelete(station)} title="Удалить" aria-label="Удалить" disabled={deletingId === station.id}>
              {Icons.trash}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const filterTabs = [
    { id: 'all', label: 'Все' },
    { id: 'pending', label: 'Требуют проверки' },
    { id: 'valid', label: 'Валидные' },
    { id: 'invalid', label: 'С ошибками' },
  ]

  return (
    <div className="gsl-root">
      {/* KPI cards */}
      <div className="gsl-kpi-grid">
        {kpiCards.map((k) => (
          <div key={k.label} className="gsl-kpi-card">
            <div className="gsl-kpi-accent" />
            <div className="gsl-kpi-body">
              <div className="gsl-kpi-label t-label">{k.label}</div>
              <div className="gsl-kpi-value">
                {statsLoading ? '—' : (k.value ?? 0).toLocaleString('ru')}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="gsl-filter-bar">
        <div className="gsl-search">
          <span className="gsl-search-icon">{Icons.search}</span>
          <input
            type="text"
            className="gsl-search-input"
            placeholder="Поиск по названию, номеру АЗС, местоположению..."
            aria-label="Поиск АЗС"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="gsl-filter-select-wrap">
          <Select
            value={selectedProviderId}
            onChange={(value) => setSelectedProviderId(value || '')}
            options={[
              { value: '', label: 'Все провайдеры' },
              ...providers.filter(p => p.is_active !== false).map(provider => ({
                value: provider.id.toString(),
                label: provider.name
              }))
            ]}
            placeholder="Провайдер: Все"
          />
        </div>

        <div className="gsl-filter-tabs">
          {filterTabs.map(t => (
            <button
              key={t.id}
              type="button"
              className={`gsl-filter-tab ${filter === t.id ? 'gsl-filter-tab-active' : ''}`}
              onClick={() => setFilter(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="gsl-view-toggle">
          <button
            type="button"
            className={`gsl-view-btn ${view === 'cards' ? 'gsl-view-btn-active' : ''}`}
            onClick={() => setView('cards')}
            title="Карточки"
            aria-label="Карточки"
          >
            {Icons.grid}
          </button>
          <button
            type="button"
            className={`gsl-view-btn ${view === 'list' ? 'gsl-view-btn-active' : ''}`}
            onClick={() => setView('list')}
            title="Таблица"
            aria-label="Таблица"
          >
            {Icons.list}
          </button>
        </div>
      </div>

      {/* Action bar */}
      <div className="gsl-action-bar">
        <div className="gsl-action-group">
          <input
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onChange={handleImport}
            style={{ display: 'none' }}
            id="gas-stations-import-input"
          />
          <button
            type="button"
            className="gsl-btn gsl-btn-secondary"
            onClick={() => document.getElementById('gas-stations-import-input')?.click()}
            title="Импорт АЗС из Excel"
            disabled={loading}
          >
            <span className="gsl-btn-icon">{Icons.upload}</span>
            <span>Импорт</span>
          </button>
          <button
            type="button"
            className="gsl-btn gsl-btn-secondary"
            onClick={handleExport}
            title="Экспорт АЗС в Excel"
            disabled={loading}
          >
            <span className="gsl-btn-icon">{Icons.download}</span>
            <span>Экспорт</span>
          </button>
          {view === 'list' && (
            <button
              type="button"
              className="gsl-btn gsl-btn-secondary"
              onClick={() => setShowColumnSettings(true)}
              title="Настроить поля"
            >
              <span className="gsl-btn-icon">{Icons.settings}</span>
              <span>Настроить поля</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="gsl-alert">{error}</div>
      )}

      {/* Main content */}
      {loading && gasStations.length === 0 ? (
        <div className="gsl-skeleton-wrap">
          <Skeleton rows={10} columns={8} />
        </div>
      ) : view === 'cards' ? (
        <>
          {gasStations.length === 0 ? (
            <div className="gsl-empty">Нет данных для отображения</div>
          ) : (
            <div className="gsl-grid">
              {gasStations.map(s => <StationCard key={s.id} station={s}/>)}
            </div>
          )}
          {total > 0 && (
            <div className="gsl-pagination-wrap">
              <Table.Pagination
                currentPage={currentPage}
                totalPages={Math.ceil(total / limit)}
                total={total}
                pageSize={limit}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </>
      ) : (
        <div className="gsl-table-wrap">
          <Table
            columns={tableColumns}
            data={tableData}
            emptyMessage="Нет данных для отображения"
            compact
            stickyHeader
            sortable={true}
            onSort={handleSort}
            defaultSortColumn={sortBy}
            defaultSortOrder={sortOrder}
          />
          {total > 0 && (
            <Table.Pagination
              currentPage={currentPage}
              totalPages={Math.ceil(total / limit)}
              total={total}
              pageSize={limit}
              onPageChange={setCurrentPage}
            />
          )}
        </div>
      )}

      {/* Edit modal */}
      <Modal
        isOpen={showEditModal}
        onClose={handleCancel}
        title={`АЗС ${editForm.azs_number || initialEditForm?.azs_number || ''}`.trim()}
        size="md"
        closeOnOverlayClick={!isEditDirty}
        closeOnEsc={true}
        showCloseButton={true}
      >
        <form
          className="gse-form"
          data-testid="gas-station-edit-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            if (editingId && isEditDirty && !loading) handleSave(editingId)
          }}
        >
          <Modal.Body>
            <section className="gse-section" aria-labelledby="gse-section-station">
              <h4 id="gse-section-station" className="gse-section__title">АЗС</h4>
              <Input
                type="text"
                label="Наименование"
                value={editForm.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="Как АЗС называется в отчётах"
                helperText={
                  editForm.original_name && editForm.original_name !== editForm.name
                    ? `В данных провайдера: ${editForm.original_name}`
                    : undefined
                }
                error={formErrors.name}
                required
                fullWidth
                name="name"
                autoFocus
              />
              <div className="gse-grid">
                <Select
                  label="Провайдер"
                  value={editForm.provider_id ? editForm.provider_id.toString() : ''}
                  onChange={(value) => {
                    const newProviderId = value ? parseInt(value) : null
                    if (hasTransactions && newProviderId !== originalProviderId) {
                      setPendingProviderId(newProviderId)
                      setShowProviderChangeConfirm(true)
                    } else {
                      setEditForm(prev => ({ ...prev, provider_id: newProviderId }))
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
                />
                <Input
                  type="text"
                  label="Номер АЗС"
                  value={editForm.azs_number}
                  onChange={(e) => updateField('azs_number', e.target.value)}
                  placeholder="Например: 505221"
                  error={formErrors.azs_number}
                  required
                  fullWidth
                  name="azs_number"
                  inputMode="numeric"
                />
              </div>
              {hasTransactions ? (
                <p className="gse-note">
                  <Icon name="info" size={14} />
                  По АЗС уже есть транзакции: смену провайдера нужно будет подтвердить.
                </p>
              ) : null}
            </section>

            <section className="gse-section" aria-labelledby="gse-section-place">
              <h4 id="gse-section-place" className="gse-section__title">Местоположение</h4>
              <div className="gse-grid">
                <Input
                  type="text"
                  label="Населённый пункт"
                  value={editForm.settlement}
                  onChange={(e) => updateField('settlement', e.target.value)}
                  placeholder="Например: Нягань"
                  fullWidth
                  name="settlement"
                />
                <Input
                  type="text"
                  label="Регион"
                  value={editForm.region}
                  onChange={(e) => updateField('region', e.target.value)}
                  placeholder="Например: ХМАО — Югра"
                  fullWidth
                  name="region"
                />
              </div>
              <Input
                type="text"
                label="Адрес"
                value={editForm.location}
                onChange={(e) => updateField('location', e.target.value)}
                placeholder="Улица и дом или ориентир: «База АО „УТТ“»"
                fullWidth
                name="location"
              />
              <div className="gse-coords">
                <Input
                  type="text"
                  inputMode="decimal"
                  label="Широта"
                  value={editForm.latitude}
                  onChange={handleLatitudeChange}
                  onPaste={handleCoordinatesPaste}
                  placeholder="61.1234"
                  error={formErrors.latitude}
                  fullWidth
                  name="latitude"
                />
                <Input
                  type="text"
                  inputMode="decimal"
                  label="Долгота"
                  value={editForm.longitude}
                  onChange={handleLongitudeChange}
                  onPaste={handleCoordinatesPaste}
                  placeholder="65.5678"
                  error={formErrors.longitude}
                  fullWidth
                  name="longitude"
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="gse-coords__map"
                  onClick={() => setShowMapModal(true)}
                  icon={<Icon name="pin" size={16} />}
                >
                  На карте
                </Button>
              </div>
              <p className="gse-hint">Координаты из карт можно вставить парой, например «61.1234, 65.5678».</p>
            </section>
          </Modal.Body>
          <Modal.Footer>
            <Button type="button" variant="secondary" onClick={handleCancel} disabled={loading}>
              Отмена
            </Button>
            <Button type="submit" variant="primary" loading={loading} disabled={loading || !isEditDirty}>
              Сохранить
            </Button>
          </Modal.Footer>
        </form>
      </Modal>

      <MapModal
        isOpen={showMapModal}
        onClose={() => setShowMapModal(false)}
        onConfirm={handleMapConfirm}
        initialLat={editForm.latitude && editForm.latitude !== '' ? parseFloat(editForm.latitude) : null}
        initialLng={editForm.longitude && editForm.longitude !== '' ? parseFloat(editForm.longitude) : null}
      />

      {showColumnSettings && createPortal(
        <div className="column-settings-modal" onClick={(e) => {
          if (e.target.classList.contains('column-settings-modal')) setShowColumnSettings(false)
        }}>
          <div className="column-settings-content" onClick={(e) => e.stopPropagation()}>
            <div className="column-settings-header">
              <h3 className="column-settings-title">Настройка полей таблицы</h3>
              <button className="column-settings-close" onClick={() => setShowColumnSettings(false)} aria-label="Закрыть">×</button>
            </div>
            <p style={{ marginBottom: 'var(--spacing-block)', color: 'var(--text-2)', fontSize: 'var(--font-size-sm)' }}>
              Перетащите поля для изменения порядка. Отметьте галочками поля, которые хотите видеть в таблице.
            </p>
            <ul className="column-settings-list">
              {Object.entries(columnSettings)
                // __v — метка версии набора, а не колонка
                .filter(([key, settings]) => key !== '__v' && settings && typeof settings === 'object')
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
                            Object.keys(newSettings).forEach(k => {
                              // __v — метка версии, у неё нет order
                              if (k === '__v') return
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
                      <span className="column-settings-item-handle" aria-hidden="true"><Icon name="rows" size={16} /></span>
                      <input
                        type="checkbox"
                        className="column-settings-item-checkbox"
                        checked={settings.visible}
                        disabled={key === 'actions'}
                        onChange={(e) => {
                          setColumnSettings(prev => ({ ...prev, [key]: { ...prev[key], visible: e.target.checked } }))
                        }}
                      />
                      <span className="column-settings-item-label">
                        {columnLabels[key] || key}
                        {key === 'actions' && <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-2)', marginLeft: 'var(--spacing-tiny)' }}>(обязательно)</span>}
                      </span>
                    </li>
                  )
                })}
            </ul>
            <div className="column-settings-actions">
              <Button
                variant="secondary"
                size="sm"
                // Сброс возвращает набор по умолчанию, а не собственный
                // список: раньше здесь был зашит второй, устаревший перечень
                // со всеми десятью колонками — одно нажатие возвращало таблицу
                // вдвое шире окна, да ещё и без метки версии.
                onClick={() => setColumnSettings(DEFAULT_COLUMN_SETTINGS)}
              >
                Сбросить
              </Button>
              <Button variant="primary" size="sm" onClick={() => setShowColumnSettings(false)}>Применить</Button>
            </div>
          </div>
        </div>,
        document.body
      )}

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

      <ConfirmModal
        isOpen={showDeleteModal}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
        title="Удаление АЗС"
        message={gasStationToDelete ? `Вы уверены, что хотите удалить АЗС "${gasStationToDelete.name || gasStationToDelete.original_name}"?` : ''}
        confirmText="Да, удалить"
        cancelText="Отмена"
        variant="error"
      />
    </div>
  )
}

export default GasStationsList
