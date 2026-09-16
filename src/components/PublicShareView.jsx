/**
 * Публичная страница просмотра АЗС по ссылке — без входа в GSM
 */
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Icon from './ui/Icon/Icon'
import './PublicShareView.css'

const API_URL = import.meta.env.VITE_API_URL || ''

const fmtNumber = (value, digits = 0) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return Number(value).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: digits })
}

const fmtLiters = (value) => `${fmtNumber(value, 2)} л`

const fmtDateTime = (value) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
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
    <div className="psv-loading">
      <div className="psv-spinner" />
      <p>Загрузка...</p>
    </div>
  )
}

function SectionError({ message }) {
  return (
    <div className="psv-error">
      <Icon name="alert" />
      <h2>Не удалось загрузить данные</h2>
      <p>{message}</p>
    </div>
  )
}

function EmptyState({ text }) {
  return (
    <div className="psv-empty">
      <Icon name="info" />
      <span>{text}</span>
    </div>
  )
}

function StatCard({ icon, label, value }) {
  return (
    <div className="psv-stat">
      <div className="psv-stat__icon"><Icon name={icon} /></div>
      <div className="psv-stat__value">{value}</div>
      <div className="psv-stat__label">{label}</div>
    </div>
  )
}

function FillBar({ percent }) {
  const value = Math.max(0, Math.min(100, Number(percent) || 0))
  let tone = 'ok'
  if (value >= 95) tone = 'high'
  else if (value < 20) tone = 'low'
  return (
    <div className="psv-bar">
      <div className={`psv-bar__fill psv-bar__fill--${tone}`} style={{ width: `${value}%` }} />
      <span className="psv-bar__label">{fmtNumber(percent, 1)}%</span>
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
        <div className="psv-error">
          <Icon name="alert" />
          <h2>Не удалось открыть ссылку</h2>
          <p>{error}</p>
        </div>
      </div>
    )
  }

  const expiresAt = new Date(info.expires_at)
  const expiresStr = expiresAt.toLocaleDateString('ru-RU', {
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
      <div className="psv-header">
        <div className="psv-station">
          <div className="psv-station__icon">
            <Icon name="tank" />
          </div>
          <div className="psv-station__info">
            <div className="psv-station__code">{info.gas_station_name || info.azs_code}</div>
            <div className="psv-station__provider">{info.provider_name}</div>
            {(info.settlement || info.location) && (
              <div className="psv-station__location">
                {[info.settlement, info.location].filter(Boolean).join(', ')}
              </div>
            )}
          </div>
        </div>
        <div className="psv-expiry">
          <Icon name="clock" />
          <span>Доступ до {expiresStr}</span>
        </div>
      </div>

      <div className="psv-tabs">
        {tabs.map(tab => (
          <button
            key={tab.key}
            className={`psv-tab ${activeTab === tab.key ? 'psv-tab--active' : ''}`}
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
    return <div className="psv-section"><SectionError message={error} /></div>
  }
  if (!data) {
    return <div className="psv-section"><SectionLoading /></div>
  }

  const station = data.stations && data.stations[0]
  if (!station || !station.fuels.length) {
    return <div className="psv-section"><EmptyState text="Нет данных по резервуарам" /></div>
  }

  const activeTanks = (station.tanks || []).filter(tank => tank.is_active)

  return (
    <div className="psv-section">
      <div className="psv-section__title">
        <Icon name="gauge" />
        <span>Остатки топлива</span>
      </div>

      <div className="psv-fuels">
        {station.fuels.map((fuel, index) => (
          <div className="psv-fuel" key={fuel.fuel_type || index}>
            <div className="psv-fuel__head">
              <div className="psv-fuel__name">
                <Icon name="drop" />
                <span>{fuel.fuel_type || 'Топливо'}</span>
              </div>
              <div className="psv-fuel__volume">
                <strong>{fmtLiters(fuel.volume)}</strong>
                {fuel.capacity_liters
                  ? <span> из {fmtNumber(fuel.capacity_liters)} л</span>
                  : null}
              </div>
            </div>
            <FillBar percent={fuel.fill_percent} />
            <div className="psv-fuel__meta">
              <span>Ёмкостей: {fmtNumber(fuel.tanks_count)}</span>
              {fuel.measured_at && <span>Замер: {fmtDateTime(fuel.measured_at)}</span>}
            </div>
          </div>
        ))}
      </div>

      {activeTanks.length > 0 && (
        <>
          <div className="psv-section__title">
            <Icon name="tank" />
            <span>Резервуары</span>
          </div>
          <div className="psv-table-wrap">
            <table className="psv-table">
              <thead>
                <tr>
                  <th>№</th>
                  <th>Топливо</th>
                  <th>Остаток</th>
                  <th>Вместимость</th>
                  <th>Заполнение</th>
                  <th>Последний замер</th>
                </tr>
              </thead>
              <tbody>
                {activeTanks.map(tank => (
                  <tr key={tank.id}>
                    <td>{tank.tank_number ?? '—'}</td>
                    <td>{tank.fuel_type || tank.source_fuel || '—'}</td>
                    <td>{fmtLiters(tank.last_volume)}</td>
                    <td>{tank.capacity_liters ? `${fmtNumber(tank.capacity_liters)} л` : '—'}</td>
                    <td><FillBar percent={tank.fill_percent} /></td>
                    <td>{fmtDateTime(tank.last_measured_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
    return <div className="psv-section"><SectionError message={error} /></div>
  }
  if (!detail || !summary) {
    return <div className="psv-section"><SectionLoading /></div>
  }

  const period = [detail.date_from, detail.date_to]
    .filter(Boolean)
    .map(date => new Date(date).toLocaleDateString('ru-RU'))
    .join(' — ')

  const totals = summary.totals || {}

  return (
    <div className="psv-section">
      <div className="psv-section__title">
        <Icon name="truck" />
        <span>Заправки по картам{period ? ` (${period})` : ''}</span>
      </div>

      <div className="psv-stats">
        <StatCard icon="card" label="Карт" value={fmtNumber(totals.cards)} />
        <StatCard icon="truck" label="Заправок" value={fmtNumber(totals.fills_count)} />
        <StatCard icon="drop" label="Отпущено" value={fmtLiters(totals.liters)} />
      </div>

      {(summary.items || []).length > 0 && (
        <>
          <div className="psv-section__subtitle">Сводка по картам</div>
          <div className="psv-table-wrap">
            <table className="psv-table">
              <thead>
                <tr>
                  <th>Карта</th>
                  <th>Топливо</th>
                  <th>Заправок</th>
                  <th>Литров</th>
                  <th>Последняя заправка</th>
                </tr>
              </thead>
              <tbody>
                {summary.items.map((item, index) => (
                  <tr key={`${item.card_number}-${item.fuel_type}-${index}`}>
                    <td>{item.card_number || '—'}</td>
                    <td>{item.fuel_type || '—'}</td>
                    <td>{fmtNumber(item.fills_count)}</td>
                    <td>{fmtLiters(item.liters)}</td>
                    <td>{fmtDateTime(item.last_fill)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {(detail.items || []).length > 0 ? (
        <>
          <div className="psv-section__subtitle">
            Детализация
            {detail.truncated && <span className="psv-note"> — показаны последние {detail.items.length} из {fmtNumber(detail.total)}</span>}
          </div>
          <div className="psv-table-wrap">
            <table className="psv-table">
              <thead>
                <tr>
                  <th>Дата и время</th>
                  <th>Карта</th>
                  <th>Транспорт</th>
                  <th>Топливо</th>
                  <th>Литров</th>
                </tr>
              </thead>
              <tbody>
                {detail.items.map(fill => (
                  <tr key={fill.id}>
                    <td>{fmtDateTime(fill.transaction_date)}</td>
                    <td>{fill.card_number || '—'}</td>
                    <td>{fill.vehicle || '—'}</td>
                    <td>{fill.fuel_type || '—'}</td>
                    <td>{fmtLiters(fill.liters)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <EmptyState text="За период заправок не было" />
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
    return <div className="psv-section"><SectionError message={error} /></div>
  }
  if (!data) {
    return <div className="psv-section"><SectionLoading /></div>
  }

  if (!data.items || !data.items.length) {
    return <div className="psv-section"><EmptyState text="Лимиты карт не найдены" /></div>
  }

  const stats = data.stats || {}

  return (
    <div className="psv-section">
      <div className="psv-section__title">
        <Icon name="card" />
        <span>Лимиты топливных карт</span>
      </div>

      <div className="psv-stats">
        <StatCard icon="card" label="Карт с лимитами" value={fmtNumber(stats.enabled)} />
        <StatCard icon="alert" label="Выбрали лимит" value={fmtNumber(stats.exhausted)} />
        <StatCard icon="info" label="Близко к лимиту" value={fmtNumber(stats.near_limit)} />
      </div>

      <div className="psv-table-wrap">
        <table className="psv-table">
          <thead>
            <tr>
              <th>Карта</th>
              <th>Название</th>
              <th>Топливо</th>
              <th>Лимит</th>
              <th>Израсходовано</th>
              <th>Остаток</th>
              <th>Использование</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map(card => (
              <tr key={card.id} className={!card.card_enabled ? 'psv-row--muted' : ''}>
                <td>{card.card_code || '—'}</td>
                <td>{card.card_name || '—'}</td>
                <td>{card.fuel_type || '—'}</td>
                <td>{card.limit_liters != null ? `${fmtNumber(card.limit_liters, 1)} л` : '—'}</td>
                <td>{card.used_liters != null ? `${fmtNumber(card.used_liters, 1)} л` : '—'}</td>
                <td>{card.remaining_liters != null ? `${fmtNumber(card.remaining_liters, 1)} л` : '—'}</td>
                <td><FillBar percent={card.used_percent} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.total > data.items.length && (
        <div className="psv-note">
          Показаны первые {data.items.length} из {fmtNumber(data.total)} карт
        </div>
      )}
    </div>
  )
}
