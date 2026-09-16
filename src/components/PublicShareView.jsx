/**
 * Публичная страница просмотра АЗС по ссылке — без входа в GSM.
 * Каркас страницы (шапка, вкладки, карточки топлива) — psv-* на токенах
 * дизайн-системы; таблицы, плитки статистики и шкалы расхода — общие
 * классы TopazLists.css и ui/Table, те же, что на внутренних страницах.
 */
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Table, Skeleton } from './ui'
import Icon from './ui/Icon'
import EmptyState from './EmptyState'
import { fillTone, formatLiters, formatPercent, formatSourceDateTime, formatSourceDate } from '../utils/topazFormat'
import './TopazLists.css'
import './PublicShareView.css'

const API_URL = import.meta.env.VITE_API_URL || ''

const fmtNumber = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return Number(value).toLocaleString('ru-RU')
}

async function fetchPublic(path) {
  const response = await fetch(`${API_URL}${path}`)
  if (!response.ok) {
    let detail = 'Не удалось загрузить данные.'
    try {
      const body = await response.json()
      if (body && body.detail) detail = body.detail
    } catch {
      // тело ответа не JSON — оставляем стандартный текст
    }
    throw new Error(detail)
  }
  return response.json()
}

function SectionLoading() {
  return (
    <div className="tpz-card">
      <div className="tpz-card__state"><Skeleton.Table rows={5} columns={5} /></div>
    </div>
  )
}

function SectionError({ message }) {
  return (
    <div className="tpz-card">
      <div className="tpz-card__state">
        <EmptyState title="Не удалось загрузить данные" message={message} icon={<Icon name="alert" size={32} />} />
      </div>
    </div>
  )
}

function SectionEmpty({ text }) {
  return (
    <div className="tpz-card">
      <div className="tpz-card__state">
        <EmptyState title={text} icon={<Icon name="info" size={32} />} />
      </div>
    </div>
  )
}

/* Шкала заполнения резервуара: тон — состояние остатка, как на внутренних страницах. */
function FillBar({ percent, label }) {
  const value = Math.max(0, Math.min(100, Number(percent) || 0))
  return (
    <div
      className="tpz-bar"
      data-tone={fillTone(percent)}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent ?? undefined}
      aria-label={label}
    >
      <span className="tpz-bar__fill" style={{ width: `${value}%` }} />
    </div>
  )
}

function FillCell({ percent }) {
  return (
    <div className="tpz-usage">
      <div className="tpz-usage__text t-numeric">{formatPercent(percent)}</div>
      <FillBar percent={percent} label="Заполнение" />
    </div>
  )
}

/* Для расхода лимита «много» — плохо: инвертируем шкалу заполнения. */
const usageTone = (percent) =>
  (percent === null || percent === undefined ? 'neutral' : fillTone(100 - percent))

function UsageCell({ card }) {
  if (card.used_percent === null || card.used_percent === undefined) return <span className="tpz-muted">—</span>
  const width = Math.min(100, Math.max(0, card.used_percent))
  return (
    <div className="tpz-usage">
      <div className="tpz-usage__text t-numeric">
        {formatLiters(card.used_liters)} из {formatLiters(card.limit_liters)} л
        <span className="tpz-muted"> · {formatPercent(card.used_percent)}</span>
      </div>
      <div
        className="tpz-bar"
        data-tone={usageTone(card.used_percent)}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={card.used_percent}
        aria-label="Использование лимита"
      >
        <span className="tpz-bar__fill" style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}

export default function PublicShareView() {
  const { token } = useParams()
  const [info, setInfo] = useState(null)
  const [activeTab, setActiveTab] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const response = await fetch(`${API_URL}/api/v1/public/shares/${token}`)
        if (!response.ok) {
          if (response.status === 404) {
            setError('Ссылка не найдена или отозвана.')
          } else if (response.status === 410) {
            setError('Срок действия ссылки истёк.')
          } else {
            setError('Не удалось загрузить данные.')
          }
          setLoading(false)
          return
        }
        const data = await response.json()
        setInfo(data)
        // Первая открытая вкладка по умолчанию
        if (data.show_tanks) setActiveTab('tanks')
        else if (data.show_fills) setActiveTab('fills')
        else if (data.show_limits) setActiveTab('limits')
        setLoading(false)
      } catch (err) {
        setError('Не удалось загрузить данные.')
        setLoading(false)
      }
    }
    fetchInfo()
  }, [token])

  if (loading) {
    return (
      <div className="psv-root">
        <SectionLoading />
      </div>
    )
  }

  if (error) {
    return (
      <div className="psv-root">
        <div className="tpz-card">
          <div className="tpz-card__state">
            <EmptyState
              title="Не удалось открыть ссылку"
              message={error}
              icon={<Icon name="alert" size={32} />}
            />
          </div>
        </div>
      </div>
    )
  }

  const expiresStr = new Date(info.expires_at).toLocaleString('ru-RU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const tabs = []
  if (info.show_tanks) tabs.push({ key: 'tanks', label: 'Резервуары', icon: 'gauge' })
  if (info.show_fills) tabs.push({ key: 'fills', label: 'Заправки', icon: 'truck' })
  if (info.show_limits) tabs.push({ key: 'limits', label: 'Лимиты', icon: 'card' })

  return (
    <div className="psv-root">
      <header className="psv-header">
        <div className="psv-station">
          <div className="psv-station__icon"><Icon name="tank" /></div>
          <div>
            <h1 className="psv-station__name">{info.gas_station_name || info.azs_code}</h1>
            <div className="psv-station__provider">{info.provider_name}</div>
            {(info.settlement || info.location) && (
              <div className="psv-station__location">
                <Icon name="pin" size={14} />
                <span>{[info.settlement, info.location].filter(Boolean).join(', ')}</span>
              </div>
            )}
          </div>
        </div>
        <div className="psv-expiry">
          <Icon name="clock" size={14} />
          <span>Доступ до {expiresStr}</span>
        </div>
      </header>

      <div className="psv-tabs" role="tablist" aria-label="Разделы">
        {tabs.map(tab => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`psv-tab${activeTab === tab.key ? ' is-active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <Icon name={tab.icon} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="psv-content">
        {activeTab === 'tanks' && <ShareTanks token={token} />}
        {activeTab === 'fills' && <ShareFills token={token} />}
        {activeTab === 'limits' && <ShareLimits token={token} />}
      </div>
    </div>
  )
}

function ShareTanks({ token }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchPublic(`/api/v1/public/shares/${token}/tanks`)
      .then(result => { if (!cancelled) setData(result) })
      .catch(err => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [token])

  if (error) {
    return <SectionError message={error} />
  }
  if (!data) {
    return <SectionLoading />
  }

  const station = data.stations && data.stations[0]
  if (!station || !station.fuels.length) {
    return <SectionEmpty text="Нет данных по резервуарам" />
  }

  const activeTanks = (station.tanks || []).filter(tank => tank.is_active)

  const columns = [
    { key: 'number', header: '№' },
    { key: 'fuel', header: 'Топливо' },
    { key: 'volume', header: 'Остаток', align: 'right' },
    { key: 'capacity', header: 'Вместимость', align: 'right' },
    { key: 'fill', header: 'Заполнение' },
    { key: 'measured', header: 'Последний замер' },
  ]

  const rows = activeTanks.map(tank => ({
    id: tank.id,
    number: <span className="t-numeric">{tank.tank_number ?? '—'}</span>,
    fuel: tank.fuel_type || tank.source_fuel || '—',
    volume: <span className="t-numeric">{formatLiters(tank.last_volume)} л</span>,
    capacity: (
      <span className="t-numeric">
        {tank.capacity_liters ? `${fmtNumber(tank.capacity_liters)} л` : '—'}
      </span>
    ),
    fill: <FillCell percent={tank.fill_percent} />,
    measured: <span className="t-numeric">{formatSourceDateTime(tank.last_measured_at)}</span>,
  }))

  return (
    <div className="psv-section">
      <h2 className="psv-section__title"><Icon name="gauge" />Остатки топлива</h2>

      <div className="psv-fuels">
        {station.fuels.map((fuel, index) => (
          <div className="psv-fuel" key={fuel.fuel_type || index}>
            <div className="psv-fuel__head">
              <div className="psv-fuel__name">
                <Icon name="drop" />
                <span>{fuel.fuel_type || 'Топливо'}</span>
              </div>
              <span className="psv-fuel__percent t-numeric">{formatPercent(fuel.fill_percent)}</span>
            </div>
            <div className="psv-fuel__volume t-numeric">
              {formatLiters(fuel.volume)} л
              {fuel.capacity_liters
                ? <span className="psv-fuel__capacity"> из {fmtNumber(fuel.capacity_liters)} л</span>
                : null}
            </div>
            <FillBar percent={fuel.fill_percent} label={`Заполнение: ${fuel.fuel_type || 'топливо'}`} />
            <div className="psv-fuel__meta">
              <span>Ёмкостей: {fmtNumber(fuel.tanks_count)}</span>
              {fuel.measured_at && <span>Замер: {formatSourceDateTime(fuel.measured_at)}</span>}
            </div>
          </div>
        ))}
      </div>

      {activeTanks.length > 0 && (
        <>
          <h2 className="psv-section__title"><Icon name="tank" />Резервуары</h2>
          <div className="tpz-card">
            <Table columns={columns} data={rows} sortable={false} striped hoverable compact />
          </div>
        </>
      )}
    </div>
  )
}

function ShareFills({ token }) {
  const [detail, setDetail] = useState(null)
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetchPublic(`/api/v1/public/shares/${token}/fills-by-card`),
      fetchPublic(`/api/v1/public/shares/${token}/fills?limit=2000`),
    ])
      .then(([summaryData, detailData]) => {
        if (cancelled) return
        setSummary(summaryData)
        setDetail(detailData)
      })
      .catch(err => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [token])

  if (error) {
    return <SectionError message={error} />
  }
  if (!detail || !summary) {
    return <SectionLoading />
  }

  const period = [detail.date_from, detail.date_to]
    .filter(Boolean)
    .map(date => formatSourceDate(date))
    .join(' — ')

  const totals = summary.totals || {}

  const tiles = [
    { label: 'Карт', value: fmtNumber(totals.cards) },
    { label: 'Заправок', value: fmtNumber(totals.fills_count) },
    { label: 'Отпущено, л', value: formatLiters(totals.liters) },
  ]

  const summaryColumns = [
    { key: 'card', header: 'Карта' },
    { key: 'fuel', header: 'Топливо' },
    { key: 'count', header: 'Заправок', align: 'right' },
    { key: 'liters', header: 'Литров', align: 'right' },
    { key: 'last', header: 'Последняя заправка' },
  ]

  const summaryRows = (summary.items || []).map((item, index) => ({
    id: `${item.card_number}-${item.fuel_type}-${index}`,
    card: <span className="t-numeric">{item.card_number || '—'}</span>,
    fuel: item.fuel_type || '—',
    count: <span className="t-numeric">{fmtNumber(item.fills_count)}</span>,
    liters: <span className="t-numeric">{formatLiters(item.liters)} л</span>,
    last: <span className="t-numeric">{formatSourceDateTime(item.last_fill)}</span>,
  }))

  const detailColumns = [
    { key: 'date', header: 'Дата и время' },
    { key: 'card', header: 'Карта' },
    { key: 'vehicle', header: 'Транспорт' },
    { key: 'fuel', header: 'Топливо' },
    { key: 'liters', header: 'Литров', align: 'right' },
  ]

  const detailRows = (detail.items || []).map(fill => ({
    id: fill.id,
    date: <span className="t-numeric">{formatSourceDateTime(fill.transaction_date)}</span>,
    card: <span className="t-numeric">{fill.card_number || '—'}</span>,
    vehicle: fill.vehicle || '—',
    fuel: fill.fuel_type || '—',
    liters: <span className="t-numeric">{formatLiters(fill.liters)} л</span>,
  }))

  return (
    <div className="psv-section">
      <h2 className="psv-section__title">
        <Icon name="truck" />Заправки по картам{period ? ` (${period})` : ''}
      </h2>

      <div className="tpz-stats">
        {tiles.map(tile => (
          <div key={tile.label} className="tpz-stat">
            <div className="t-label">{tile.label}</div>
            <div className="t-value-sm">{tile.value}</div>
          </div>
        ))}
      </div>

      {summaryRows.length > 0 && (
        <>
          <h3 className="t-caption">Сводка по картам</h3>
          <div className="tpz-card">
            <Table columns={summaryColumns} data={summaryRows} sortable={false} striped hoverable compact />
          </div>
        </>
      )}

      {detailRows.length > 0 ? (
        <>
          <h3 className="t-caption">
            Детализация
            {detail.truncated && (
              <span className="psv-note"> — показаны последние {detail.items.length} из {fmtNumber(detail.total)}</span>
            )}
          </h3>
          <div className="tpz-card">
            <Table columns={detailColumns} data={detailRows} sortable={false} striped hoverable compact />
          </div>
        </>
      ) : (
        <SectionEmpty text="За период заправок не было" />
      )}
    </div>
  )
}

function ShareLimits({ token }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchPublic(`/api/v1/public/shares/${token}/card-limits?limit=100`)
      .then(result => { if (!cancelled) setData(result) })
      .catch(err => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [token])

  if (error) {
    return <SectionError message={error} />
  }
  if (!data) {
    return <SectionLoading />
  }

  if (!data.items || !data.items.length) {
    return <SectionEmpty text="Лимиты карт не найдены" />
  }

  const stats = data.stats || {}

  const tiles = [
    { label: 'Карт с лимитами', value: fmtNumber(stats.enabled) },
    { label: 'Выбрали лимит', value: fmtNumber(stats.exhausted), tone: stats.exhausted ? 'warn' : undefined },
    { label: 'Близко к лимиту', value: fmtNumber(stats.near_limit), tone: stats.near_limit ? 'warn' : undefined },
  ]

  const columns = [
    { key: 'card', header: 'Карта' },
    { key: 'fuel', header: 'Топливо' },
    { key: 'limit', header: 'Лимит', align: 'right' },
    { key: 'used', header: 'Израсходовано', align: 'right' },
    { key: 'remaining', header: 'Остаток', align: 'right' },
    { key: 'usage', header: 'Использование' },
  ]

  const rows = data.items.map(card => ({
    id: card.id,
    card: (
      <div>
        <div className="tpz-primary">{card.card_name || '—'}</div>
        <div className="tpz-muted t-numeric">
          {card.card_code || '—'}{card.card_enabled ? '' : ' · выключена'}
        </div>
      </div>
    ),
    fuel: card.fuel_type || '—',
    limit: <span className="t-numeric">{card.limit_liters != null ? `${formatLiters(card.limit_liters)} л` : '—'}</span>,
    used: <span className="t-numeric">{card.used_liters != null ? `${formatLiters(card.used_liters)} л` : '—'}</span>,
    remaining: <span className="t-numeric">{card.remaining_liters != null ? `${formatLiters(card.remaining_liters)} л` : '—'}</span>,
    usage: <UsageCell card={card} />,
  }))

  return (
    <div className="psv-section">
      <h2 className="psv-section__title"><Icon name="card" />Лимиты топливных карт</h2>

      <div className="tpz-stats">
        {tiles.map(tile => (
          <div key={tile.label} className="tpz-stat" data-tone={tile.tone}>
            <div className="t-label">{tile.label}</div>
            <div className="t-value-sm">{tile.value}</div>
          </div>
        ))}
      </div>

      <div className="tpz-card">
        <Table columns={columns} data={rows} sortable={false} striped hoverable compact />
      </div>

      {data.total > data.items.length && (
        <div className="psv-note">
          Показаны первые {data.items.length} из {fmtNumber(data.total)} карт
        </div>
      )}
    </div>
  )
}
