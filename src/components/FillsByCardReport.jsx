import React, { useEffect, useMemo, useState } from 'react'
import { Input, Select, Table, Skeleton, Button } from './ui'
import Icon from './ui/Icon'
import EmptyState from './EmptyState'
import { authFetch } from '../utils/api'
import { useToast } from './ToastContainer'
import { useDebounce } from '../hooks/useDebounce'
import { logger } from '../utils/logger'
import { formatDecimal, formatLiters, formatSourceDate, formatSourceDateTime, toIsoDate } from '../utils/topazFormat'
import './TopazLists.css'

const API_URL = import.meta.env.VITE_API_URL || ''

const defaultFilters = () => {
  const today = new Date()
  const from = new Date(today)
  from.setDate(today.getDate() - 29)
  return { date_from: toIsoDate(from), date_to: toIsoDate(today), provider_id: '', fuel_type: '', search: '', at_limit_only: '' }
}

const toCsv = (items) => {
  const header = ['Провайдер', 'Карта', 'Топливо', 'Заправок', 'Литров', 'Дней с заправками', 'Максимум за сутки', 'Среднее за сутки', 'Суточный лимит', 'Дней у лимита', 'АЗС', 'Первая', 'Последняя']
  const escape = (value) => {
    const text = value === null || value === undefined ? '' : String(value)
    return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const lines = items.map((item) => [
    item.provider_name, item.card_number, item.fuel_type, item.fills_count,
    String(item.liters).replace('.', ','), item.days_with_fills,
    String(item.max_daily_liters).replace('.', ','), String(item.avg_daily_liters).replace('.', ','),
    item.daily_limit ?? '', item.days_at_limit ?? '', item.azs_numbers.join(' '),
    formatSourceDateTime(item.first_fill), formatSourceDateTime(item.last_fill),
  ].map(escape).join(';'))
  return '﻿' + [header.join(';'), ...lines].join('\r\n')
}

const FillsByCardReport = () => {
  const { error: showError } = useToast()
  const [filters, setFilters] = useState(defaultFilters)
  const [report, setReport] = useState(null)
  const [providers, setProviders] = useState([])
  const [loading, setLoading] = useState(true)
  const debouncedSearch = useDebounce(filters.search, 400)

  useEffect(() => {
    authFetch(`${API_URL}/api/v1/providers?limit=200`)
      .then((response) => (response.ok ? response.json() : { items: [] }))
      .then((body) => setProviders(body.items || body || []))
      .catch(() => setProviders([]))
  }, [])

  useEffect(() => {
    if (!filters.date_from || !filters.date_to) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ date_from: filters.date_from, date_to: filters.date_to })
        if (filters.provider_id) params.append('provider_id', filters.provider_id)
        if (filters.fuel_type) params.append('fuel_type', filters.fuel_type)
        if (debouncedSearch.trim()) params.append('search', debouncedSearch.trim())
        if (filters.at_limit_only) params.append('at_limit_only', 'true')
        const response = await authFetch(`${API_URL}/api/v1/reports/fills-by-card?${params}`)
        if (!response.ok) {
          const detail = await response.json().catch(() => ({}))
          throw new Error(detail.detail || 'Не удалось построить отчёт')
        }
        const body = await response.json()
        if (!cancelled) setReport(body)
      } catch (err) {
        if (err.isUnauthorized) return
        logger.error('Ошибка отчёта по заправкам:', err)
        showError(err.message)
        if (!cancelled) setReport(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [filters.date_from, filters.date_to, filters.provider_id, filters.fuel_type, filters.at_limit_only, debouncedSearch, showError])

  const setFilter = (field, value) => setFilters((prev) => ({ ...prev, [field]: value }))

  const downloadCsv = () => {
    if (!report?.items?.length) return
    const blob = new Blob([toCsv(report.items)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `zapravki-po-kartam_${report.date_from}_${report.date_to}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const columns = [
    { key: 'card', header: 'Карта' },
    { key: 'fuel', header: 'Топливо' },
    { key: 'fills', header: 'Заправок', align: 'right' },
    { key: 'liters', header: 'Литров', align: 'right' },
    { key: 'days', header: 'Дней', align: 'right' },
    { key: 'daily', header: 'За сутки: макс / сред.', align: 'right' },
    { key: 'limit', header: 'Суточный лимит', align: 'right' },
    { key: 'at_limit', header: 'Дней у лимита', align: 'right' },
    { key: 'azs', header: 'АЗС' },
    { key: 'last', header: 'Последняя' },
  ]

  const rows = useMemo(() => (report?.items || []).map((item, index) => ({
    id: `${item.provider_id}-${item.card_number}-${item.fuel_type}-${index}`,
    card: (
      <div>
        <div className="tpz-primary">{item.card_number || 'без карты'}</div>
        <div className="tpz-muted">{item.provider_name}</div>
      </div>
    ),
    fuel: item.fuel_type || '—',
    fills: <span className="t-numeric">{item.fills_count}</span>,
    liters: <span className="t-numeric tpz-primary">{formatDecimal(item.liters)}</span>,
    days: <span className="t-numeric">{item.days_with_fills}</span>,
    daily: <span className="t-numeric">{formatDecimal(item.max_daily_liters)} / {formatDecimal(item.avg_daily_liters)}</span>,
    limit: <span className="t-numeric">{item.daily_limit ? `${formatLiters(item.daily_limit)} л` : '—'}</span>,
    at_limit: item.days_at_limit ? (
      <span className="tpz-chip t-numeric" data-tone="warn" title="Дней, когда выбрано 90 % суточного лимита и больше">
        {item.days_at_limit} из {item.days_with_fills}
      </span>
    ) : <span className="t-numeric tpz-muted">{item.daily_limit ? '0' : '—'}</span>,
    azs: <span className="t-numeric">{item.azs_numbers.join(', ') || '—'}</span>,
    last: <span className="t-numeric">{formatSourceDateTime(item.last_fill)}</span>,
  })), [report])

  const invalidPeriod = filters.date_from && filters.date_to && filters.date_from > filters.date_to

  return (
    <div className="tpz-root" data-testid="fills-by-card-report">
      <div className="tpz-header">
        <div>
          <h2 className="tpz-header__title">Заправки по картам</h2>
          <p className="tpz-header__subtitle">
            Сколько и как часто заправлялась каждая карта и как это соотносится с её суточным лимитом в Топазе. Период — до 93 дней.
          </p>
        </div>
        <Button variant="secondary" icon={<Icon name="download" size={16} />} onClick={downloadCsv} disabled={!report?.items?.length}>
          Скачать CSV
        </Button>
      </div>

      <div className="tpz-filters">
        <Input label="С" type="date" value={filters.date_from} onChange={(e) => setFilter('date_from', e.target.value)}
          error={invalidPeriod ? 'Дата «с» позже даты «по»' : undefined} fullWidth />
        <Input label="По" type="date" value={filters.date_to} onChange={(e) => setFilter('date_to', e.target.value)} fullWidth />
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
        <Input label="Карта" value={filters.search} onChange={(e) => setFilter('search', e.target.value)}
          placeholder="Название карты" icon={<Icon name="search" size={16} />} fullWidth />
        <Select
          label="Лимит"
          value={filters.at_limit_only}
          onChange={(value) => setFilter('at_limit_only', value || '')}
          options={[{ value: '', label: 'Все карты' }, { value: 'true', label: 'Упирались в суточный лимит' }]}
          fullWidth
        />
      </div>

      {report ? (
        <div className="tpz-stats" data-testid="fills-by-card-totals">
          <div className="tpz-stat"><div className="t-label">Карт</div><div className="t-value-sm">{report.totals.cards}</div></div>
          <div className="tpz-stat"><div className="t-label">Заправок</div><div className="t-value-sm">{report.totals.fills_count}</div></div>
          <div className="tpz-stat"><div className="t-label">Литров</div><div className="t-value-sm">{formatLiters(report.totals.liters)}</div></div>
          <div className="tpz-stat">
            <div className="t-label">Период</div>
            <div className="t-value-sm">{formatSourceDate(report.date_from)} — {formatSourceDate(report.date_to)}</div>
          </div>
        </div>
      ) : null}

      <div className="tpz-card">
        {loading ? (
          <div className="tpz-card__state"><Skeleton rows={6} columns={8} /></div>
        ) : rows.length === 0 ? (
          <div className="tpz-card__state">
            <EmptyState
              title="Заправок за период нет"
              message="Измените период или фильтры. Заправки берутся из транзакций, загруженных в GSM."
              icon={<Icon name="file" size={32} />}
            />
          </div>
        ) : (
          <Table columns={columns} data={rows} striped hoverable compact stickyHeader />
        )}
      </div>
    </div>
  )
}

export default FillsByCardReport
