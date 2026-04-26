import React, { useEffect, useState } from 'react'
import { Input, Select, Table, Button, Skeleton, Modal } from './ui'
import { authFetch } from '../utils/api'
import { useToast } from './ToastContainer'
import { useDebounce } from '../hooks/useDebounce'
import StatusBadge from './StatusBadge'
import EmptyState from './EmptyState'
import { logger } from '../utils/logger'
import './UploadEventsList.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

const formatDateTime = (value) => {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString('ru-RU')
  } catch {
    return value
  }
}

const sourceLabels = {
  manual: 'Ручная',
  auto: 'Регламентная'
}

const statusTone = {
  success: 'success',
  failed: 'failed',
  partial: 'partial'
}

const statusLabels = {
  success: 'Успешно',
  failed: 'Ошибка',
  partial: 'Частично'
}

const UploadEventsList = () => {
  const { error: showError } = useToast()

  const [events, setEvents] = useState([])
  const [stats, setStats] = useState({
    total_events: 0,
    total_records: 0,
    total_created: 0,
    total_skipped: 0,
    total_failed: 0,
    failed_events: 0,
    scheduled_events: 0
  })
  const [providers, setProviders] = useState([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [limit] = useState(25)
  const [total, setTotal] = useState(0)

  const [filters, setFilters] = useState({
    search: '',
    provider_id: '',
    source_type: '',
    status: '',
    is_scheduled: 'all',
    date_from: '',
    date_to: ''
  })
  const [messageModal, setMessageModal] = useState({ isOpen: false, message: '', title: '' })

  const debouncedSearch = useDebounce(filters.search, 400)

  const loadProviders = async () => {
    try {
      const response = await authFetch(`${API_URL}/api/v1/providers?limit=200`)
      if (!response.ok) {
        throw new Error('Не удалось загрузить провайдеров')
      }
      const data = await response.json()
      setProviders(data.items || data || [])
    } catch (err) {
      showError(err.message)
    }
  }

  const loadEvents = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('page', page.toString())
      params.append('limit', limit.toString())
      if (debouncedSearch.trim()) params.append('search', debouncedSearch.trim())
      if (filters.provider_id) params.append('provider_id', filters.provider_id)
      if (filters.source_type) params.append('source_type', filters.source_type)
      if (filters.status) params.append('status', filters.status)
      if (filters.is_scheduled !== 'all') params.append('is_scheduled', filters.is_scheduled === 'true')
      if (filters.date_from) params.append('date_from', filters.date_from)
      if (filters.date_to) params.append('date_to', filters.date_to)

      const url = `${API_URL}/api/v1/upload-events?${params.toString()}`
      logger.debug('Загрузка событий:', { url })

      const response = await authFetch(url)
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}))
        logger.error('Ошибка загрузки событий:', { status: response.status, detail })
        throw new Error(detail.detail || 'Ошибка загрузки истории')
      }

      const data = await response.json()
      logger.debug('Данные событий получены:', {
        total: data.total,
        itemsCount: data.items?.length || 0,
        stats: data.stats
      })
      setEvents(data.items || [])
      // Всегда устанавливаем stats, даже если пустые
      setStats(data.stats || {
        total_events: 0,
        total_records: 0,
        total_created: 0,
        total_skipped: 0,
        total_failed: 0,
        failed_events: 0,
        scheduled_events: 0
      })
      setTotal(data.total || 0)
    } catch (err) {
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
      logger.error('Ошибка загрузки событий:', err)
      showError(err.message || 'Ошибка загрузки событий загрузки')
      // При ошибке устанавливаем пустые значения
      setEvents([])
      setStats({
        total_events: 0,
        total_records: 0,
        total_created: 0,
        total_skipped: 0,
        total_failed: 0,
        failed_events: 0,
        scheduled_events: 0
      })
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProviders()
  }, [])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, filters.provider_id, filters.source_type, filters.status, filters.is_scheduled, filters.date_from, filters.date_to])

  useEffect(() => {
    loadEvents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch, filters.provider_id, filters.source_type, filters.status, filters.is_scheduled, filters.date_from, filters.date_to])

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }))
  }

  const hasActiveFilters = Boolean(
    filters.provider_id || filters.source_type || filters.status ||
    filters.is_scheduled !== 'all' || filters.date_from || filters.date_to ||
    debouncedSearch.trim()
  )

  // Подготовка данных для таблицы
  const tableColumns = [
    { key: 'created_at', header: 'Дата/время', sortable: true },
    { key: 'username', header: 'Пользователь', sortable: true },
    { key: 'source_type', header: 'Источник', sortable: true },
    { key: 'provider_name', header: 'Провайдер', sortable: true },
    { key: 'file_name', header: 'Файл/канал', sortable: true },
    { key: 'status', header: 'Статус', sortable: true },
    { key: 'transactions', header: 'Записи', sortable: true },
    { key: 'message', header: 'Сообщение', sortable: false }
  ]

  const tableData = events.map((event) => ({
    id: event.id,
    created_at: (
      <div>
        <div className="event-datetime-primary">{formatDateTime(event.created_at)}</div>
        {event.duration_ms && (
          <div className="event-datetime-secondary">
            {event.duration_ms} мс
          </div>
        )}
      </div>
    ),
    username: (
      <div>
        <div className="event-username-primary">{event.username || '—'}</div>
        {event.user_id && (
          <div className="event-username-secondary">
            ID {event.user_id}
          </div>
        )}
      </div>
    ),
    source_type: (
      <div>
        <div className="event-source-primary">{sourceLabels[event.source_type] || event.source_type}</div>
        <div className="event-source-secondary">
          {event.is_scheduled ? 'Регламентная' : 'Ручная'}
        </div>
      </div>
    ),
    provider_name: (
      <div>
        <div className="event-provider-primary">{event.provider_name || '—'}</div>
        <div className="event-provider-secondary">
          {event.template_name || '—'}
        </div>
      </div>
    ),
    file_name: event.file_name || '—',
    status: <StatusBadge status={statusTone[event.status] || 'pending'} text={statusLabels[event.status] || event.status || '—'} />,
    transactions: (
      <div>
        <div className="event-transactions-primary">
          {event.transactions_created}/{event.transactions_total}
        </div>
        {event.transactions_skipped && (
          <div className="event-transactions-secondary">
            Пропущено: {event.transactions_skipped}
          </div>
        )}
      </div>
    ),
    message: (
      <div className="event-message-cell">
        <div className="event-message-truncated" title={event.message || '—'}>
          {event.message ? event.message.slice(0, 80) + (event.message.length > 80 ? '…' : '') : '—'}
        </div>
        {event.message && event.message.length > 80 && (
          <button
            className="event-message-expand-btn"
            onClick={(e) => {
              e.stopPropagation()
              setMessageModal({
                isOpen: true,
                message: event.message,
                title: `Сообщение события #${event.id}`
              })
            }}
            title="Просмотреть полный текст"
            aria-label="Просмотреть полный текст сообщения"
          >
            📄
          </button>
        )}
      </div>
    )
  }))

  const statTiles = [
    { label: 'Всего событий', value: stats?.total_events || 0, tone: 'accent' },
    { label: 'Создано транзакций', value: stats?.total_created || 0, tone: 'green' },
    { label: 'Пропущено', value: stats?.total_skipped || 0, tone: 'amber' },
    { label: 'Ошибок', value: stats?.failed_events || 0, tone: 'red' },
    { label: 'Регламентных', value: stats?.scheduled_events || 0, tone: 'cyan' }
  ]

  return (
    <div className="upl-root" data-testid="upload-events-list">
      <div className="upl-header">
        <div>
          <h2 className="upl-header__title">События загрузок</h2>
          <p className="upl-header__subtitle event-subtitle">
            Кто, когда и сколько загрузил. Регламентные загрузки включены.
          </p>
        </div>
      </div>

      <div className="upl-stats events-stats-grid" data-testid="upload-events-stats">
        {statTiles.map((tile) => (
          <div key={tile.label} className="upl-stat" data-tone={tile.tone}>
            <span className="upl-stat__bar" />
            <div className="upl-stat__body">
              <div className="t-label">{tile.label}</div>
              <div className="t-value-sm upl-stat__value">{tile.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="upl-filters">
        <div className="upl-filters__grid events-filters-grid">
          <Input
            label="Поиск"
            type="text"
            value={filters.search}
            onChange={(e) => handleFilterChange('search', e.target.value)}
            placeholder="Файл, пользователь, провайдер, сообщение..."
            icon="🔍"
            iconPosition="left"
            fullWidth
          />
          <Select
            label="Провайдер"
            value={filters.provider_id || ''}
            onChange={(value) => handleFilterChange('provider_id', value || '')}
            options={[
              { value: '', label: 'Все' },
              ...providers.map((p) => ({ value: p.id.toString(), label: p.name }))
            ]}
            fullWidth
          />
          <Select
            label="Источник"
            value={filters.source_type || ''}
            onChange={(value) => handleFilterChange('source_type', value || '')}
            options={[
              { value: '', label: 'Все' },
              { value: 'manual', label: 'Ручная' },
              { value: 'auto', label: 'Регламентная' }
            ]}
            fullWidth
          />
          <Select
            label="Статус"
            value={filters.status || ''}
            onChange={(value) => handleFilterChange('status', value || '')}
            options={[
              { value: '', label: 'Все' },
              { value: 'success', label: 'Успех' },
              { value: 'failed', label: 'Ошибка' },
              { value: 'partial', label: 'Частично' }
            ]}
            fullWidth
          />
          <Select
            label="Регламент"
            value={filters.is_scheduled === 'all' ? '' : filters.is_scheduled}
            onChange={(value) => handleFilterChange('is_scheduled', value === '' ? 'all' : value)}
            options={[
              { value: '', label: 'Все' },
              { value: 'true', label: 'Только регламентные' },
              { value: 'false', label: 'Только ручные' }
            ]}
            fullWidth
          />
          <Input
            label="Дата с"
            type="date"
            value={filters.date_from}
            onChange={(e) => handleFilterChange('date_from', e.target.value)}
            fullWidth
          />
          <Input
            label="Дата по"
            type="date"
            value={filters.date_to}
            onChange={(e) => handleFilterChange('date_to', e.target.value)}
            fullWidth
          />
        </div>
      </div>

      <div className="upl-card">
        <div className="upl-card__body">
          {loading ? (
            <div className="upl-card__state">
              <Skeleton rows={6} columns={8} />
            </div>
          ) : tableData.length === 0 ? (
            <div className="upl-card__state">
              <EmptyState
                title="Нет событий по выбранным фильтрам"
                message={
                  hasActiveFilters
                    ? 'Попробуйте изменить параметры фильтрации или сбросить фильтры, чтобы увидеть все события.'
                    : 'События загрузок пока отсутствуют. Загрузите файл для создания первого события.'
                }
                icon="📋"
                variant="default"
                action={
                  hasActiveFilters ? (
                    <Button
                      variant="primary"
                      onClick={() => {
                        setFilters({
                          search: '',
                          provider_id: '',
                          source_type: '',
                          status: '',
                          is_scheduled: 'all',
                          date_from: '',
                          date_to: ''
                        })
                      }}
                    >
                      Сбросить фильтры
                    </Button>
                  ) : null
                }
              />
            </div>
          ) : (
            <>
              <Table
                columns={tableColumns}
                data={tableData}
                emptyMessage="Нет событий по выбранным фильтрам"
                striped
                hoverable
                compact
              />
              {total > limit && (
                <Table.Pagination
                  currentPage={page}
                  totalPages={Math.ceil(total / limit)}
                  total={total}
                  pageSize={limit}
                  onPageChange={setPage}
                />
              )}
            </>
          )}
        </div>
      </div>

      <Modal
        isOpen={messageModal.isOpen}
        onClose={() => setMessageModal({ isOpen: false, message: '', title: '' })}
        title={messageModal.title}
        size="md"
      >
        <Modal.Body>
          <div className="event-message-full">
            {messageModal.message || '—'}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="primary"
            onClick={() => setMessageModal({ isOpen: false, message: '', title: '' })}
          >
            Закрыть
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}

export default UploadEventsList
