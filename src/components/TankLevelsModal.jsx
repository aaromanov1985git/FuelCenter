import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Modal } from './ui'
import Icon from './ui/Icon'
import { authFetch } from '../utils/api'
import { useToast } from './ToastContainer'
import { fillTone, formatAge, formatDecimal, formatLiters, formatSourceDateTime } from '../utils/topazFormat'
import './TankLevelsModal.css'

const API_URL = import.meta.env.VITE_API_URL || ''

// «Следить за наливом»: опрос уровнемера каждые 15 секунд, не дольше двух часов
export const WATCH_INTERVAL_MS = 15 * 1000
const WATCH_MAX_MS = 2 * 60 * 60 * 1000

const TONE_LABELS = { ok: 'норма', warn: 'низкий уровень', low: 'критический уровень', neutral: 'вместимость не задана' }

const hasVolume = (tank) => tank.last_volume !== null && tank.last_volume !== undefined

const percentOf = (volume, capacity) => (capacity && volume !== null && volume !== undefined
  ? Math.max(0, Math.min(100, (volume / capacity) * 100))
  : null)

const formatSigned = (value, unit) => {
  if (value === null || value === undefined) return '—'
  const sign = value > 0.5 ? '+' : value < -0.5 ? '−' : ''
  return `${sign}${formatLiters(Math.abs(value))} ${unit}`
}

const formatDuration = (ms) => {
  const total = Math.max(0, Math.round(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  return hours ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}

/* «17.09.2026 11:59» → «11:59 · только что» */
const measuredText = (tank) => {
  if (!tank.last_measured_at) return '—'
  const full = formatSourceDateTime(tank.last_measured_at)
  return `${full.slice(-5)} · ${formatAge(tank.age_minutes)}`
}

/* Сводка по набору ёмкостей: общий объём, вместимость, масса и приход с начала слежения */
const summarize = (tanks, baseline) => {
  const measured = tanks.filter(hasVolume)
  const volume = measured.reduce((sum, t) => sum + t.last_volume, 0)
  const capacities = tanks.map((t) => t.capacity_liters)
  const capacity = capacities.length && capacities.every(Boolean) ? capacities.reduce((a, b) => a + b, 0) : null
  const withBase = measured.filter((t) => baseline?.[t.id])
  const arrived = withBase.length ? withBase.reduce((sum, t) => sum + (t.last_volume - baseline[t.id].volume), 0) : null
  return {
    volume: measured.length ? volume : null,
    capacity,
    percent: percentOf(measured.length ? volume : null, capacity),
    free: capacity !== null && measured.length ? Math.max(0, capacity - volume) : null,
    arrived,
  }
}

/* Ёмкость как в «Мониторе емкостей»: заливка по доле от вместимости, цвет — по уровню. */
export const TankGauge = ({ volume, capacity, label, size = 'md' }) => {
  const width = size === 'lg' ? 112 : 88
  const height = size === 'lg' ? 176 : 132
  const pad = 5
  const percent = percentOf(volume, capacity)
  const tone = fillTone(percent)
  const innerHeight = height - pad * 2
  const fillHeight = percent === null ? 0 : Math.max(percent > 0 ? 3 : 0, (innerHeight * percent) / 100)
  const fill = { ok: 'var(--green)', warn: 'var(--amber)', low: 'var(--red)', neutral: 'var(--border-strong)' }[tone]

  return (
    <svg
      className="tlm-gauge"
      data-size={size}
      data-tone={tone}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${label}: ${percent === null ? 'заполнение неизвестно' : `заполнено на ${Math.round(percent)}%, ${TONE_LABELS[tone]}`}`}
    >
      <rect
        x={1} y={1} width={width - 2} height={height - 2} rx={12}
        style={{ fill: 'var(--surface-2)', stroke: 'var(--border-strong)', strokeWidth: 1.5 }}
      />
      {fillHeight > 0 ? (
        <rect
          className="tlm-gauge__fill"
          x={pad} y={height - pad - fillHeight} width={width - pad * 2} height={fillHeight} rx={8}
          style={{ fill }}
        />
      ) : null}
      {[25, 50, 75].map((mark) => {
        const y = height - pad - (innerHeight * mark) / 100
        return (
          <g key={mark}>
            <line x1={width - pad - 14} x2={width - pad - 2} y1={y} y2={y} style={{ stroke: 'var(--text-1)', strokeWidth: 1, opacity: 0.35 }} />
          </g>
        )
      })}
      <text
        x={width / 2} y={height / 2 + 7} textAnchor="middle"
        style={{ fill: 'var(--text-1)', fontSize: size === 'lg' ? 22 : 18, fontWeight: 700, paintOrder: 'stroke', stroke: 'var(--surface)', strokeWidth: 3, strokeLinejoin: 'round' }}
      >
        {percent === null ? '—' : `${Math.round(percent)}%`}
      </text>
    </svg>
  )
}

const LevelBar = ({ percent, label }) => {
  const tone = fillTone(percent)
  return (
    <div className="tlm-bar" data-tone={tone} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined} aria-label={label}>
      <span className="tlm-bar__fill" style={{ width: `${percent === null ? 0 : percent}%` }} />
    </div>
  )
}

const FuelChip = ({ fuel }) => (
  <span className="tlm-fuel" data-family={/дт|диз/i.test(fuel || '') ? 'diesel' : 'petrol'}>{fuel || 'Топливо'}</span>
)

const Reading = ({ label, value, strong = false }) => (
  <div className="tlm-row" data-strong={strong ? 'true' : undefined}>
    <dt>{label}</dt>
    <dd className="t-numeric">{value}</dd>
  </div>
)

const ArrivalLine = ({ arrived, watch, since, now }) => {
  if (arrived === null || arrived === undefined) return null
  const elapsedMs = since ? (watch.active ? now : watch.stoppedAt || now) - since : 0
  const perMinute = elapsedMs > 60 * 1000 ? arrived / (elapsedMs / 60000) : null
  return (
    <div className="tlm-arrival" data-testid="tank-arrival" data-positive={arrived > 0.5 ? 'true' : 'false'}>
      <span className="tlm-arrival__label">{watch.active ? 'Пришло' : 'Итог налива'}</span>
      <span className="tlm-arrival__value t-numeric">{formatSigned(arrived, 'л')}</span>
      <span className="tlm-arrival__meta t-numeric">
        {formatDuration(elapsedMs)}{perMinute !== null ? ` · ${formatLiters(perMinute)} л/мин` : ''}
      </span>
    </div>
  )
}

/* Отдельная ёмкость */
const TankCard = ({ tank, watch, now }) => {
  const base = watch.baseline[tank.id]
  const free = tank.capacity_liters && hasVolume(tank) ? Math.max(0, tank.capacity_liters - tank.last_volume) : null
  return (
    <article className="tlm-card" data-testid="tank-level" data-inactive={tank.is_active ? undefined : 'true'}>
      <header className="tlm-card__head">
        <FuelChip fuel={tank.fuel_type} />
        <span className="tlm-card__name">{tank.source_name || `Ёмкость ${tank.tank_number}`}</span>
        {!tank.is_active ? <span className="tlm-card__tag">не учитывается</span> : null}
      </header>
      <div className="tlm-card__body">
        <TankGauge volume={tank.last_volume} capacity={tank.capacity_liters} label={tank.fuel_type || 'Топливо'} />
        <dl className="tlm-readings">
          <Reading label="Объём, л" value={formatDecimal(tank.last_volume)} strong />
          <Reading label="Свободно, л" value={free === null ? '—' : formatLiters(free)} />
          <Reading label="Масса, кг" value={formatDecimal(tank.last_mass)} />
          <Reading label="Плотность" value={formatDecimal(tank.last_density)} />
          <Reading label="Температура, °C" value={formatDecimal(tank.last_temperature)} />
          <Reading label="Вода" value={formatDecimal(tank.last_water)} />
          <Reading label="Вместимость, л" value={tank.capacity_liters ? formatLiters(tank.capacity_liters) : 'не задана'} />
          <Reading label="Замер" value={measuredText(tank)} />
        </dl>
      </div>
      {base ? <ArrivalLine arrived={hasVolume(tank) ? tank.last_volume - base.volume : null} watch={watch} since={base.at} now={now} /> : null}
    </article>
  )
}

/* Составной резервуар: ёмкости одной группы перелива показываются общим объёмом */
const GroupCard = ({ group, tanks, watch, now }) => {
  const total = summarize(tanks, watch.baseline)
  const since = Math.min(...tanks.map((t) => watch.baseline[t.id]?.at).filter(Boolean))
  const fuels = [...new Set(tanks.map((t) => t.fuel_type).filter(Boolean))]
  return (
    <article className="tlm-card tlm-card--group" data-testid="tank-group">
      <header className="tlm-card__head">
        {fuels.map((fuel) => <FuelChip key={fuel} fuel={fuel} />)}
        <span className="tlm-card__name">Составной резервуар · перелив {group}</span>
      </header>
      <div className="tlm-card__body">
        <TankGauge volume={total.volume} capacity={total.capacity} label={`Перелив ${group}`} size="lg" />
        <div className="tlm-group">
          <dl className="tlm-readings">
            <Reading label="Общий объём, л" value={formatDecimal(total.volume)} strong />
            <Reading label="Свободно, л" value={total.free === null ? '—' : formatLiters(total.free)} />
            <Reading label="Вместимость, л" value={total.capacity ? formatLiters(total.capacity) : 'не задана'} />
          </dl>
          <ul className="tlm-members">
            {tanks.map((tank) => {
              const percent = percentOf(tank.last_volume, tank.capacity_liters)
              return (
                <li key={tank.id} className="tlm-member" data-testid="tank-level">
                  <div className="tlm-member__head">
                    <span className="tlm-member__name">{tank.source_name || `Ёмкость ${tank.tank_number}`}</span>
                    <span className="tlm-member__volume t-numeric">{formatDecimal(tank.last_volume)} л</span>
                  </div>
                  <LevelBar percent={percent} label={`${tank.source_name || 'Ёмкость'}: заполнение`} />
                  <div className="tlm-member__meta t-numeric">
                    <span>{percent === null ? '—' : `${Math.round(percent)}%`}</span>
                    <span>{formatDecimal(tank.last_density)} кг/м³</span>
                    <span>{formatDecimal(tank.last_temperature)} °C</span>
                    <span>{measuredText(tank)}</span>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
      {total.arrived !== null ? <ArrivalLine arrived={total.arrived} watch={watch} since={since} now={now} /> : null}
    </article>
  )
}

const TankLevelsModal = ({ station, isOpen, onClose, onStationUpdate }) => {
  const { error: showError } = useToast()
  const [loading, setLoading] = useState(false)
  const [readAt, setReadAt] = useState(null)
  const [devices, setDevices] = useState([])
  const [error, setError] = useState(null)
  const [showUnused, setShowUnused] = useState(false)
  const [watch, setWatch] = useState({ active: false, baseline: {}, startedAt: null, stoppedAt: null })
  const [now, setNow] = useState(() => Date.now())
  // Номер завершённого опроса: по нему слежение назначает следующий
  const [readSeq, setReadSeq] = useState(0)
  const watchRef = useRef(watch)
  watchRef.current = watch
  const loadingRef = useRef(false)

  const liveAvailable = Boolean(station?.live_available)
  const allTanks = station?.tanks || []
  const hiddenCount = allTanks.filter((tank) => !tank.is_active).length

  const layout = useMemo(() => {
    const visible = allTanks.filter((tank) => showUnused || tank.is_active)
    const groups = new Map()
    const singles = []
    visible.forEach((tank) => {
      if (tank.is_active && tank.overflow_group) {
        if (!groups.has(tank.overflow_group)) groups.set(tank.overflow_group, [])
        groups.get(tank.overflow_group).push(tank)
      } else {
        singles.push(tank)
      }
    })
    const items = []
    groups.forEach((tanks, group) => {
      if (tanks.length > 1) items.push({ kind: 'group', group, tanks, order: Math.min(...tanks.map((t) => t.tank_number || 0)) })
      else singles.push(tanks[0])
    })
    singles.forEach((tank) => items.push({ kind: 'tank', tank, order: tank.tank_number || 0 }))
    items.sort((a, b) => a.order - b.order)
    return items
  }, [allTanks, showUnused])

  const fuels = useMemo(() => {
    const byFuel = new Map()
    allTanks.filter((tank) => tank.is_active).forEach((tank) => {
      const key = tank.fuel_type || 'Топливо'
      if (!byFuel.has(key)) byFuel.set(key, [])
      byFuel.get(key).push(tank)
    })
    return [...byFuel.entries()].map(([fuel, tanks]) => ({ fuel, count: tanks.length, ...summarize(tanks, watch.baseline) }))
  }, [allTanks, watch.baseline])

  // Сколько карточек у каждого вида топлива: составной резервуар — одна карточка
  const cardsPerFuel = useMemo(() => {
    const counts = new Map()
    layout.forEach((item) => {
      const tanks = item.kind === 'group' ? item.tanks : [item.tank]
      new Set(tanks.filter((t) => t.is_active).map((t) => t.fuel_type || 'Топливо'))
        .forEach((fuel) => counts.set(fuel, (counts.get(fuel) || 0) + 1))
    })
    return counts
  }, [layout])

  const readNow = useCallback(async ({ quiet = false } = {}) => {
    if (!station || loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    try {
      const params = new URLSearchParams({ provider_id: String(station.provider_id), azs_code: station.azs_code })
      const response = await authFetch(`${API_URL}/api/v1/tanks/live?${params}`, { method: 'POST' })
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}))
        throw new Error(detail.detail || 'Не удалось прочитать уровнемеры')
      }
      const data = await response.json()
      const failed = data.devices.filter((d) => d.status === 'failed')
      const allFailed = data.devices.length > 0 && failed.length === data.devices.length
      setDevices(data.devices)
      if (data.station) {
        onStationUpdate?.(data.station)
        if (watchRef.current.active && !allFailed) {
          // База налива — первое удачное чтение после включения слежения
          setWatch((prev) => {
            const baseline = { ...prev.baseline }
            data.station.tanks.forEach((tank) => {
              if (!baseline[tank.id] && hasVolume(tank)) {
                baseline[tank.id] = { volume: tank.last_volume, mass: tank.last_mass, at: Date.now() }
              }
            })
            return { ...prev, baseline }
          })
        }
      }
      if (allFailed) {
        const message = failed.map((d) => d.error).filter(Boolean)[0] || 'Уровнемеры не ответили'
        setError(message)
        if (!quiet) showError(message)
      } else {
        setError(null)
        setReadAt(Date.now())
      }
    } catch (err) {
      setError(err.message)
      if (!err.isUnauthorized && !quiet) showError(err.message)
    } finally {
      loadingRef.current = false
      setLoading(false)
      setNow(Date.now())
      setReadSeq((value) => value + 1)
    }
  }, [station, onStationUpdate, showError])

  const stopWatch = useCallback(() => {
    setWatch((prev) => (prev.active ? { ...prev, active: false, stoppedAt: Date.now() } : prev))
  }, [])

  const startWatch = () => {
    const next = { active: true, baseline: {}, startedAt: Date.now(), stoppedAt: null }
    setWatch(next)
    watchRef.current = next
    readNow()
  }

  // Слежение: следующий опрос — через интервал после завершения предыдущего
  useEffect(() => {
    if (!isOpen || !watch.active) return undefined
    const timer = setTimeout(() => {
      if (Date.now() - watch.startedAt > WATCH_MAX_MS) {
        stopWatch()
        return
      }
      if (!document.hidden) readNow({ quiet: true })
      else setReadSeq((value) => value + 1)
    }, WATCH_INTERVAL_MS)
    return () => clearTimeout(timer)
  }, [isOpen, watch.active, watch.startedAt, readSeq, readNow, stopWatch])

  // Часы для «N с назад» и длительности налива
  useEffect(() => {
    if (!isOpen) return undefined
    const ticker = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(ticker)
  }, [isOpen])

  // Открыли окно — сразу свежие показания, закрыли — слежение останавливается
  useEffect(() => {
    if (!isOpen) {
      setWatch({ active: false, baseline: {}, startedAt: null, stoppedAt: null })
      setReadAt(null)
      setDevices([])
      setError(null)
      return
    }
    if (liveAvailable) readNow({ quiet: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, station?.azs_code, station?.provider_id])

  if (!isOpen || !station) return null

  const codes = (station.azs_codes?.length ? station.azs_codes : [station.azs_code]).join(' · ')
  const failed = devices.filter((d) => d.status === 'failed')
  const secondsAgo = readAt ? Math.round((now - readAt) / 1000) : null
  const watching = watch.active || watch.stoppedAt

  let status
  let tone = 'ok'
  if (!liveAvailable) {
    status = 'Опрос по запросу для этой АЗС недоступен — показаны последние замеры из базы Топаза'
    tone = 'muted'
  } else if (loading) {
    status = 'Опрашиваем уровнемеры…'
    tone = 'busy'
  } else if (error) {
    status = error
    tone = 'warn'
  } else if (readAt !== null) {
    status = `Показания получены ${secondsAgo < 5 ? 'только что' : `${secondsAgo} с назад`}`
    if (failed.length) {
      status += ` · нет ответа: ${failed.map((d) => d.azs_code).join(', ')}`
      tone = 'warn'
    }
  } else {
    status = 'Нажмите «Запросить показания»'
    tone = 'muted'
  }

  const close = () => {
    stopWatch()
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={close} title={`Показания уровнемеров — ${codes}`} size="xl" className="tlm">
      <Modal.Body>
        <div className="tlm-toolbar">
          <div className="tlm-toolbar__actions">
            <Button
              variant="secondary"
              icon={<Icon name="refresh" size={16} />}
              onClick={() => readNow()}
              loading={loading}
              disabled={!liveAvailable}
            >
              Запросить показания
            </Button>
            {watch.active ? (
              <Button variant="primary" icon={<Icon name="pause" size={16} />} onClick={stopWatch} aria-pressed="true">
                Остановить слежение
              </Button>
            ) : (
              <Button
                variant="secondary"
                icon={<Icon name="play" size={16} />}
                onClick={startWatch}
                disabled={!liveAvailable}
                aria-pressed="false"
                title={`Опрашивать уровнемеры каждые ${WATCH_INTERVAL_MS / 1000} с и считать, сколько пришло топлива`}
              >
                Следить за наливом
              </Button>
            )}
          </div>
          <div
            className="tlm-status"
            data-tone={tone}
            data-testid="levels-status"
            title={failed.map((d) => `${d.azs_code}: ${d.error}`).join('\n') || undefined}
          >
            {watch.active || tone === 'busy' ? <span className="tlm-status__dot" data-tone={tone} aria-hidden="true" /> : null}
            {status}
          </div>
        </div>

        {watching ? (
          <div className="tlm-watch" data-active={watch.active ? 'true' : 'false'} data-testid="watch-summary">
            <Icon name={watch.active ? 'play' : 'pause'} size={16} />
            <span className="tlm-watch__title">
              {watch.active
                ? `Слежение за наливом · ${formatDuration(now - watch.startedAt)}`
                : `Слежение остановлено · ${formatDuration(watch.stoppedAt - watch.startedAt)}`}
            </span>
            {Object.keys(watch.baseline).length === 0 ? <span className="tlm-watch__hint">ждём первое показание…</span> : null}
          </div>
        ) : null}

        {/* Итог по топливу нужен, когда топливо разнесено по нескольким карточкам; иначе он повторяет карточку */}
        {fuels.some((item) => (cardsPerFuel.get(item.fuel) || 0) > 1) ? (
          <section className="tlm-summary" aria-label="Итого по видам топлива">
            {fuels.map((item) => (
              <div key={item.fuel} className="tlm-total" data-testid="fuel-total">
                <div className="tlm-total__head">
                  <FuelChip fuel={item.fuel} />
                  <span className="tlm-total__count">{item.count > 1 ? `${item.count} ёмкости` : '1 ёмкость'}</span>
                </div>
                <div className="tlm-total__volume t-numeric">{formatLiters(item.volume)} л</div>
                <LevelBar percent={item.percent} label={`${item.fuel}: заполнение`} />
                <div className="tlm-total__meta t-numeric">
                  <span>{item.capacity ? `${Math.round(item.percent)}% из ${formatLiters(item.capacity)} л` : 'вместимость не задана'}</span>
                  {item.free !== null ? <span>свободно {formatLiters(item.free)} л</span> : null}
                </div>
                {item.arrived !== null ? (
                  <div className="tlm-total__arrival t-numeric" data-positive={item.arrived > 0.5 ? 'true' : 'false'}>
                    {watch.active ? 'пришло' : 'итог налива'} {formatSigned(item.arrived, 'л')}
                  </div>
                ) : null}
              </div>
            ))}
          </section>
        ) : null}

        {layout.length === 0 ? (
          <p className="tlm-empty">Нет ёмкостей для показа.</p>
        ) : (
          <div className="tlm-grid">
            {layout.map((item) => (item.kind === 'group'
              ? <GroupCard key={`g-${item.group}`} group={item.group} tanks={item.tanks} watch={watch} now={now} />
              : <TankCard key={item.tank.id} tank={item.tank} watch={watch} now={now} />))}
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <div className="tlm-legend" aria-label="Цвет уровня">
          <span data-tone="ok">от 35%</span>
          <span data-tone="warn">20–35%</span>
          <span data-tone="low">меньше 20%</span>
        </div>
        {hiddenCount ? (
          <label className="tlm-unused">
            <input type="checkbox" checked={showUnused} onChange={(e) => setShowUnused(e.target.checked)} />
            Неиспользуемые ёмкости ({hiddenCount})
          </label>
        ) : null}
        <Button variant="secondary" onClick={close}>Закрыть</Button>
      </Modal.Footer>
    </Modal>
  )
}

export default TankLevelsModal
