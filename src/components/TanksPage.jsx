import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Input, Modal, Select, Skeleton } from './ui'
import Icon from './ui/Icon'
import EmptyState from './EmptyState'
import { authFetch } from '../utils/api'
import { useToast } from './ToastContainer'
import { useAuth } from '../contexts/AuthContext'
import { logger } from '../utils/logger'
import {
  TANK_WARNING_LABELS,
  fillTone,
  formatAge,
  formatDecimal,
  formatLiters,
  formatPercent,
  formatSourceDateTime,
} from '../utils/topazFormat'
import './TanksPage.css'

const API_URL = import.meta.env.VITE_API_URL || ''

const HISTORY_RANGES = [
  { value: '1', label: 'Сутки' },
  { value: '7', label: 'Неделя' },
  { value: '30', label: '30 дней' },
]

const readError = async (response, fallback) => {
  const detail = await response.json().catch(() => ({}))
  return new Error(detail.detail || fallback)
}

const FillBar = ({ percent, label }) => {
  const tone = fillTone(percent)
  const width = percent === null || percent === undefined ? 0 : Math.min(100, Math.max(0, percent))
  return (
    <div
      className="tnk-bar"
      data-tone={tone}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent ?? undefined}
      aria-label={label}
    >
      <span className="tnk-bar__fill" style={{ width: `${width}%` }} />
    </div>
  )
}

const WarningChips = ({ warnings, skip = [] }) => {
  const visible = (warnings || []).filter((w) => !skip.includes(w))
  if (visible.length === 0) return null
  return (
    <div className="tnk-chips">
      {visible.map((warning) => (
        <span key={warning} className="tnk-chip" data-tone={warning === 'no_capacity' ? 'neutral' : 'warn'}>
          {TANK_WARNING_LABELS[warning] || warning}
        </span>
      ))}
    </div>
  )
}

/* Линия объёма: одна шкала на оси и метки, цвета только из токенов через style. */
const VolumeChart = ({ points, capacity }) => {
  const width = 640
  const height = 220
  const pad = { top: 16, right: 16, bottom: 28, left: 56 }
  const values = points.map((p) => p.volume).filter((v) => v !== null && v !== undefined)
  if (values.length < 2) {
    return <p className="tnk-muted">Для графика нужно хотя бы два замера за период.</p>
  }
  const times = points.map((p) => new Date(p.measured_at).getTime())
  const tMin = Math.min(...times)
  const tMax = Math.max(...times)
  const top = Math.max(...values, capacity || 0)
  const yMax = Math.ceil((top * 1.05) / 1000) * 1000 || 1000
  const x = (t) => pad.left + ((t - tMin) / Math.max(1, tMax - tMin)) * (width - pad.left - pad.right)
  const y = (v) => pad.top + (1 - v / yMax) * (height - pad.top - pad.bottom)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => Math.round(yMax * k))
  const line = points
    .filter((p) => p.volume !== null && p.volume !== undefined)
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(new Date(p.measured_at).getTime()).toFixed(1)},${y(p.volume).toFixed(1)}`)
    .join(' ')
  const last = points[points.length - 1]
  const first = points[0]

  return (
    <div className="tnk-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Объём в ёмкости за период">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} style={{ stroke: 'var(--border)' }} />
            <text x={pad.left - 8} y={y(tick) + 4} textAnchor="end" style={{ fill: 'var(--text-3)', fontSize: 11 }}>
              {formatLiters(tick)}
            </text>
          </g>
        ))}
        {capacity ? (
          <line
            x1={pad.left} x2={width - pad.right} y1={y(capacity)} y2={y(capacity)}
            style={{ stroke: 'var(--text-3)', strokeDasharray: '5 4' }}
          />
        ) : null}
        <path d={line} style={{ fill: 'none', stroke: 'var(--accent)', strokeWidth: 2 }} />
        <circle
          cx={x(new Date(last.measured_at).getTime())}
          cy={y(last.volume ?? 0)}
          r={4}
          style={{ fill: 'var(--accent)', stroke: 'var(--surface)', strokeWidth: 2 }}
        />
        <text x={pad.left} y={height - 8} style={{ fill: 'var(--text-3)', fontSize: 11 }}>
          {formatSourceDateTime(first.measured_at)}
        </text>
        <text x={width - pad.right} y={height - 8} textAnchor="end" style={{ fill: 'var(--text-3)', fontSize: 11 }}>
          {formatSourceDateTime(last.measured_at)}
        </text>
      </svg>
      {capacity ? <p className="tnk-muted">Пунктир — вместимость {formatLiters(capacity)} л</p> : null}
    </div>
  )
}

const TankHistoryModal = ({ tank, onClose }) => {
  const { error: showError } = useToast()
  const [range, setRange] = useState('7')
  const [points, setPoints] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!tank) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const lastMeasured = tank.last_measured_at ? new Date(tank.last_measured_at) : new Date()
        const from = new Date(lastMeasured.getTime() - Number(range) * 24 * 3600 * 1000)
        const params = new URLSearchParams({ date_from: from.toISOString().slice(0, 19), limit: '5000' })
        const response = await authFetch(`${API_URL}/api/v1/tanks/${tank.id}/readings?${params}`)
        if (!response.ok) throw await readError(response, 'Не удалось загрузить историю замеров')
        const data = await response.json()
        if (!cancelled) setPoints(data.items || [])
      } catch (err) {
        if (!err.isUnauthorized) showError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [tank, range, showError])

  if (!tank) return null
  return (
    <Modal isOpen={Boolean(tank)} onClose={onClose} title={`История: ${tank.source_name || `ёмкость ${tank.tank_number}`}`} size="lg">
      <Modal.Body>
        <div className="tnk-history-toolbar">
          <div className="tnk-segmented" role="radiogroup" aria-label="Период">
            {HISTORY_RANGES.map((item) => (
              <button
                key={item.value}
                type="button"
                role="radio"
                aria-checked={range === item.value}
                className={`tnk-segmented__option${range === item.value ? ' is-active' : ''}`}
                onClick={() => setRange(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <span className="tnk-muted">Время — по часам АЗС, до последнего замера</span>
        </div>
        {loading ? <Skeleton rows={4} columns={1} /> : <VolumeChart points={points} capacity={tank.capacity_liters} />}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>Закрыть</Button>
      </Modal.Footer>
    </Modal>
  )
}

const TankSettingsModal = ({ tank, onClose, onSaved }) => {
  const { success, error: showError } = useToast()
  const [form, setForm] = useState({ capacity: '', fuel: '', group: '', active: 'true' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!tank) return
    setForm({
      capacity: tank.capacity_liters ? String(tank.capacity_liters) : '',
      fuel: tank.fuel_type_override || '',
      group: tank.overflow_group || '',
      active: tank.is_active ? 'true' : 'false',
    })
  }, [tank])

  if (!tank) return null

  const capacityValue = form.capacity.trim() === '' ? null : Number(form.capacity.replace(',', '.'))
  const capacityInvalid = capacityValue !== null && (!Number.isFinite(capacityValue) || capacityValue < 0)

  const save = async () => {
    setSaving(true)
    try {
      const response = await authFetch(`${API_URL}/api/v1/tanks/${tank.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          capacity_liters: capacityValue,
          fuel_type_override: form.fuel.trim() || null,
          overflow_group: form.group.trim() || null,
          is_active: form.active === 'true',
        }),
      })
      if (!response.ok) throw await readError(response, 'Не удалось сохранить настройки ёмкости')
      success('Настройки ёмкости сохранены')
      onSaved()
      onClose()
    } catch (err) {
      if (!err.isUnauthorized) showError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={Boolean(tank)} onClose={onClose} title={`Настройки: ${tank.source_name || `ёмкость ${tank.tank_number}`}`} size="md">
      <Modal.Body>
        <div className="tnk-form">
          <Input
            label="Вместимость, л"
            type="text"
            inputMode="decimal"
            value={form.capacity}
            onChange={(e) => setForm((prev) => ({ ...prev, capacity: e.target.value }))}
            error={capacityInvalid ? 'Укажите число литров' : undefined}
            helperText="В Топазе вместимость не заведена — без неё нет процента заполнения"
            fullWidth
          />
          <Input
            label="Вид топлива"
            value={form.fuel}
            onChange={(e) => setForm((prev) => ({ ...prev, fuel: e.target.value }))}
            placeholder={tank.source_fuel ? `По Топазу: ${tank.source_fuel}` : 'Как в Топазе'}
            helperText="Заполните, если в Топазе ёмкость подписана не тем топливом"
            fullWidth
          />
          <Input
            label="Группа перелива"
            value={form.group}
            onChange={(e) => setForm((prev) => ({ ...prev, group: e.target.value }))}
            placeholder="Например, ДТ-1"
            helperText="Ёмкости, соединённые переливом, отмечаются одной группой"
            fullWidth
          />
          <Select
            label="Показывать на странице и учитывать в остатках"
            value={form.active}
            onChange={(value) => setForm((prev) => ({ ...prev, active: value || 'true' }))}
            options={[
              { value: 'true', label: 'Да' },
              { value: 'false', label: 'Нет — скрыть (например, копия чужого уровнемера)' },
            ]}
            helperText="Скрытую ёмкость можно вернуть переключателем «Показать скрытые» над списком АЗС"
            fullWidth
          />
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>Отмена</Button>
        <Button variant="primary" onClick={save} loading={saving} disabled={capacityInvalid}>Сохранить</Button>
      </Modal.Footer>
    </Modal>
  )
}

const stationPlace = (station) => [station.settlement, station.location].filter(Boolean).join(', ')

const fuelAgeHint = (fuel) => {
  if (fuel.estimate_base_at) {
    return `Остаток рассчитан: замер всех ёмкостей в ${formatSourceDateTime(fuel.estimate_base_at).slice(-5)} `
      + `(${formatLiters(fuel.estimate_base_volume)} л) минус отпуск ${formatLiters(fuel.estimate_dispensed)} л. `
      + 'Возраст — когда последний раз загружались заправки.'
  }
  const parts = [`Последний замер уровнемера: ${formatAge(fuel.age_minutes)}`]
  if (fuel.tanks_count > 1) parts.push(`ёмкостей: ${fuel.tanks_count}`)
  return parts.join(', ')
}

const TankRow = ({ tank, isAdmin, onHistory, onSettings }) => (
  <li className={`tnk-tank${tank.is_active ? '' : ' is-inactive'}`} data-testid="tank-row">
    <div className="tnk-tank__head">
      <div className="tnk-tank__name">
        <span>{tank.source_name || `Ёмкость ${tank.tank_number}`}</span>
        <span className="tnk-fuel">{tank.fuel_type || tank.source_fuel || '—'}</span>
        {tank.overflow_group ? <span className="tnk-chip" data-tone="neutral">Перелив {tank.overflow_group}</span> : null}
        {!tank.is_active ? <span className="tnk-chip" data-tone="neutral">Не учитывается</span> : null}
      </div>
      <div className="tnk-tank__volume t-numeric">
        {formatLiters(tank.last_volume)} л
        {tank.fill_percent !== null && tank.fill_percent !== undefined ? (
          <span className="tnk-tank__percent">{formatPercent(tank.fill_percent)}</span>
        ) : null}
      </div>
    </div>
    <FillBar percent={tank.fill_percent} label={`Заполнение ёмкости ${tank.tank_number}`} />
    <div className="tnk-tank__meta">
      <span className="t-numeric">{formatDecimal(tank.last_density)} кг/м³</span>
      <span className="t-numeric">{formatDecimal(tank.last_temperature)} °C</span>
      <span title={formatSourceDateTime(tank.last_measured_at)}>{formatAge(tank.age_minutes)}</span>
      <span className="tnk-tank__actions">
        <button type="button" className="tnk-link" onClick={() => onHistory(tank)}>
          <Icon name="chart" size={14} /> История
        </button>
        {isAdmin ? (
          <button type="button" className="tnk-link" onClick={() => onSettings(tank)}>
            <Icon name="gear" size={14} /> Настроить
          </button>
        ) : null}
      </span>
    </div>
    <WarningChips warnings={tank.warnings} skip={tank.is_active ? [] : ['no_capacity']} />
  </li>
)

const StationCard = ({ station, isAdmin, onHistory, onSettings, onShare }) => {
  const [expanded, setExpanded] = useState(station.fuels.length === 0)
  return (
    <article className="tnk-station" data-testid="tank-station">
      <header className="tnk-station__head">
        <div className="tnk-station__title">
          <div className="tnk-station__name-row">
            <h3 className="tnk-station__code t-numeric">{station.azs_code}</h3>
            <span className="tnk-station__provider">{station.provider_name}</span>
          </div>
          {station.gas_station_name && station.gas_station_name !== station.azs_code ? (
            <div className="tnk-station__label">{station.gas_station_name}</div>
          ) : null}
          {stationPlace(station) ? (
            <div className="tnk-station__place" title={[station.region, station.settlement, station.location].filter(Boolean).join(', ')}>
              <Icon name="pin" size={14} />
              <span>{stationPlace(station)}</span>
            </div>
          ) : null}
        </div>
        {isAdmin && (
          <IconButton icon="share" title="Поделиться" onClick={onShare} />
        )}
      </header>

      {station.fuels.length === 0 ? (
        <p className="tnk-muted">Ни одна ёмкость не учитывается в остатках.</p>
      ) : (
        <ul className="tnk-fuels">
          {station.fuels.map((fuel) => (
            <li key={fuel.fuel_type || 'unknown'} className="tnk-fuel-row">
              <div className="tnk-fuel-row__head">
                <span className="tnk-fuel-row__name">{fuel.fuel_type || 'Вид не определён'}</span>
                <span className="tnk-fuel-row__volume t-numeric">{formatLiters(fuel.volume)} л</span>
              </div>
              <FillBar percent={fuel.fill_percent} label={`Заполнение: ${fuel.fuel_type || 'топливо'}`} />
              <div className="tnk-fuel-row__meta">
                <span className="t-numeric">
                  {fuel.capacity_liters ? `${formatPercent(fuel.fill_percent)} из ${formatLiters(fuel.capacity_liters)} л` : 'вместимость не задана'}
                </span>
                {/* Как считан остаток — только в подсказке: на КАЗС это замер на открытии смены минус отпуск */}
                <span title={fuelAgeHint(fuel)} data-testid="fuel-age">{formatAge(fuel.age_minutes)}</span>
              </div>
              <WarningChips warnings={fuel.warnings} skip={['no_capacity']} />
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className="tnk-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={14} />
        Ёмкости ({station.tanks.length})
      </button>
      {expanded ? (
        <ul className="tnk-tanks">
          {station.tanks.map((tank) => (
            <TankRow key={tank.id} tank={tank} isAdmin={isAdmin} onHistory={onHistory} onSettings={onSettings} />
          ))}
        </ul>
      ) : null}
    </article>
  )
}

const TanksPage = () => {
  const { error: showError, success } = useToast()
  const { user } = useAuth()
  const isAdmin = Boolean(user && (user.role === 'admin' || user.is_superuser))

  const [overview, setOverview] = useState({ stations: [], sync: [], total_tanks: 0 })
  const [providers, setProviders] = useState([])
  const [providerId, setProviderId] = useState('')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [historyTank, setHistoryTank] = useState(null)
  const [settingsTank, setSettingsTank] = useState(null)
  const [shareStation, setShareStation] = useState(null)
  const [showHidden, setShowHidden] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (providerId) params.append('provider_id', providerId)
      const response = await authFetch(`${API_URL}/api/v1/tanks?${params}`)
      if (!response.ok) throw await readError(response, 'Не удалось загрузить остатки')
      setOverview(await response.json())
    } catch (err) {
      if (err.isUnauthorized) return
      logger.error('Ошибка загрузки резервуаров:', err)
      showError(err.message)
    } finally {
      setLoading(false)
    }
  }, [providerId, showError])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    authFetch(`${API_URL}/api/v1/providers?limit=200`)
      .then((response) => (response.ok ? response.json() : { items: [] }))
      .then((data) => setProviders(data.items || data || []))
      .catch(() => setProviders([]))
  }, [])

  const syncNow = async () => {
    setSyncing(true)
    try {
      const response = await authFetch(`${API_URL}/api/v1/tanks/sync`, { method: 'POST' })
      if (!response.ok) throw await readError(response, 'Не удалось прочитать данные из Топаза')
      const results = await response.json()
      const failed = results.filter((r) => r.status !== 'success')
      if (failed.length) {
        showError(`Не прочитано: ${failed.map((r) => r.template_name).join(', ')}`)
      } else {
        const added = results.reduce((sum, r) => sum + (r.readings_added || 0), 0)
        success(`Данные из Топаза прочитаны, новых замеров: ${added}`)
      }
      await load()
    } catch (err) {
      if (!err.isUnauthorized) showError(err.message)
    } finally {
      setSyncing(false)
    }
  }

  const providerOptions = useMemo(() => {
    const withTanks = new Set(overview.sync.map((s) => s.provider_id))
    return [
      { value: '', label: 'Все провайдеры' },
      ...providers.filter((p) => withTanks.has(p.id)).map((p) => ({ value: String(p.id), label: p.name })),
    ]
  }, [providers, overview.sync])

  // Выключенные в настройках ёмкости скрыты; АЗС без видимых ёмкостей не показывается
  const hiddenCount = overview.stations.reduce((sum, s) => sum + s.tanks.filter((t) => !t.is_active).length, 0)
  const visibleStations = useMemo(() => {
    if (showHidden && isAdmin) return overview.stations
    return overview.stations
      .map((station) => ({ ...station, tanks: station.tanks.filter((tank) => tank.is_active) }))
      .filter((station) => station.tanks.length > 0)
  }, [overview.stations, showHidden, isAdmin])

  const failedSync = overview.sync.filter((s) => s.last_status === 'failed')
  const lastSuccess = overview.sync
    .map((s) => s.last_success_at)
    .filter(Boolean)
    .sort()
    .pop()

  return (
    <div className="tnk-root" data-testid="tanks-page">
      <div className="tnk-header">
        <div>
          <h2 className="tnk-header__title">Резервуары</h2>
          <p className="tnk-header__subtitle">
            Остатки топлива по уровнемерам Топаза. Время замеров — по часам АЗС.
            {lastSuccess ? ` Последнее чтение из Топаза: ${new Date(lastSuccess).toLocaleString('ru-RU')}.` : ''}
          </p>
        </div>
        <div className="tnk-header__actions">
          <Select
            value={providerId}
            onChange={(value) => setProviderId(value || '')}
            options={providerOptions}
            aria-label="Провайдер"
          />
          {isAdmin && hiddenCount > 0 ? (
            <Button
              variant="secondary"
              icon={<Icon name={showHidden ? 'eye-off' : 'eye'} size={16} />}
              onClick={() => setShowHidden((value) => !value)}
              aria-pressed={showHidden}
            >
              {showHidden ? 'Не показывать скрытые' : `Показать скрытые (${hiddenCount})`}
            </Button>
          ) : null}
          {isAdmin ? (
            <Button variant="secondary" icon={<Icon name="refresh" size={16} />} onClick={syncNow} loading={syncing}>
              Прочитать из Топаза
            </Button>
          ) : null}
        </div>
      </div>

      {failedSync.length > 0 ? (
        <div className="tnk-alert" role="status">
          <Icon name="alert" size={16} />
          <div>
            {failedSync.map((s) => (
              <div key={s.template_id}>
                <b>{s.template_name}</b>: последняя попытка чтения не удалась — {s.last_error || 'причина не записана'}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="tnk-grid">
          {[0, 1, 2].map((i) => (
            <div key={i} className="tnk-station"><Skeleton rows={4} columns={1} /></div>
          ))}
        </div>
      ) : visibleStations.length === 0 ? (
        <div className="tnk-station">
          <EmptyState
            title="Резервуаров пока нет"
            message="Остатки появятся после первого чтения из Топаза: оно идёт по расписанию раз в 15 минут для всех шаблонов с подключением к Firebird."
            icon={<Icon name="tank" size={32} />}
            action={isAdmin ? <Button onClick={syncNow} loading={syncing}>Прочитать сейчас</Button> : null}
          />
        </div>
      ) : (
        <div className="tnk-grid">
          {visibleStations.map((station) => (
            <StationCard
              key={`${station.provider_id}-${station.azs_code}`}
              station={station}
              isAdmin={isAdmin}
              onHistory={setHistoryTank}
              onSettings={setSettingsTank}
              onShare={() => setShareStation(station)}
            />
          ))}
        </div>
      )}

      <TankHistoryModal tank={historyTank} onClose={() => setHistoryTank(null)} />
      <TankSettingsModal tank={settingsTank} onClose={() => setSettingsTank(null)} onSaved={load} />
      {shareStation && <StationShareModal station={shareStation} onClose={() => setShareStation(null)} />}
    </div>
  )
}

export default TanksPage
