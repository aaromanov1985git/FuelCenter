import React, { useEffect, useMemo, useState } from 'react'
import { Card, Input, Select, Table, Button, Badge, Skeleton } from './ui'
import { authFetch } from '../utils/api'
import { useToast } from './ToastContainer'
import { useDebounce } from '../hooks/useDebounce'
import StatusBadge from './StatusBadge'
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
  failed: 'danger',
  partial: 'warning'
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
      console.log('Загрузка событий:', url)
      
      const response = await authFetch(url)
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}))
        console.error('Ошибка загрузки событий:', response.status, detail)
        throw new Error(detail.detail || 'Ошибка загрузки истории')
      }

      const data = await response.json()
      console.log('Данные событий получены:', { 
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
      console.error('Ошибка загрузки событий:', err)
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
        <div style={{ fontWeight: 'var(--font-weight-semibold)' }}>{formatDateTime(event.created_at)}</div>
        {event.duration_ms && (
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: 'var(--spacing-tiny)' }}>
            {event.duration_ms} мс
          </div>
        )}
      </div>
    ),
    username: (
      <div>
        <div style={{ fontWeight: 'var(--font-weight-semibold)' }}>{event.username || '—'}</div>
        {event.user_id && (
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: 'var(--spacing-tiny)' }}>
            ID {event.user_id}
          </div>
        )}
      </div>
    ),
    source_type: (
      <div>
        <div style={{ fontWeight: 'var(--font-weight-semibold)' }}>{sourceLabels[event.source_type] || event.source_type}</div>
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: 'var(--spacing-tiny)' }}>
          {event.is_scheduled ? 'Регламентная' : 'Ручная'}
        </div>
      </div>
    ),
    provider_name: (
      <div>
        <div style={{ fontWeight: 'var(--font-weight-semibold)' }}>{event.provider_name || '—'}</div>
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: 'var(--spacing-tiny)' }}>
          {event.template_name || '—'}
        </div>
      </div>
    ),
    file_name: event.file_name || '—',
    status: <StatusBadge status={statusTone[event.status] || 'info'} text={event.status || '—'} />,
    transactions: (
      <div>
        <div style={{ fontWeight: 'var(--font-weight-semibold)' }}>
          {event.transactions_created}/{event.transactions_total}
        </div>
        {event.transactions_skipped && (
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: 'var(--spacing-tiny)' }}>
            Пропущено: {event.transactions_skipped}
          </div>
        )}
      </div>
    ),
    message: (
      <div style={{ maxWidth: '320px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={event.message || '—'}>
        {event.message ? event.message.slice(0, 80) + (event.message.length > 80 ? '…' : '') : '—'}
      </div>
    )
  }))

  return (
    <Card>
      <Card.Header>
        <div>
          <Card.Title>События загрузок</Card.Title>
          <p style={{ margin: 'var(--spacing-small) 0 0', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Кто, когда и сколько загрузил. Регламентные загрузки включены.
          </p>
        </div>
      </Card.Header>
      <Card.Body>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--spacing-section)', marginBottom: 'var(--spacing-block)' }}>
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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--spacing-element)', marginBottom: 'var(--spacing-section)' }}>
          <Card variant="outlined" padding="sm">
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--spacing-small)' }}>
              Всего событий
            </div>
            <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-primary)' }}>
              {stats?.total_events || 0}
            </div>
          </Card>
          <Card variant="outlined" padding="sm">
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--spacing-small)' }}>
              Создано транзакций
            </div>
            <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-primary)' }}>
              {stats?.total_created || 0}
            </div>
          </Card>
          <Card variant="outlined" padding="sm">
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--spacing-small)' }}>
              Пропущено
            </div>
            <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-primary)' }}>
              {stats?.total_skipped || 0}
            </div>
          </Card>
          <Card variant="outlined" padding="sm">
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--spacing-small)' }}>
              Ошибок
            </div>
            <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-primary)' }}>
              {stats?.failed_events || 0}
            </div>
          </Card>
          <Card variant="outlined" padding="sm">
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--spacing-small)' }}>
              Регламентных
            </div>
            <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-primary)' }}>
              {stats?.scheduled_events || 0}
            </div>
          </Card>
        </div>

        {loading ? (
          <Skeleton rows={6} columns={8} />
        ) : tableData.length === 0 ? (
          <div style={{ padding: 'var(--spacing-block)', textAlign: 'center', color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-section)' }}>
            <p style={{ margin: 0 }}>Нет событий по выбранным фильтрам.</p>
            {(filters.provider_id || filters.source_type || filters.status || filters.is_scheduled !== 'all' || filters.date_from || filters.date_to || debouncedSearch.trim()) && (
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
            )}
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
      </Card.Body>
    </Card>
  )
}

export default UploadEventsList
