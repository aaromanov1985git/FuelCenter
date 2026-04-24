import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import IconButton from './IconButton'
import StatusBadge from './StatusBadge'
import { useToast } from './ToastContainer'
import { useDebounce } from '../hooks/useDebounce'
import { authFetch } from '../utils/api'
import { logger } from '../utils/logger'
import { Card, Button, Input, Table, Badge, Skeleton, Alert, Select, Modal, Tooltip } from './ui'
import MapModal from './MapModal'
import ConfirmModal from './ConfirmModal'
import './GasStationsList.css'
import './ColumnSettingsModal.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

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

// Inline SVG icons (matching reference aesthetic)
const Icons = {
  pin: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  ),
  search: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  ),
  grid: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
    </svg>
  ),
  list: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
      <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
      <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
    </svg>
  ),
  edit: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  ),
  trash: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6M14 11v6"/>
    </svg>
  ),
  upload: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  ),
  download: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  ),
  settings: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
  map: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
      <line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>
    </svg>
  ),
  check: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  close: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
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
        return JSON.parse(saved)
      } catch (e) {
        logger.error('Ошибка загрузки настроек колонок:', e)
      }
    }
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
    const latError = validateCoordinate(editForm.latitude, 'latitude')
    const lngError = validateCoordinate(editForm.longitude, 'longitude')
    if (latError || lngError) {
      setFormErrors({ latitude: latError || undefined, longitude: lngError || undefined })
      showError('Исправьте ошибки в координатах перед сохранением')
      return
    }
    try {
      setLoading(true)
      const { original_name, ...updateData } = editForm
      if (updateData.latitude !== '') {
        updateData.latitude = parseFloat(updateData.latitude)
        if (isNaN(updateData.latitude)) updateData.latitude = null
      } else {
        updateData.latitude = null
      }
      if (updateData.longitude !== '') {
        updateData.longitude = parseFloat(updateData.longitude)
        if (isNaN(updateData.longitude)) updateData.longitude = null
      } else {
        updateData.longitude = null
      }
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

  const validateCoordinate = (value, type) => {
    if (!value || value.trim() === '') return null
    const num = parseFloat(value)
    if (isNaN(num)) return `Введите корректное число`
    if (type === 'latitude' && (num < -90 || num > 90)) return `Широта должна быть от -90 до 90`
    if (type === 'longitude' && (num < -180 || num > 180)) return `Долгота должна быть от -180 до 180`
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
    return [
      { label: 'Всего АЗС', value: totalCount, accent: 'var(--text-1)' },
      { label: 'Валидные', value: validCount, accent: 'var(--green)' },
      { label: 'Требуют проверки', value: pendingCount, accent: 'var(--amber)' },
      { label: 'С ошибками', value: invalidCount, accent: 'var(--red)' },
    ]
  }, [stats])

  const tableColumns = useMemo(() => {
    const allColumns = [
      { key: 'original_name', header: 'Исходное наименование', sortable: true },
      { key: 'name', header: 'Наименование', sortable: true },
      { key: 'provider', header: 'Провайдер', sortable: false },
      { key: 'azs_number', header: 'Номер АЗС', sortable: true },
      { key: 'location', header: 'Местоположение', sortable: true },
      { key: 'region', header: 'Регион', sortable: true },
      { key: 'settlement', header: 'Населенный пункт', sortable: true },
      { key: 'coordinates', header: 'Координаты', sortable: false },
      { key: 'status', header: 'Статус', sortable: true },
      { key: 'errors', header: 'Ошибки', sortable: false },
      { key: 'actions', header: 'Действия', sortable: false }
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
      return {
        id: gasStation.id,
        original_name: originalName !== '-' && originalName.length > 40 ? (
          <Tooltip content={originalName} position="top" maxWidth={400}>
            <span className="text-truncate">{originalName}</span>
          </Tooltip>
        ) : originalName,
        name: name !== '-' && name.length > 40 ? (
          <Tooltip content={name} position="top" maxWidth={400}>
            <span className="text-truncate">{name}</span>
          </Tooltip>
        ) : name,
        provider: getProviderName(gasStation.provider_id),
        azs_number: gasStation.azs_number || '-',
        location: location !== '-' && location.length > 50 ? (
          <Tooltip content={location} position="top" maxWidth={400}>
            <span className="text-truncate">{location}</span>
          </Tooltip>
        ) : location,
        region: gasStation.region || '-',
        settlement: gasStation.settlement || '-',
        coordinates: gasStation.latitude !== null && gasStation.longitude !== null
          ? `${gasStation.latitude}, ${gasStation.longitude}` : '-',
        status: getStatusBadge(gasStation.is_validated),
        errors: errors ? (
          errors.length > 50 ? (
            <Tooltip content={errors} position="top" maxWidth={400}>
              <span className="error-text text-truncate">{errors}</span>
            </Tooltip>
          ) : (
            <span className="error-text" title={errors}>{errors}</span>
          )
        ) : '-',
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
        {kpiCards.map((k, i) => (
          <div key={i} className="gsl-kpi-card">
            <div className="gsl-kpi-accent" style={{ background: k.accent }}/>
            <div className="gsl-kpi-body">
              <div className="gsl-kpi-label t-label">{k.label}</div>
              <div className="gsl-kpi-value" style={{ color: k.accent }}>
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
        title={editForm.name ? `Редактирование АЗС: "${editForm.name}"` : `Редактирование АЗС №${editForm.azs_number || '?'}`}
        size="md"
        closeOnOverlayClick={true}
        closeOnEsc={true}
        showCloseButton={true}
      >
        <Modal.Body>
          <div className="gas-station-edit-form">
            <div className="form-section">
              <h4 className="form-section-title">Основная информация</h4>
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

            <div className="form-section">
              <h4 className="form-section-title">География</h4>
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
                  icon={Icons.map}
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
                icon={Icons.close}
                iconPosition="left"
              >
                Отмена
              </Button>
              <Button
                variant="primary"
                onClick={() => editingId && handleSave(editingId)}
                disabled={loading}
                loading={loading}
                icon={Icons.check}
                iconPosition="left"
              >
                {loading ? 'Сохранение...' : 'Сохранить'}
              </Button>
            </div>
          </div>
        </Modal.Body>
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
                onClick={() => {
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
