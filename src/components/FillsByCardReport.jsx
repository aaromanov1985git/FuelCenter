import React, { useEffect, useMemo, useState } from 'react'
import { Input, Select, Table, Skeleton, Button, Modal } from './ui'
import Icon from './ui/Icon'
import EmptyState from './EmptyState'
import { authFetch } from '../utils/api'
import { useToast } from './ToastContainer'
import { useDebounce } from '../hooks/useDebounce'
import { logger } from '../utils/logger'
import { formatDecimal, formatLiters, formatSourceDate, formatSourceDateTime, toIsoDate } from '../utils/topazFormat'
import './TopazLists.css'

const API_URL = import.meta.env.VITE_API_URL || ''
const AT_LIMIT_SHARE = 0.9
const DETAIL_EXPORT_LIMIT = 20000

const defaultFilters = () => {
  const today = new Date()
  const from = new Date(today)
  from.setDate(today.getDate() - 29)
  return { date_from: toIsoDate(from), date_to: toIsoDate(today), provider_id: '', fuel_type: '', search: '', at_limit_only: '' }
}

const escapeCsv = (value) => {
  const text = value === null || value === undefined ? '' : String(value)
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const decimalCsv = (value) => (value === null || value === undefined ? '' : String(value).replace('.', ','))

const csvDocument = (header, lines) => '﻿' + [header.join(';'), ...lines.map((line) => line.map(escapeCsv).join(';'))].join('\r\n')

const summaryCsv = (items) => csvDocument(
  ['Провайдер', 'Карта', 'Топливо', 'Заправок', 'Литров', 'Дней с заправками', 'Максимум за сутки', 'Среднее за сутки', 'Суточный лимит', 'Дней у лимита', 'АЗС', 'Первая', 'Последняя'],
  items.map((item) => [
    item.provider_name, item.card_number, item.fuel_type, item.fills_count, decimalCsv(item.liters), item.days_with_fills,
    decimalCsv(item.max_daily_liters), decimalCsv(item.avg_daily_liters), item.daily_limit ?? '', item.days_at_limit ?? '',
    item.azs_numbers.join(' '), formatSourceDateTime(item.first_fill), formatSourceDateTime(item.last_fill),
  ]),
)

const detailCsv = (items) => csvDocument(
  ['Дата и время', 'Провайдер', 'АЗС', 'Карта', 'Закреплена за', 'Топливо', 'Литров'],
  items.map((item) => [
    formatSourceDateTime(item.transaction_date), item.provider_name, item.azs_number, item.card_number,
    item.vehicle, item.fuel_type, decimalCsv(item.liters),
  ]),
)

const saveCsv = (content, filename) => {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

const periodParams = (filters) => {
  const params = new URLSearchParams({ date_from: filters.date_from, date_to: filters.date_to })
  if (filters.provider_id) params.append('provider_id', filters.provider_id)
  if (filters.fuel_type) params.append('fuel_type', filters.fuel_type)
  return params
}

const readError = async (response, fallback) => {
  const detail = await response.json().catch(() => ({}))
  return new Error(detail.detail || fallback)
}

/* Детализация одной строки отчёта: заправки карты по дням, сумма дня против суточного лимита. */
const CardFillsModal = ({ item, period, onClose }) => {
  const { error: showError } = useToast()
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!item) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setDetail(null)
      try {
        const params = new URLSearchParams({ date_from: period.date_from, date_to: period.date_to, card_number: item.card_number ?? '' })
        if (item.provider_id) params.append('provider_id', String(item.provider_id))
        if (item.fuel_type) params.append('fuel_type', item.fuel_type)
        const response = await authFetch(`${API_URL}/api/v1/reports/fills?${params}`)
        if (!response.ok) throw await readError(response, 'Не удалось загрузить заправки карты')
        const body = await response.json()
        if (!cancelled) setDetail(body)
      } catch (err) {
        if (!err.isUnauthorized) showError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [item, period, showError])

  const days = useMemo(() => {
    const groups = new Map()
    for (const fill of detail?.items || []) {
      const day = (fill.transaction_date || '').slice(0, 10)
      if (!groups.has(day)) groups.set(day, [])
      groups.get(day).push(fill)
    }
    return [...groups.entries()].map(([day, fills]) => ({
      day,
      fills,
      liters: fills.reduce((sum, fill) => sum + fill.liters, 0),
    }))
  }, [detail])

  if (!item) return null
  const limit = item.daily_limit

  return (
    <Modal isOpen={Boolean(item)} onClose={onClose} title={`Заправки: ${item.card_number || 'без карты'}`} size="lg">
      <Modal.Body>
        <p className="tpz-muted tpz-detail__lead">
          {item.provider_name} · {item.fuel_type || 'топливо не указано'} · {formatSourceDate(period.date_from)} — {formatSourceDate(period.date_to)}
          {limit ? ` · суточный лимит ${formatLiters(limit)} л` : ' · суточного лимита в Топазе нет'}
        </p>
        {loading || !detail ? (
          <Skeleton rows={5} columns={4} />
        ) : days.length === 0 ? (
          <p className="tpz-muted">Заправок за период нет.</p>
        ) : (
          <div className="tpz-detail" data-testid="card-fills-detail">
            {detail.truncated ? (
              <p className="tpz-muted">Показаны последние {detail.items.length} из {detail.total} заправок.</p>
            ) : null}
            {days.map(({ day, fills, liters }) => {
              const atLimit = limit && liters >= limit * AT_LIMIT_SHARE
              return (
                <section key={day} className="tpz-detail__day">
                  <header className="tpz-detail__day-head">
                    <span className="tpz-primary">{formatSourceDate(day)}</span>
                    <span className="t-numeric">
                      {formatDecimal(liters)} л{limit ? ` из ${formatLiters(limit)}` : ''}
                      {' '}· {fills.length} {fills.length === 1 ? 'заправка' : fills.length < 5 ? 'заправки' : 'заправок'}
                    </span>
                    {atLimit ? <span className="tpz-chip" data-tone="warn">Лимит выбран</span> : null}
                  </header>
                  <table className="tpz-detail__table">
                    <tbody>
                      {fills.map((fill) => (
                        <tr key={fill.id}>
                          <td className="t-numeric">{formatSourceDateTime(fill.transaction_date).slice(-5)}</td>
                          <td className="t-numeric">АЗС {fill.azs_number || '—'}</td>
                          <td className="tpz-muted">{fill.vehicle || ''}</td>
                          <td className="t-numeric tpz-detail__liters">{formatDecimal(fill.liters)} л</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )
            })}
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button
          variant="secondary"
          icon={<Icon name="download" size={16} />}
          disabled={!detail?.items?.length}
          onClick={() => saveCsv(detailCsv(detail.items), `zapravki_${item.card_number || 'bez-karty'}_${period.date_from}_${period.date_to}.csv`)}
        >
          Скачать CSV
        </Button>
        <Button variant="primary" onClick={onClose}>Закрыть</Button>
      </Modal.Footer>
    </Modal>
  )
}

const FillsByCardReport = () => {
  const { error: showError } = useToast()
  const [filters, setFilters] = useState(defaultFilters)
  const [report, setReport] = useState(null)
  // Варианты фильтров сохраняем между запросами: при ошибке отчёта они не должны пропадать
  const [options, setOptions] = useState({ providers: [], fuel_types: [] })
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [selected, setSelected] = useState(null)
  const debouncedSearch = useDebounce(filters.search, 400)
  const providers = options.providers

  useEffect(() => {
    if (!filters.date_from || !filters.date_to) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const params = periodParams(filters)
        if (debouncedSearch.trim()) params.append('search', debouncedSearch.trim())
        if (filters.at_limit_only) params.append('at_limit_only', 'true')
        const response = await authFetch(`${API_URL}/api/v1/reports/fills-by-card?${params}`)
        if (!response.ok) throw await readError(response, 'Не удалось построить отчёт')
        const body = await response.json()
        if (!cancelled) {
          setReport(body)
          setOptions({ providers: body.providers || [], fuel_types: body.fuel_types || [] })
        }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.date_from, filters.date_to, filters.provider_id, filters.fuel_type, filters.at_limit_only, debouncedSearch, showError])

  const setFilter = (field, value) => setFilters((prev) => ({ ...prev, [field]: value }))

  const downloadSummary = () => {
    if (!report?.items?.length) return
    saveCsv(summaryCsv(report.items), `zapravki-po-kartam_${report.date_from}_${report.date_to}.csv`)
  }

  const downloadDetail = async () => {
    if (!report) return
    setExporting(true)
    try {
      const params = periodParams(filters)
      if (debouncedSearch.trim()) params.append('search', debouncedSearch.trim())
      params.append('limit', String(DETAIL_EXPORT_LIMIT))
      const response = await authFetch(`${API_URL}/api/v1/reports/fills?${params}`)
      if (!response.ok) throw await readError(response, 'Не удалось выгрузить заправки')
      const body = await response.json()
      if (body.truncated) showError(`Выгружены последние ${body.items.length} из ${body.total} заправок — сузьте период`)
      saveCsv(detailCsv(body.items), `zapravki-detalno_${body.date_from}_${body.date_to}.csv`)
    } catch (err) {
      if (!err.isUnauthorized) showError(err.message)
    } finally {
      setExporting(false)
    }
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
    item,
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
  const period = useMemo(
    () => ({ date_from: report?.date_from || filters.date_from, date_to: report?.date_to || filters.date_to }),
    [report, filters.date_from, filters.date_to],
  )

  return (
    <div className="tpz-root" data-testid="fills-by-card-report">
      <div className="tpz-header">
        <div>
          <h2 className="tpz-header__title">Заправки по картам</h2>
          <p className="tpz-header__subtitle">
            Заправки на АЗС Топаза по каждой карте и как они соотносятся с её суточным лимитом. Нажмите на строку, чтобы увидеть
            каждую заправку. Данные — транзакции, загруженные в GSM; период до 93 дней.
          </p>
        </div>
        <div className="tpz-header__actions">
          <Button variant="secondary" icon={<Icon name="download" size={16} />} onClick={downloadSummary} disabled={!report?.items?.length}>
            Итоги CSV
          </Button>
          <Button variant="secondary" icon={<Icon name="download" size={16} />} onClick={downloadDetail} loading={exporting} disabled={!report?.items?.length}>
            Все заправки CSV
          </Button>
        </div>
      </div>

      <div className="tpz-filters">
        <Input label="С" type="date" value={filters.date_from} onChange={(e) => setFilter('date_from', e.target.value)}
          error={invalidPeriod ? 'Дата «с» позже даты «по»' : undefined} fullWidth />
        <Input label="По" type="date" value={filters.date_to} onChange={(e) => setFilter('date_to', e.target.value)} fullWidth />
        <Select
          label="Провайдер"
          value={filters.provider_id}
          onChange={(value) => setFilter('provider_id', value || '')}
          options={[{ value: '', label: 'Все АЗС Топаза' }, ...providers.map((p) => ({ value: String(p.id), label: p.name }))]}
          fullWidth
        />
        <Select
          label="Топливо"
          value={filters.fuel_type}
          onChange={(value) => setFilter('fuel_type', value || '')}
          options={[{ value: '', label: 'Все' }, ...options.fuel_types.map((fuel) => ({ value: fuel, label: fuel }))]}
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
          <Table columns={columns} data={rows} striped hoverable compact stickyHeader onRowClick={(row) => setSelected(row.item)} />
        )}
      </div>

      <CardFillsModal item={selected} period={period} onClose={() => setSelected(null)} />
    </div>
  )
}

export default FillsByCardReport
