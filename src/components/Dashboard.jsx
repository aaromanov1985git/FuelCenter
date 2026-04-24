import React, { useState, useEffect, useMemo } from 'react'
import { SkeletonCard } from './Skeleton'
import { useToast } from './ToastContainer'
import Tooltip from './Tooltip'
import { Button } from './ui'
import { authFetch } from '../utils/api'
import { logger } from '../utils/logger'
import './Dashboard.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

// Палитра серий для графика и провайдеров — фиксированные цвета из дизайн-системы
const SERIES_COLORS = [
  '#7c5cff', // accent (violet)
  '#ffb547', // amber
  '#4fd1ff', // cyan
  '#22d3a7', // green
  '#ff78c4', // pink
  '#ff6b6b', // red
  '#8b5cf6',
  '#06b6d4',
]

// Затемнение hex-цвета для градиента
const darkenHex = (hex, amount = 30) => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return hex
  const r = Math.max(0, parseInt(m[1], 16) - amount)
  const g = Math.max(0, parseInt(m[2], 16) - amount)
  const b = Math.max(0, parseInt(m[3], 16) - amount)
  return `rgb(${r}, ${g}, ${b})`
}

// Компактная спарклайн-диаграмма для стат-карточки
const Sparkline = ({ data, color }) => {
  if (!data || data.length === 0) return null
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const pts = data.map((v, i) =>
    `${(i / (data.length - 1 || 1)) * 100},${100 - ((v - min) / range) * 80 - 10}`
  ).join(' ')
  const gid = `dash-sp-${color.replace(/[^a-z0-9]/gi, '')}-${data.length}`
  return (
    <svg width="100%" height="32" viewBox="0 0 100 100" preserveAspectRatio="none" className="dash-sparkline">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".5" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <polygon points={`0,100 ${pts} 100,100`} fill={`url(#${gid})`} />
    </svg>
  )
}

const Dashboard = () => {
  const { error: showError, success } = useToast()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [period, setPeriod] = useState('month') // day, month, year
  const [hiddenProviders, setHiddenProviders] = useState(new Set())
  const [sortConfigQuantity, setSortConfigQuantity] = useState({ field: null, order: 'desc' })
  const [sortConfigCount, setSortConfigCount] = useState({ field: null, order: 'desc' })
  const [autoLoadStats, setAutoLoadStats] = useState(null)
  const [autoLoadLoading, setAutoLoadLoading] = useState(false)

  const loadStats = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await authFetch(`${API_URL}/api/v1/dashboard/stats?period=${period}`)
      if (!response.ok) throw new Error('Ошибка загрузки данных')
      const result = await response.json()
      setStats(result)
    } catch (err) {
      if (err.isUnauthorized) return
      const errorMessage = 'Ошибка загрузки: ' + err.message
      setError(errorMessage)
      showError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const loadAutoLoadStats = async () => {
    setAutoLoadLoading(true)
    try {
      const response = await authFetch(`${API_URL}/api/v1/dashboard/auto-load-stats`)
      if (!response.ok) throw new Error('Ошибка загрузки данных')
      const result = await response.json()
      setAutoLoadStats(result)
    } catch (err) {
      if (err.isUnauthorized) return
      logger.error('Ошибка загрузки статистики автоматических загрузок', { error: err.message })
    } finally {
      setAutoLoadLoading(false)
    }
  }

  useEffect(() => {
    loadStats()
    loadAutoLoadStats()
  }, [period])

  const formatNumber = (num) =>
    new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num)

  const formatLiters = (num) => {
    if (num >= 1000000) {
      const thousands = num / 1000
      return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(thousands) + ' тыс. л'
    }
    return formatNumber(num) + ' л'
  }

  const formatLitersThousands = (num) => {
    const thousands = Math.round(num / 1000)
    return new Intl.NumberFormat('ru-RU').format(thousands)
  }

  const formatLitersForColumn = (num) => {
    const thousands = num / 1000
    return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(thousands) + ' тыс. л'
  }

  const formatPeriodLabel = (periodStr, periodType) => {
    if (periodType === 'day') {
      const [day, month] = periodStr.split('.')
      const monthNames = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
      return `${day} ${monthNames[parseInt(month) - 1]}`
    } else if (periodType === 'month') {
      const [month, year] = periodStr.split('.')
      const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
      return `${monthNames[parseInt(month) - 1]} ${year}`
    }
    return `${periodStr}`
  }

  const getPeriodTitle = () => {
    if (!stats || !stats.period_data || stats.period_data.length === 0) return ''
    const dates = stats.period_data.map(d => d.period)
    if (period === 'day' && dates.length > 0) {
      const [firstDay, firstMonth] = dates[0].split('.')
      const [lastDay, lastMonth, lastYear] = dates[dates.length - 1].split('.')
      return `Период: ${firstDay}.${firstMonth}.${lastYear} — ${lastDay}.${lastMonth}.${lastYear}`
    }
    if (period === 'month' && dates.length > 0) {
      const first = formatPeriodLabel(dates[0], 'month')
      const last = formatPeriodLabel(dates[dates.length - 1], 'month')
      return dates.length === 1 ? first : `Период: ${first} — ${last}`
    }
    if (period === 'year' && dates.length > 0) {
      const first = formatPeriodLabel(dates[0], 'year')
      const last = formatPeriodLabel(dates[dates.length - 1], 'year')
      return dates.length === 1 ? `${first} год` : `Период: ${first} — ${last} год`
    }
    return ''
  }

  const handleSortQuantity = (field) => {
    setSortConfigQuantity(prev =>
      prev.field === field ? { field, order: prev.order === 'asc' ? 'desc' : 'asc' } : { field, order: 'desc' }
    )
  }
  const handleSortCount = (field) => {
    setSortConfigCount(prev =>
      prev.field === field ? { field, order: prev.order === 'asc' ? 'desc' : 'asc' } : { field, order: 'desc' }
    )
  }

  const truncateText = (text, maxLength = 20) => {
    if (!text) return ''
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + '...'
  }

  const exportLeadersTable = async (data, headers, filename) => {
    try {
      const csvHeaders = headers.join(',')
      const csvRows = data.map(row =>
        headers.map(h => {
          const value = row[h] || ''
          if (String(value).includes(',') || String(value).includes('\n') || String(value).includes('"')) {
            return `"${String(value).replace(/"/g, '""')}"`
          }
          return value
        }).join(',')
      ).join('\n')
      const csvContent = csvHeaders + '\n' + csvRows

      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      success(`Таблица ${filename} успешно экспортирована`)
    } catch (err) {
      let errorText = 'Неизвестная ошибка'
      if (err instanceof Error) errorText = err.message || 'Ошибка экспорта'
      else if (typeof err === 'string') errorText = err
      else if (err && typeof err === 'object') errorText = err.detail || err.message || err.error || JSON.stringify(err)
      showError('Ошибка экспорта: ' + errorText)
    }
  }

  // ====== Мемо: подготовка данных графика ======
  const chartModel = useMemo(() => {
    if (!stats) return null
    // Приоритет — разрез по провайдерам
    if (stats.period_providers && Object.keys(stats.period_providers).length > 0) {
      const periods = Object.keys(stats.period_providers).sort()
      const providersSet = new Set()
      periods.forEach(p => Object.keys(stats.period_providers[p]).forEach(n => providersSet.add(n)))
      const providersList = Array.from(providersSet).sort()
      const providerColorMap = {}
      providersList.forEach((n, i) => { providerColorMap[n] = SERIES_COLORS[i % SERIES_COLORS.length] })

      const periodTotals = periods.map(p => {
        return providersList
          .filter(n => !hiddenProviders.has(n))
          .reduce((sum, n) => {
            const d = stats.period_providers[p][n]
            return sum + (d ? (Number(d.quantity) || 0) : 0)
          }, 0)
      })
      const maxQuantity = periodTotals.length > 0 ? Math.max(...periodTotals, 1) : 1

      return { kind: 'provider', periods, providersList, providerColorMap, periodTotals, maxQuantity }
    }
    // Базовый случай — без разреза
    const quantities = stats.period_data.map(d => Number(d.quantity) || 0)
    const maxQuantity = quantities.length > 0 ? Math.max(...quantities, 1) : 1
    return { kind: 'simple', data: stats.period_data, maxQuantity }
  }, [stats, hiddenProviders])

  const yAxisValues = useMemo(() => {
    if (!chartModel) return []
    const max = chartModel.maxQuantity
    const arr = []
    for (let i = 0; i <= 4; i++) arr.push((max / 4) * i)
    return arr.reverse()
  }, [chartModel])

  if (loading && !stats) {
    return (
      <div className="dash-root">
        <div className="dash-header">
          <h2 className="dash-title">Дашборд</h2>
        </div>
        <div className="dash-stat-grid">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    )
  }

  if (error) {
    return <div className="dash-error">{error}</div>
  }

  if (!stats) return null

  // Стат-карточки — из autoLoadStats + агрегатов
  const totalPeriodQty = stats.period_data?.reduce((s, d) => s + (Number(d.quantity) || 0), 0) || 0
  const totalPeriodCount = stats.period_data?.reduce((s, d) => s + (Number(d.count) || 0), 0) || 0
  const providersCount = stats.providers?.length || 0
  const sparkQty = (stats.period_data || []).map(d => Number(d.quantity) || 0)
  const sparkCnt = (stats.period_data || []).map(d => Number(d.count) || 0)

  const statCards = [
    {
      label: 'Транзакций',
      value: totalPeriodCount.toLocaleString('ru-RU'),
      color: SERIES_COLORS[0],
      spark: sparkCnt.length ? sparkCnt : [1, 2, 3, 4, 5],
    },
    {
      label: 'Топливо',
      value: formatLitersThousands(totalPeriodQty),
      unit: 'тыс. л',
      color: SERIES_COLORS[3],
      spark: sparkQty.length ? sparkQty : [1, 2, 3, 4, 5],
    },
    {
      label: 'Провайдеров',
      value: String(providersCount),
      color: SERIES_COLORS[2],
      spark: sparkCnt.length ? sparkCnt : [1, 2, 3, 4, 5],
    },
    {
      label: autoLoadStats ? `Автозагрузки · ${autoLoadStats.period_hours}ч` : 'Автозагрузки',
      value: autoLoadStats ? (autoLoadStats.total_transactions || 0).toLocaleString('ru-RU') : '—',
      color: autoLoadStats && autoLoadStats.has_errors ? 'var(--red)' : SERIES_COLORS[1],
      colorRaw: autoLoadStats && autoLoadStats.has_errors ? '#ff6b6b' : SERIES_COLORS[1],
      spark: sparkCnt.length ? sparkCnt : [1, 2, 3, 4, 5],
      footer: autoLoadStats
        ? (autoLoadStats.has_errors
          ? `Ошибок: ${autoLoadStats.transactions_with_errors}`
          : 'Ошибок нет')
        : null,
      footerStatus: autoLoadStats && autoLoadStats.has_errors ? 'error' : 'ok',
    },
  ]

  // Данные для блока "Топ провайдеров"
  const sortedProvidersByQty = stats.providers
    ? [...stats.providers]
        .sort((a, b) => (Number(b.quantity) || 0) - (Number(a.quantity) || 0))
        .slice(0, 5)
    : []
  const topProviderMax = sortedProvidersByQty[0] ? (Number(sortedProvidersByQty[0].quantity) || 1) : 1

  // Данные для "Автоматические загрузки — последние"
  const recentUploads = autoLoadStats?.providers || []

  return (
    <div className="dash-root">
      <div className="dash-header">
        <div className="dash-header-titles">
          <h2 className="dash-title">Дашборд</h2>
          <div className="dash-subtitle">Обзор потребления и загрузок</div>
        </div>
        <div className="dash-period-selector" role="tablist" aria-label="Период">
          {[
            { key: 'day', label: 'По дням' },
            { key: 'month', label: 'По месяцам' },
            { key: 'year', label: 'По годам' },
          ].map(p => (
            <button
              key={p.key}
              type="button"
              role="tab"
              aria-selected={period === p.key}
              className={`dash-period-btn${period === p.key ? ' is-active' : ''}`}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Стат-карточки */}
      <div className="dash-stat-grid">
        {statCards.map((c, i) => (
          <div key={i} className="dash-stat-card">
            <div className="t-label dash-stat-label">{c.label}</div>
            <div className="dash-stat-row">
              <div className="t-value dash-stat-value">
                {c.value}
                {c.unit && <span className="t-unit">{c.unit}</span>}
              </div>
              {c.footer && (
                <span className={`dash-chip dash-chip-${c.footerStatus === 'error' ? 'red' : 'green'}`}>
                  {c.footer}
                </span>
              )}
            </div>
            <Sparkline data={c.spark} color={c.colorRaw || c.color} />
          </div>
        ))}
      </div>

      {/* Авто-загрузки (компактно) */}
      {autoLoadLoading ? (
        <div className="dash-card dash-autoload-card">
          <div className="dash-card-header">
            <div>
              <div className="dash-card-title">Загрузка по расписанию</div>
              <div className="dash-card-subtitle">Загрузка данных...</div>
            </div>
          </div>
          <div className="dash-stat-grid">
            {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        </div>
      ) : autoLoadStats ? (
        <div className="dash-card dash-autoload-card">
          <div className="dash-card-header">
            <div>
              <div className="dash-card-title">Загрузка по расписанию</div>
              <div className="dash-card-subtitle">За последние {autoLoadStats.period_hours} ч</div>
            </div>
            <span className={`dash-chip ${autoLoadStats.has_errors ? 'dash-chip-amber' : 'dash-chip-green'}`}>
              {autoLoadStats.has_errors
                ? `Предупреждения (${autoLoadStats.transactions_with_errors})`
                : 'Обработано без ошибок'}
            </span>
          </div>
          <div className="dash-autoload-grid">
            <div className="dash-autoload-metric">
              <div className="t-label">Транзакций</div>
              <div className="t-value-sm">{autoLoadStats.total_transactions.toLocaleString('ru-RU')}</div>
            </div>
            <div className="dash-autoload-metric">
              <div className="t-label">Литров</div>
              <div className="t-value-sm">
                {formatNumber(autoLoadStats.total_liters)}<span className="t-unit">л</span>
              </div>
            </div>
            <div className="dash-autoload-providers">
              <div className="t-label">Провайдеры</div>
              <div className="dash-autoload-providers-list">
                {recentUploads.length > 0 ? recentUploads.map((p, idx) => (
                  <div key={idx} className="dash-upload-row">
                    <div className="dash-upload-icon" aria-hidden="true">
                      <svg width="14" height="16" viewBox="0 0 14 16" fill="none">
                        <path d="M1 2a1 1 0 011-1h6l5 5v9a1 1 0 01-1 1H2a1 1 0 01-1-1V2z" stroke="currentColor" strokeWidth="1.3" />
                        <path d="M8 1v5h5" stroke="currentColor" strokeWidth="1.3" />
                      </svg>
                    </div>
                    <div className="dash-upload-meta">
                      <div className="dash-upload-name">{p.name}</div>
                      <div className="dash-upload-sub">
                        {p.transactions_count} транз. · {formatLiters(p.liters)}
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="dash-empty">Нет данных</div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="dash-card dash-autoload-card">
          <div className="dash-empty">Нет данных о загрузках</div>
        </div>
      )}

      {/* Основная сетка: график + топ провайдеров */}
      <div className="dash-main-grid">
        <div className="dash-card dash-chart-card">
          <div className="dash-card-header">
            <div>
              <div className="dash-card-title">Динамика потребления</div>
              <div className="dash-card-subtitle">{getPeriodTitle() || 'По выбранному периоду · литры'}</div>
            </div>
          </div>

          <div className="dash-chart-container">
            {chartModel && (
              <div className="dash-chart-y-axis" aria-hidden="true">
                {yAxisValues.map((v, idx) => (
                  <div key={idx} className="dash-y-axis-label">{formatLitersThousands(v)}</div>
                ))}
              </div>
            )}
            <div className="dash-chart-bars">
              {chartModel && chartModel.kind === 'provider' && chartModel.periods.map((p, periodIdx) => {
                const providerData = chartModel.providersList
                  .filter(n => !hiddenProviders.has(n))
                  .map(n => {
                    const d = stats.period_providers[p][n]
                    return {
                      name: n,
                      quantity: d ? (Number(d.quantity) || 0) : 0,
                      count: d ? (d.count || 0) : 0,
                      color: chartModel.providerColorMap[n],
                    }
                  })
                  .filter(x => x.quantity > 0)

                const totalQuantity = providerData.reduce((s, x) => s + x.quantity, 0)
                const totalCount = providerData.reduce((s, x) => s + x.count, 0)
                const heightPercent = chartModel.maxQuantity > 0 ? (totalQuantity / chartModel.maxQuantity) * 100 : 0
                const heightPx = Math.max(8, (heightPercent / 100) * 300)

                return (
                  <div key={periodIdx} className="dash-chart-bar-wrapper">
                    <div
                      className="dash-chart-bar-stacked"
                      style={{ height: `${heightPx}px` }}
                      title={`${formatLitersForColumn(totalQuantity)}, ${totalCount} транз.`}
                    >
                      {providerData.map((pd) => {
                        const segmentHeight = totalQuantity > 0 ? (pd.quantity / totalQuantity) * 100 : 0
                        return (
                          <div
                            key={pd.name}
                            className="dash-chart-bar-segment"
                            style={{
                              height: `${segmentHeight}%`,
                              background: `linear-gradient(to top, ${pd.color}, ${darkenHex(pd.color, 30)})`,
                            }}
                            title={`${pd.name}: ${formatNumber(pd.quantity)} л, ${pd.count} транз.`}
                          />
                        )
                      })}
                      <span className="dash-chart-value">{formatLiters(totalQuantity)}</span>
                    </div>
                    <div className="dash-chart-label" title={p}>{formatPeriodLabel(p, period)}</div>
                    <div className="dash-chart-meta">{totalCount} транз.</div>
                    <div className="dash-chart-meta dash-chart-meta-strong">{formatLitersForColumn(totalQuantity)}</div>
                  </div>
                )
              })}

              {chartModel && chartModel.kind === 'simple' && chartModel.data.map((item, idx) => {
                const quantity = Number(item.quantity) || 0
                const heightPercent = chartModel.maxQuantity > 0 ? (quantity / chartModel.maxQuantity) * 100 : 0
                const heightPx = Math.max(8, (heightPercent / 100) * 300)
                return (
                  <div key={idx} className="dash-chart-bar-wrapper">
                    <div
                      className="dash-chart-bar-simple"
                      style={{ height: `${heightPx}px` }}
                      title={`${formatLitersForColumn(quantity)}, ${item.count} транз.`}
                    >
                      <span className="dash-chart-value">{formatLiters(quantity)}</span>
                    </div>
                    <div className="dash-chart-label" title={item.period}>{formatPeriodLabel(item.period, period)}</div>
                    <div className="dash-chart-meta">{item.count} транз.</div>
                    <div className="dash-chart-meta dash-chart-meta-strong">{formatLitersForColumn(quantity)}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {stats.period_providers && Object.keys(stats.period_providers).length > 0 && stats.providers && stats.providers.length > 0 && (
            <div className="dash-legend">
              {(() => {
                const sortedProviders = [...stats.providers].sort((a, b) =>
                  a.provider_name.localeCompare(b.provider_name)
                )
                const toggleProvider = (providerName) => {
                  setHiddenProviders(prev => {
                    const s = new Set(prev)
                    if (s.has(providerName)) s.delete(providerName); else s.add(providerName)
                    return s
                  })
                }
                return sortedProviders.map((provider, idx) => {
                  const isHidden = hiddenProviders.has(provider.provider_name)
                  const color = SERIES_COLORS[idx % SERIES_COLORS.length]
                  return (
                    <div
                      key={idx}
                      className={`dash-legend-item${isHidden ? ' is-disabled' : ''}`}
                      onClick={() => toggleProvider(provider.provider_name)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleProvider(provider.provider_name) }
                      }}
                      aria-label={isHidden ? `Показать ${provider.provider_name}` : `Скрыть ${provider.provider_name}`}
                    >
                      <div className="dash-legend-swatch" style={{ background: color }} />
                      <div className="dash-legend-meta">
                        <div className="dash-legend-label">{provider.provider_name}</div>
                        <div className="dash-legend-value">{formatLiters(Number(provider.quantity) || 0)}</div>
                      </div>
                    </div>
                  )
                })
              })()}
            </div>
          )}
        </div>

        <div className="dash-card dash-top-card">
          <div className="dash-card-header dash-card-header-stacked">
            <div className="dash-card-title">Топ-5 провайдеров</div>
            <div className="dash-card-subtitle">По объёму за период</div>
          </div>
          <div className="dash-top-list">
            {sortedProvidersByQty.length > 0 ? sortedProvidersByQty.map((p, idx) => {
              const qty = Number(p.quantity) || 0
              const pct = topProviderMax > 0 ? Math.max(2, (qty / topProviderMax) * 100) : 0
              const color = SERIES_COLORS[idx % SERIES_COLORS.length]
              return (
                <div key={idx} className="dash-top-row">
                  <div className="dash-top-head">
                    <span className="dash-top-name">{p.provider_name || 'Не указано'}</span>
                    <span className="dash-top-value">{formatLiters(qty)}</span>
                  </div>
                  <div className="dash-top-bar-track">
                    <div className="dash-top-bar-fill" style={{ width: `${pct}%`, background: color }} />
                  </div>
                </div>
              )
            }) : (
              <div className="dash-empty">Нет данных</div>
            )}
          </div>
        </div>
      </div>

      {/* Топ-10 таблицы */}
      <div className="dash-tables-grid">
        <div className="dash-card">
          <div className="dash-card-header">
            <div>
              <div className="dash-card-title">Топ-10 по количеству</div>
              <div className="dash-card-subtitle">Литры · по карте/ТС</div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="dash-export-btn"
              onClick={() => {
                const sortedData = [...stats.leaders_by_quantity].sort((a, b) => {
                  if (!sortConfigQuantity.field) return 0
                  const aVal = sortConfigQuantity.field === 'quantity' ? a.quantity :
                              sortConfigQuantity.field === 'count' ? a.count :
                              sortConfigQuantity.field === 'card_number' ? a.card_number : a.vehicle
                  const bVal = sortConfigQuantity.field === 'quantity' ? b.quantity :
                              sortConfigQuantity.field === 'count' ? b.count :
                              sortConfigQuantity.field === 'card_number' ? b.card_number : b.vehicle
                  const comparison = typeof aVal === 'string' ? aVal.localeCompare(bVal) : aVal - bVal
                  return sortConfigQuantity.order === 'asc' ? comparison : -comparison
                })
                exportLeadersTable(
                  sortedData.map((l, idx) => ({
                    '№': idx + 1,
                    'Карта': l.card_number,
                    'ТС': l.vehicle,
                    'Литры': formatNumber(l.quantity),
                    'Транзакций': l.count
                  })),
                  ['№', 'Карта', 'ТС', 'Литры', 'Транзакций'],
                  'top10_by_quantity'
                )
              }}
              title="Экспортировать таблицу в CSV"
            >
              Экспорт CSV
            </Button>
          </div>
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>№</th>
                  <th className="dash-th-sortable" onClick={() => handleSortQuantity('card_number')}
                      role="columnheader" tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSortQuantity('card_number') } }}>
                    <span className="dash-th-content">
                      Карта
                      {sortConfigQuantity.field === 'card_number' && (
                        <span className="dash-sort-icon">{sortConfigQuantity.order === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </span>
                  </th>
                  <th className="dash-th-sortable" onClick={() => handleSortQuantity('vehicle')}
                      role="columnheader" tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSortQuantity('vehicle') } }}>
                    <span className="dash-th-content">
                      ТС
                      {sortConfigQuantity.field === 'vehicle' && (
                        <span className="dash-sort-icon">{sortConfigQuantity.order === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </span>
                  </th>
                  <th className="dash-th-sortable dash-th-num" onClick={() => handleSortQuantity('quantity')}
                      role="columnheader" tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSortQuantity('quantity') } }}>
                    <span className="dash-th-content">
                      Литры
                      {sortConfigQuantity.field === 'quantity' && (
                        <span className="dash-sort-icon">{sortConfigQuantity.order === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </span>
                  </th>
                  <th className="dash-th-sortable dash-th-num" onClick={() => handleSortQuantity('count')}
                      role="columnheader" tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSortQuantity('count') } }}>
                    <span className="dash-th-content">
                      Транз.
                      {sortConfigQuantity.field === 'count' && (
                        <span className="dash-sort-icon">{sortConfigQuantity.order === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const sortedData = [...stats.leaders_by_quantity].sort((a, b) => {
                    if (!sortConfigQuantity.field) return 0
                    const aVal = sortConfigQuantity.field === 'quantity' ? a.quantity :
                                sortConfigQuantity.field === 'count' ? a.count :
                                sortConfigQuantity.field === 'card_number' ? a.card_number : a.vehicle
                    const bVal = sortConfigQuantity.field === 'quantity' ? b.quantity :
                                sortConfigQuantity.field === 'count' ? b.count :
                                sortConfigQuantity.field === 'card_number' ? b.card_number : b.vehicle
                    const comparison = typeof aVal === 'string' ? aVal.localeCompare(bVal) : aVal - bVal
                    return sortConfigQuantity.order === 'asc' ? comparison : -comparison
                  })
                  return sortedData.map((leader, idx) => (
                    <tr key={idx}>
                      <td className="dash-td-idx">{idx + 1}</td>
                      <td>
                        <Tooltip content={leader.card_number} position="top">
                          <span className="dash-truncated">{truncateText(leader.card_number, 15)}</span>
                        </Tooltip>
                      </td>
                      <td>
                        <Tooltip content={leader.vehicle || '-'} position="top">
                          <span className="dash-truncated">{truncateText(leader.vehicle || '-', 15)}</span>
                        </Tooltip>
                      </td>
                      <td className="dash-td-num">{formatNumber(leader.quantity)}</td>
                      <td className="dash-td-num">{leader.count}</td>
                    </tr>
                  ))
                })()}
              </tbody>
            </table>
          </div>
        </div>

        <div className="dash-card">
          <div className="dash-card-header">
            <div>
              <div className="dash-card-title">Топ-10 по транзакциям</div>
              <div className="dash-card-subtitle">Количество · по карте/ТС</div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="dash-export-btn"
              onClick={() => {
                const sortedData = [...stats.leaders_by_count].sort((a, b) => {
                  if (!sortConfigCount.field) return 0
                  const aVal = sortConfigCount.field === 'quantity' ? a.quantity :
                              sortConfigCount.field === 'count' ? a.count :
                              sortConfigCount.field === 'card_number' ? a.card_number : a.vehicle
                  const bVal = sortConfigCount.field === 'quantity' ? b.quantity :
                              sortConfigCount.field === 'count' ? b.count :
                              sortConfigCount.field === 'card_number' ? b.card_number : b.vehicle
                  const comparison = typeof aVal === 'string' ? aVal.localeCompare(bVal) : aVal - bVal
                  return sortConfigCount.order === 'asc' ? comparison : -comparison
                })
                exportLeadersTable(
                  sortedData.map((l, idx) => ({
                    '№': idx + 1,
                    'Карта': l.card_number,
                    'ТС': l.vehicle,
                    'Транзакций': l.count,
                    'Литры': formatNumber(l.quantity)
                  })),
                  ['№', 'Карта', 'ТС', 'Транзакций', 'Литры'],
                  'top10_by_count'
                )
              }}
              title="Экспортировать таблицу в CSV"
            >
              Экспорт CSV
            </Button>
          </div>
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>№</th>
                  <th className="dash-th-sortable" onClick={() => handleSortCount('card_number')}
                      role="columnheader" tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSortCount('card_number') } }}>
                    <span className="dash-th-content">
                      Карта
                      {sortConfigCount.field === 'card_number' && (
                        <span className="dash-sort-icon">{sortConfigCount.order === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </span>
                  </th>
                  <th className="dash-th-sortable" onClick={() => handleSortCount('vehicle')}
                      role="columnheader" tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSortCount('vehicle') } }}>
                    <span className="dash-th-content">
                      ТС
                      {sortConfigCount.field === 'vehicle' && (
                        <span className="dash-sort-icon">{sortConfigCount.order === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </span>
                  </th>
                  <th className="dash-th-sortable dash-th-num" onClick={() => handleSortCount('count')}
                      role="columnheader" tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSortCount('count') } }}>
                    <span className="dash-th-content">
                      Транз.
                      {sortConfigCount.field === 'count' && (
                        <span className="dash-sort-icon">{sortConfigCount.order === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </span>
                  </th>
                  <th className="dash-th-sortable dash-th-num" onClick={() => handleSortCount('quantity')}
                      role="columnheader" tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSortCount('quantity') } }}>
                    <span className="dash-th-content">
                      Литры
                      {sortConfigCount.field === 'quantity' && (
                        <span className="dash-sort-icon">{sortConfigCount.order === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const sortedData = [...stats.leaders_by_count].sort((a, b) => {
                    if (!sortConfigCount.field) return 0
                    const aVal = sortConfigCount.field === 'quantity' ? a.quantity :
                                sortConfigCount.field === 'count' ? a.count :
                                sortConfigCount.field === 'card_number' ? a.card_number : a.vehicle
                    const bVal = sortConfigCount.field === 'quantity' ? b.quantity :
                                sortConfigCount.field === 'count' ? b.count :
                                sortConfigCount.field === 'card_number' ? b.card_number : b.vehicle
                    const comparison = typeof aVal === 'string' ? aVal.localeCompare(bVal) : aVal - bVal
                    return sortConfigCount.order === 'asc' ? comparison : -comparison
                  })
                  return sortedData.map((leader, idx) => (
                    <tr key={idx}>
                      <td className="dash-td-idx">{idx + 1}</td>
                      <td>
                        <Tooltip content={leader.card_number} position="top">
                          <span className="dash-truncated">{truncateText(leader.card_number, 15)}</span>
                        </Tooltip>
                      </td>
                      <td>
                        <Tooltip content={leader.vehicle || '-'} position="top">
                          <span className="dash-truncated">{truncateText(leader.vehicle || '-', 15)}</span>
                        </Tooltip>
                      </td>
                      <td className="dash-td-num">{leader.count}</td>
                      <td className="dash-td-num">{formatNumber(leader.quantity)}</td>
                    </tr>
                  ))
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Товары */}
      {stats.products && stats.products.length > 0 && (
        <div className="dash-card">
          <div className="dash-card-header">
            <div>
              <div className="dash-card-title">Статистика по товарам</div>
              <div className="dash-card-subtitle">Разрез по номенклатуре</div>
            </div>
          </div>
          <div className="dash-products-grid">
            {stats.products.map((product, idx) => (
              <div key={idx} className="dash-product-card">
                <div className="t-label">{product.product || 'Не указано'}</div>
                <div className="t-value-sm dash-product-value">{formatLiters(product.quantity)}</div>
                <div className="dash-product-meta">{product.count} транзакций</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard
