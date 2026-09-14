import React, { useEffect, useState } from 'react'
import { Input, Select, Table, Skeleton, Button } from './ui'
import Icon from './ui/Icon'
import EmptyState from './EmptyState'
import { authFetch } from '../utils/api'
import { useToast } from './ToastContainer'
import { useDebounce } from '../hooks/useDebounce'
import { logger } from '../utils/logger'
import { fillTone, formatLiters, formatPercent, formatSourceDateTime } from '../utils/topazFormat'
import './TopazLists.css'

const API_URL = import.meta.env.VITE_API_URL || ''
const PAGE_SIZE = 50

const EMPTY_FILTERS = { search: '', provider_id: '', fuel_type: '', near_limit: '', only_enabled: 'true' }

/* Для расхода «много» — плохо: инвертируем шкалу заполнения резервуара. */
const usageTone = (percent) => {
  if (percent === null || percent === undefined) return 'neutral'
  const tone = fillTone(100 - percent)
  return tone
}

const UsageCell = ({ item }) => {
  if (item.limit_type_id === 4) return <span className="tpz-chip" data-tone="warn">Отпуск запрещён</span>
  if (item.used_percent === null || item.used_percent === undefined) {
    return <span className="tpz-muted">{item.limit_type_id ? 'не считается для этого типа' : 'тип периода не выбран'}</span>
  }
  const width = Math.min(100, Math.max(0, item.used_percent))
  return (
    <div className="tpz-usage">
      <div className="tpz-usage__text t-numeric">
        {formatLiters(item.used_liters)} из {formatLiters(item.limit_liters)} л
        <span className="tpz-muted"> · {formatPercent(item.used_percent)}</span>
      </div>
      <div className="tpz-bar" data-tone={usageTone(item.used_percent)} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.used_percent}>
        <span className="tpz-bar__fill" style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}

const CardLimitsList = () => {
  const { error: showError } = useToast()
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ items: [], total: 0, stats: null, synced_at: null })
  const [providers, setProviders] = useState([])
  const [loading, setLoading] = useState(true)
  const debouncedSearch = useDebounce(filters.search, 400)

  useEffect(() => {
    authFetch(`${API_URL}/api/v1/providers?limit=200`)
      .then((response) => (response.ok ? response.json() : { items: [] }))
      .then((body) => setProviders(body.items || body || []))
      .catch(() => setProviders([]))
  }, [])

  useEffect(() => { setPage(1) }, [debouncedSearch, filters.provider_id, filters.fuel_type, filters.near_limit, filters.only_enabled])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) })
        if (debouncedSearch.trim()) params.append('search', debouncedSearch.trim())
        if (filters.provider_id) params.append('provider_id', filters.provider_id)
        if (filters.fuel_type) params.append('fuel_type', filters.fuel_type)
        if (filters.near_limit) params.append('near_limit', 'true')
        params.append('only_enabled', filters.only_enabled || 'true')
        const response = await authFetch(`${API_URL}/api/v1/card-limits?${params}`)
        if (!response.ok) {
          const detail = await response.json().catch(() => ({}))
          throw new Error(detail.detail || 'Не удалось загрузить лимиты карт')
        }
        const body = await response.json()
        if (!cancelled) setData(body)
      } catch (err) {
        if (err.isUnauthorized) return
        logger.error('Ошибка загрузки лимитов карт:', err)
        showError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [page, debouncedSearch, filters.provider_id, filters.fuel_type, filters.near_limit, filters.only_enabled, showError])

  const setFilter = (field, value) => setFilters((prev) => ({ ...prev, [field]: value }))
  const hasFilters = JSON.stringify({ ...filters, search: debouncedSearch }) !== JSON.stringify(EMPTY_FILTERS)
  const stats = data.stats

  const tiles = stats
    ? [
        { label: 'Карт с лимитами', value: stats.enabled, hint: `всего записей ${stats.total}` },
        { label: 'Выбрали 90 % и больше', value: stats.near_limit, tone: stats.near_limit ? 'warn' : undefined },
        { label: 'Лимит выбран полностью', value: stats.exhausted, tone: stats.exhausted ? 'warn' : undefined },
        { label: 'Лимит без периода', value: stats.without_period, hint: 'такой лимит, скорее всего, не действует', tone: stats.without_period ? 'warn' : undefined },
      ]
    : []

  const columns = [
    { key: 'card', header: 'Карта' },
    { key: 'provider', header: 'Провайдер' },
    { key: 'fuel', header: 'Топливо' },
    { key: 'type', header: 'Период' },
    { key: 'usage', header: 'Расход за период' },
    { key: 'remaining', header: 'Остаток', align: 'right' },
  ]

  const rows = data.items.map((item) => ({
    id: item.id,
    card: (
      <div>
        <div className="tpz-primary">{item.card_name || '—'}</div>
        <div className="tpz-muted t-numeric">{item.card_code}{item.card_enabled ? '' : ' · выключена'}</div>
      </div>
    ),
    provider: item.provider_name || '—',
    fuel: (
      <div>
        <div className="tpz-primary">{item.fuel_type || '—'}</div>
        {item.source_fuel && item.source_fuel !== item.fuel_type ? <div className="tpz-muted">в Топазе: {item.source_fuel}</div> : null}
      </div>
    ),
    type: (
      <div>
        <div>{item.limit_type_name || 'не выбран'}</div>
        {item.period_start ? <div className="tpz-muted">с {formatSourceDateTime(item.period_start)}</div> : null}
      </div>
    ),
    usage: <UsageCell item={item} />,
    remaining: <span className="t-numeric">{item.remaining_liters === null || item.remaining_liters === undefined ? '—' : `${formatLiters(item.remaining_liters)} л`}</span>,
  }))

  return (
    <div className="tpz-root" data-testid="card-limits-list">
      <div className="tpz-header">
        <div>
          <h2 className="tpz-header__title">Лимиты карт</h2>
          <p className="tpz-header__subtitle">
            Лимиты из Топаза и сколько из них израсходовано в текущем периоде. Изменить лимит можно только в Топазе.
            {data.synced_at ? ` Данные на ${formatSourceDateTime(data.synced_at)}.` : ''}
          </p>
        </div>
      </div>

      {tiles.length ? (
        <div className="tpz-stats" data-testid="card-limits-stats">
          {tiles.map((tile) => (
            <div key={tile.label} className="tpz-stat" data-tone={tile.tone}>
              <div className="t-label">{tile.label}</div>
              <div className="t-value-sm">{tile.value}</div>
              {tile.hint ? <div className="tpz-muted">{tile.hint}</div> : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="tpz-filters">
        <Input
          label="Карта"
          value={filters.search}
          onChange={(e) => setFilter('search', e.target.value)}
          placeholder="Название или код"
          icon={<Icon name="search" size={16} />}
          fullWidth
        />
        <Select
          label="Провайдер"
          value={filters.provider_id}
          onChange={(value) => setFilter('provider_id', value || '')}
          options={[{ value: '', label: 'Все' }, ...providers.map((p) => ({ value: String(p.id), label: p.name }))]}
          fullWidth
        />
        <Select
          label="Топливо"
          value={filters.fuel_type}
          onChange={(value) => setFilter('fuel_type', value || '')}
          options={[{ value: '', label: 'Все' }, { value: 'ДТ', label: 'ДТ' }, { value: 'АИ-92', label: 'АИ-92' }, { value: 'АИ-95', label: 'АИ-95' }]}
          fullWidth
        />
        <Select
          label="Расход"
          value={filters.near_limit}
          onChange={(value) => setFilter('near_limit', value || '')}
          options={[{ value: '', label: 'Любой' }, { value: 'true', label: '90 % лимита и больше' }]}
          fullWidth
        />
        <Select
          label="Карты"
          value={filters.only_enabled}
          onChange={(value) => setFilter('only_enabled', value || 'true')}
          options={[{ value: 'true', label: 'Только включённые' }, { value: 'false', label: 'Все, включая выключенные' }]}
          fullWidth
        />
      </div>

      <div className="tpz-card">
        {loading ? (
          <div className="tpz-card__state"><Skeleton rows={6} columns={6} /></div>
        ) : rows.length === 0 ? (
          <div className="tpz-card__state">
            <EmptyState
              title={hasFilters ? 'Нет лимитов под эти фильтры' : 'Лимитов пока нет'}
              message={hasFilters ? 'Измените или сбросьте фильтры.' : 'Лимиты появятся после чтения из Топаза — оно идёт по расписанию раз в 15 минут.'}
              icon={<Icon name="gauge" size={32} />}
              action={hasFilters ? <Button onClick={() => setFilters(EMPTY_FILTERS)}>Сбросить фильтры</Button> : null}
            />
          </div>
        ) : (
          <>
            <Table columns={columns} data={rows} striped hoverable compact stickyHeader />
            {data.total > PAGE_SIZE ? (
              <Table.Pagination
                currentPage={page}
                totalPages={Math.ceil(data.total / PAGE_SIZE)}
                total={data.total}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

export default CardLimitsList
