import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Modal } from './ui'
import Icon from './ui/Icon'
import { authFetch } from '../utils/api'
import { useToast } from './ToastContainer'
import { formatAge, formatDecimal, formatLiters, formatSourceDateTime } from '../utils/topazFormat'
import './TankLevelsModal.css'

const API_URL = import.meta.env.VITE_API_URL || ''

// «Следить за наливом»: опрос уровнемера каждые 15 секунд, не дольше двух часов
export const WATCH_INTERVAL_MS = 15 * 1000
const WATCH_MAX_MS = 2 * 60 * 60 * 1000

const fuelFamily = (fuel) => (/дт|диз/i.test(fuel || '') ? 'diesel' : 'petrol')

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

/* Ёмкость как в «Мониторе емкостей»: заливка по доле от вместимости, риски по четвертям. */
export const TankGauge = ({ tank }) => {
  const width = 96
  const height = 150
  const pad = 6
  const capacity = tank.capacity_liters
  const percent = capacity && tank.last_volume !== null && tank.last_volume !== undefined
    ? Math.max(0, Math.min(100, (tank.last_volume / capacity) * 100))
    : null
  const innerHeight = height - pad * 2
  const fillHeight = percent === null ? 0 : (innerHeight * percent) / 100
  const family = fuelFamily(tank.fuel_type)
  const low = percent !== null && percent < 10
  const fillColor = low ? 'var(--red)' : family === 'diesel' ? 'var(--amber)' : 'var(--accent)'

  return (
    <svg
      className="tlm-gauge"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${tank.fuel_type || 'Топливо'}: ${percent === null ? 'заполнение неизвестно' : `заполнено на ${Math.round(percent)}%`}`}
    >
      <rect
        x={1} y={1} width={width - 2} height={height - 2} rx={10}
        style={{ fill: 'var(--surface-2)', stroke: 'var(--border-strong)', strokeWidth: 2 }}
      />
      {fillHeight > 0 ? (
        <rect
          x={pad} y={height - pad - fillHeight} width={width - pad * 2} height={fillHeight} rx={6}
          style={{ fill: fillColor, opacity: 0.85 }}
        />
      ) : null}
      {[25, 50, 75].map((mark) => {
        const y = height - pad - (innerHeight * mark) / 100
        return (
          <line key={mark} x1={width - pad - 12} x2={width - pad} y1={y} y2={y} style={{ stroke: 'var(--text-3)', strokeWidth: 1 }} />
        )
      })}
      <text
        x={width / 2} y={height / 2 + 6} textAnchor="middle"
        style={{ fill: 'var(--text-1)', fontSize: 18, fontWeight: 700 }}
      >
        {percent === null ? '—' : `${Math.round(percent)}%`}
      </text>
    </svg>
  )
}

const ReadingRow = ({ label, value }) => (
  <div className="tlm-row">
    <dt>{label}</dt>
    <dd className="t-numeric">{value}</dd>
  </div>
)

const TankPanel = ({ tank, watch, now }) => {
  const base = watch?.baseline?.[tank.id]
  const arrived = base && tank.last_volume !== null && tank.last_volume !== undefined ? tank.last_volume - base.volume : null
  const arrivedMass = base && base.mass !== null && tank.last_mass !== null && tank.last_mass !== undefined
    ? tank.last_mass - base.mass
    : null
  const elapsedMs = base ? (watch.active ? now : watch.stoppedAt || now) - base.at : 0
  const perMinute = arrived !== null && elapsedMs > 60 * 1000 ? arrived / (elapsedMs / 60000) : null

  return (
    <article className="tlm-tank" data-testid="tank-level">
      <header className="tlm-tank__head">
        <span className="tlm-tank__fuel" data-family={fuelFamily(tank.fuel_type)}>{tank.fuel_type || 'Вид не определён'}</span>
        <span className="tlm-tank__name">{tank.source_name || `Ёмкость ${tank.tank_number}`}</span>
      </header>
      <div className="tlm-tank__body">
        <TankGauge tank={tank} />
        <dl className="tlm-readings">
          <ReadingRow label="Объём, л" value={formatDecimal(tank.last_volume)} />
          <ReadingRow label="Масса, кг" value={formatDecimal(tank.last_mass)} />
          <ReadingRow label="Плотность, кг/м³" value={formatDecimal(tank.last_density)} />
          <ReadingRow label="Температура, °C" value={formatDecimal(tank.last_temperature)} />
          <ReadingRow label="Подтоварная вода" value={formatDecimal(tank.last_water)} />
          <ReadingRow label="Вместимость, л" value={tank.capacity_liters ? formatLiters(tank.capacity_liters) : 'не задана'} />
          <ReadingRow label="Замер" value={tank.last_measured_at ? `${formatSourceDateTime(tank.last_measured_at)} (${formatAge(tank.age_minutes)})` : '—'} />
        </dl>
      </div>
      {base ? (
        <div className="tlm-arrival" data-testid="tank-arrival" data-positive={arrived > 0.5 ? 'true' : 'false'}>
          <div className="tlm-arrival__main">
            <span className="tlm-arrival__label">{watch.active ? 'Пришло с начала слежения' : 'Итог налива'}</span>
            <span className="tlm-arrival__value t-numeric">{formatSigned(arrived, 'л')}</span>
          </div>
          <div className="tlm-arrival__meta t-numeric">
            <span>было {formatLiters(base.volume)} л</span>
            {arrivedMass !== null ? <span>{formatSigned(arrivedMass, 'кг')}</span> : null}
            <span>{formatDuration(elapsedMs)}</span>
            {perMinute !== null ? <span>{formatLiters(perMinute)} л/мин</span> : null}
          </div>
        </div>
      ) : null}
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
  const tanks = useMemo(
    () => (station?.tanks || []).filter((tank) => showUnused || tank.is_active),
    [station, showUnused],
  )
  const hiddenCount = (station?.tanks || []).filter((tank) => !tank.is_active).length

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
              if (!baseline[tank.id] && tank.last_volume !== null && tank.last_volume !== undefined) {
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
    setWatch({ active: true, baseline: {}, startedAt: Date.now(), stoppedAt: null })
    watchRef.current = { active: true, baseline: {}, startedAt: Date.now(), stoppedAt: null }
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

  let status
  if (!liveAvailable) {
    status = 'На этой АЗС опрос уровнемеров по запросу пока недоступен — показаны последние замеры из базы Топаза.'
  } else if (loading && !readAt) {
    status = 'Опрашиваем уровнемеры…'
  } else if (error) {
    status = error
  } else if (readAt !== null) {
    status = `Показания получены ${secondsAgo < 5 ? 'только что' : `${secondsAgo} с назад`}`
    if (failed.length) status += ` · нет ответа: ${failed.map((d) => d.azs_code).join(', ')}`
  } else {
    status = 'Нажмите «Запросить показания»'
  }

  const totals = {}
  if (Object.keys(watch.baseline).length) {
    tanks.forEach((tank) => {
      const base = watch.baseline[tank.id]
      if (!base || !tank.is_active || tank.last_volume === null || tank.last_volume === undefined) return
      const key = tank.fuel_type || 'Топливо'
      totals[key] = (totals[key] || 0) + (tank.last_volume - base.volume)
    })
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
            data-tone={!liveAvailable ? 'muted' : error || failed.length ? 'warn' : 'ok'}
            data-testid="levels-status"
            title={failed.map((d) => `${d.azs_code}: ${d.error}`).join('\n') || undefined}
          >
            {watch.active ? <span className="tlm-status__dot" aria-hidden="true" /> : null}
            {status}
          </div>
        </div>

        {watch.active || watch.stoppedAt ? (
          <div className="tlm-watch" data-testid="watch-summary">
            <span className="tlm-watch__title">
              {watch.active
                ? `Слежение за наливом · ${formatDuration(now - watch.startedAt)}`
                : `Слежение остановлено · ${formatDuration(watch.stoppedAt - watch.startedAt)}`}
            </span>
            {Object.keys(totals).length ? (
              Object.entries(totals).map(([fuel, value]) => (
                <span key={fuel} className="tlm-watch__total t-numeric">{fuel}: {formatSigned(value, 'л')}</span>
              ))
            ) : (
              <span className="tlm-watch__total">ждём первое показание…</span>
            )}
          </div>
        ) : null}

        {tanks.length === 0 ? (
          <p className="tlm-empty">Нет ёмкостей для показа.</p>
        ) : (
          <div className="tlm-grid">
            {tanks.map((tank) => (
              <TankPanel key={tank.id} tank={tank} watch={watch} now={now} />
            ))}
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        {hiddenCount ? (
          <label className="tlm-unused">
            <input type="checkbox" checked={showUnused} onChange={(e) => setShowUnused(e.target.checked)} />
            Отображать неиспользуемые ёмкости ({hiddenCount})
          </label>
        ) : <span />}
        <Button variant="secondary" onClick={close}>Закрыть</Button>
      </Modal.Footer>
    </Modal>
  )
}

export default TankLevelsModal
