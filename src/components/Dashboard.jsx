import React, { useState, useEffect } from 'react'
import Skeleton, { SkeletonCard } from './Skeleton'
import { useToast } from './ToastContainer'
import Tooltip from './Tooltip'
import { authFetch } from '../utils/api'
import { logger } from '../utils/logger'
import './Dashboard.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

const Dashboard = () => {
  const { error: showError, success } = useToast()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [period, setPeriod] = useState('month') // day, month, year
  const [hiddenProviders, setHiddenProviders] = useState(new Set()) // Скрытые провайдеры в легенде
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
      logger.error('Ошибка загрузки статистики автоматических загрузок', { error: err.message })
    } finally {
      setAutoLoadLoading(false)
    }
  }

  useEffect(() => {
    loadStats()
    loadAutoLoadStats()
  }, [period])

  const formatNumber = (num) => {
    return new Intl.NumberFormat('ru-RU', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    }).format(num)
  }

  const formatPeriodLabel = (periodStr, periodType) => {
    if (periodType === 'day') {
      // Формат: "01.12.2025" -> "01 дек"
      const [day, month, year] = periodStr.split('.')
      const monthNames = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 
                         'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
      return `${day} ${monthNames[parseInt(month) - 1]}`
    } else if (periodType === 'month') {
      // Формат: "12.2025" -> "Декабрь 2025"
      const [month, year] = periodStr.split('.')
      const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 
                         'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
      return `${monthNames[parseInt(month) - 1]} ${year}`
    } else {
      // Формат: "2025" -> "2025"
      return `${periodStr}`
    }
  }

  const getPeriodTitle = () => {
    if (!stats || !stats.period_data || stats.period_data.length === 0) {
      return ''
    }

    const dates = stats.period_data.map(d => d.period)
    if (period === 'day') {
      if (dates.length > 0) {
        const first = formatPeriodLabel(dates[0], 'day')
        const last = formatPeriodLabel(dates[dates.length - 1], 'day')
        const [firstDay, firstMonth] = dates[0].split('.')
        const [lastDay, lastMonth, lastYear] = dates[dates.length - 1].split('.')
        return `Период: ${firstDay}.${firstMonth}.${lastYear} - ${lastDay}.${lastMonth}.${lastYear}`
      }
    } else if (period === 'month') {
      if (dates.length > 0) {
        const first = formatPeriodLabel(dates[0], 'month')
        const last = formatPeriodLabel(dates[dates.length - 1], 'month')
        if (dates.length === 1) {
          return first
        }
        return `Период: ${first} - ${last}`
      }
    } else if (period === 'year') {
      if (dates.length > 0) {
        const first = formatPeriodLabel(dates[0], 'year')
        const last = formatPeriodLabel(dates[dates.length - 1], 'year')
        if (dates.length === 1) {
          return `${first} год`
        }
        return `Период: ${first} - ${last} год`
      }
    }
    return ''
  }

  // Функция сортировки для таблиц Топ-10
  const handleSortQuantity = (field) => {
    setSortConfigQuantity(prev => {
      if (prev.field === field) {
        return { field, order: prev.order === 'asc' ? 'desc' : 'asc' }
      }
      return { field, order: 'desc' }
    })
  }

  const handleSortCount = (field) => {
    setSortConfigCount(prev => {
      if (prev.field === field) {
        return { field, order: prev.order === 'asc' ? 'desc' : 'asc' }
      }
      return { field, order: 'desc' }
    })
  }

  // Функция для обрезки длинных значений
  const truncateText = (text, maxLength = 20) => {
    if (!text) return ''
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + '...'
  }

  // Функция экспорта таблицы Топ-10
  const exportLeadersTable = async (data, headers, filename) => {
    try {
      const csvHeaders = headers.join(',')
      const csvRows = data.map(row => 
        headers.map(h => {
          const value = row[h] || ''
          if (value.includes(',') || value.includes('\n') || value.includes('"')) {
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
      showError('Ошибка экспорта: ' + err.message)
    }
  }

  if (loading && !stats) {
    return (
      <div className="dashboard">
        <div className="dashboard-header">
          <h2>Дашборд</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return <div className="dashboard-error">{error}</div>
  }

  if (!stats) {
    return null
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h2>Дашборд</h2>
        <div className="period-selector">
          <button 
            className={period === 'day' ? 'active' : ''}
            onClick={() => setPeriod('day')}
          >
            По дням
          </button>
          <button 
            className={period === 'month' ? 'active' : ''}
            onClick={() => setPeriod('month')}
          >
            По месяцам
          </button>
          <button 
            className={period === 'year' ? 'active' : ''}
            onClick={() => setPeriod('year')}
          >
            По годам
          </button>
        </div>
      </div>

      {/* Секция "Загрузка по расписанию" */}
      <div className="dashboard-section auto-load-section">
        <h3>Загрузка по расписанию</h3>
        {autoLoadLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : autoLoadStats ? (
          <div className="auto-load-stats">
            <div className="auto-load-period">
              За последние {autoLoadStats.period_hours} ч
            </div>
            <div className="auto-load-grid">
              <div className="auto-load-card">
                <div className="auto-load-card-label">Транзакций</div>
                <div className="auto-load-card-value">{autoLoadStats.total_transactions.toLocaleString('ru-RU')}</div>
              </div>
              <div className="auto-load-card">
                <div className="auto-load-card-label">Литров</div>
                <div className="auto-load-card-value">{formatNumber(autoLoadStats.total_liters)}</div>
              </div>
              <div className="auto-load-card auto-load-card-providers">
                <div className="auto-load-card-label">Провайдеры</div>
                <div className="auto-load-providers-list">
                  {autoLoadStats.providers && autoLoadStats.providers.length > 0 ? (
                    autoLoadStats.providers.map((provider, idx) => (
                      <div key={idx} className="auto-load-provider-item">
                        <span className="provider-name">{provider.name}</span>
                        <span className="provider-stats">
                          {provider.transactions_count} транз., {formatNumber(provider.liters)} л
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="auto-load-no-data">Нет данных</div>
                  )}
                </div>
              </div>
              <div className="auto-load-card">
                <div className="auto-load-card-label">Ошибки</div>
                <div className={`auto-load-card-value ${autoLoadStats.has_errors ? 'has-errors' : 'no-errors'}`}>
                  {autoLoadStats.has_errors ? (
                    <>
                      <span className="error-icon">⚠️</span>
                      <span>Да ({autoLoadStats.transactions_with_errors} транз.)</span>
                    </>
                  ) : (
                    <>
                      <span className="success-icon">✓</span>
                      <span>Нет</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="auto-load-no-data">Нет данных о загрузках</div>
        )}
      </div>

      {/* График по периодам */}
      <div className="dashboard-section">
        <div className="chart-header">
          <h3>Динамика потребления</h3>
          {stats.period_data && stats.period_data.length > 0 && (
            <div className="chart-period-info">
              {getPeriodTitle()}
            </div>
          )}
        </div>
        <div className="chart-container">
          {/* Ось Y с значениями */}
          {stats.period_providers && Object.keys(stats.period_providers).length > 0 && (() => {
            const periods = Object.keys(stats.period_providers).sort()
            const providersSet = new Set()
            periods.forEach(period => {
              Object.keys(stats.period_providers[period]).forEach(providerName => {
                providersSet.add(providerName)
              })
            })
            const providersList = Array.from(providersSet).sort()
            
            // Вычисляем максимальную сумму по периодам (totalQuantity для каждого периода)
            const periodTotals = periods.map(period => {
              const providerData = providersList
                .filter(providerName => !hiddenProviders.has(providerName))
                .map(providerName => {
                  const data = stats.period_providers[period][providerName]
                  return data ? (Number(data.quantity) || 0) : 0
                })
              return providerData.reduce((sum, qty) => sum + qty, 0)
            })
            
            const maxQuantity = periodTotals.length > 0 ? Math.max(...periodTotals) : 1
            
            const yAxisValues = []
            if (maxQuantity > 0) {
              for (let i = 0; i <= 4; i++) {
                yAxisValues.push((maxQuantity / 4) * i)
              }
            }
            return (
              <div className="chart-y-axis">
                {yAxisValues.reverse().map((value, idx) => (
                  <div key={idx} className="y-axis-label">
                    {formatNumber(value)}
                  </div>
                ))}
              </div>
            )
          })()}
          <div className="chart-bars">
            {(() => {
              // Если есть данные по провайдерам, используем их для разделения столбцов
              if (stats.period_providers && Object.keys(stats.period_providers).length > 0) {
                const periods = Object.keys(stats.period_providers).sort()
                const providersSet = new Set()
                
                // Собираем всех провайдеров из всех периодов
                periods.forEach(period => {
                  Object.keys(stats.period_providers[period]).forEach(providerName => {
                    providersSet.add(providerName)
                  })
                })
                
                const providersList = Array.from(providersSet).sort()
                
                // Цвета для провайдеров (те же, что и в графике по провайдерам)
                const providerColors = [
                  '#2196F3',  // Синий
                  '#4CAF50',  // Зеленый
                  '#FF9800',  // Оранжевый
                  '#9C27B0',  // Фиолетовый
                  '#F44336',  // Красный
                  '#00BCD4',  // Голубой
                  '#FFC107',  // Желтый
                  '#795548'   // Коричневый
                ]
                
                const providerColorMap = {}
                providersList.forEach((providerName, idx) => {
                  providerColorMap[providerName] = providerColors[idx % providerColors.length]
                })
                
                // Вычисляем максимальную сумму по периодам для масштабирования
                const periodTotals = periods.map(period => {
                  const providerData = providersList
                    .filter(providerName => !hiddenProviders.has(providerName))
                    .map(providerName => {
                      const data = stats.period_providers[period][providerName]
                      return data ? (Number(data.quantity) || 0) : 0
                    })
                  return providerData.reduce((sum, qty) => sum + qty, 0)
                })
                const maxQuantity = periodTotals.length > 0 ? Math.max(...periodTotals) : 1
                
                // Функция для затемнения цвета
                const hexToRgb = (hex) => {
                  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
                  return result ? {
                    r: parseInt(result[1], 16),
                    g: parseInt(result[2], 16),
                    b: parseInt(result[3], 16)
                  } : null
                }
                
                return periods.map((period, periodIdx) => {
                  // Собираем данные по провайдерам для этого периода (исключаем скрытые)
                  const providerData = providersList
                    .filter(providerName => !hiddenProviders.has(providerName))
                    .map(providerName => {
                      const data = stats.period_providers[period][providerName]
                      return {
                        name: providerName,
                        quantity: data ? (Number(data.quantity) || 0) : 0,
                        count: data ? (data.count || 0) : 0,
                        color: providerColorMap[providerName]
                      }
                    }).filter(p => p.quantity > 0) // Фильтруем только провайдеров с данными
                  
                  // Общее количество для периода
                  const totalQuantity = providerData.reduce((sum, p) => sum + p.quantity, 0)
                  const totalCount = providerData.reduce((sum, p) => sum + p.count, 0)
                  
                  // Высота столбца
                  const heightPercent = maxQuantity > 0 ? (totalQuantity / maxQuantity) * 100 : 0
                  const heightPx = Math.max(30, (heightPercent / 100) * 300)
                  
                  return (
                    <div key={periodIdx} className="chart-bar-wrapper">
                      <div className="chart-bar-stacked" style={{ height: `${heightPx}px` }}>
                        {providerData.map((provider, provIdx) => {
                          const segmentHeight = totalQuantity > 0 
                            ? (provider.quantity / totalQuantity) * 100 
                            : 0
                          const rgb = hexToRgb(provider.color)
                          const darkerColor = rgb 
                            ? `rgb(${Math.max(0, rgb.r - 30)}, ${Math.max(0, rgb.g - 30)}, ${Math.max(0, rgb.b - 30)})`
                            : provider.color
                          
                          return (
                            <div
                              key={provider.name}
                              className="chart-bar-segment"
                              style={{
                                height: `${segmentHeight}%`,
                                background: `linear-gradient(to top, ${provider.color}, ${darkerColor})`,
                                width: '100%'
                              }}
                              title={`${provider.name}: ${formatNumber(provider.quantity)} л`}
                            />
                          )
                        })}
                        <span className="chart-value">{formatNumber(totalQuantity)}</span>
                      </div>
                      <div className="chart-label" title={period}>
                        {formatPeriodLabel(period, period)}
                      </div>
                      <div className="chart-count">{totalCount} транз.</div>
                    </div>
                  )
                })
              } else {
                // Если нет данных по провайдерам, показываем обычный график
                const quantities = stats.period_data.map(d => Number(d.quantity) || 0)
                const maxQuantity = quantities.length > 0 ? Math.max(...quantities) : 1
                
                return stats.period_data.map((item, idx) => {
                  const quantity = Number(item.quantity) || 0
                  const heightPercent = maxQuantity > 0 ? (quantity / maxQuantity) * 100 : 0
                  const heightPx = Math.max(30, (heightPercent / 100) * 300)
                  
                  return (
                    <div key={idx} className="chart-bar-wrapper">
                      <div 
                        className="chart-bar" 
                        style={{ 
                          height: `${heightPx}px`,
                          backgroundColor: 'var(--color-primary)',
                          backgroundImage: 'linear-gradient(to top, var(--color-primary), var(--color-primary-hover))'
                        }}
                      >
                        <span className="chart-value">{formatNumber(quantity)}</span>
                      </div>
                      <div className="chart-label" title={item.period}>
                        {formatPeriodLabel(item.period, period)}
                      </div>
                      <div className="chart-count">{item.count} транз.</div>
                    </div>
                  )
                })
              }
            })()}
          </div>
        </div>
        
        {/* Легенда провайдеров для основного графика */}
        {stats.period_providers && Object.keys(stats.period_providers).length > 0 && stats.providers && stats.providers.length > 0 && (
          <div className="chart-legend" style={{ marginTop: 'var(--spacing-block)' }}>
            {(() => {
              const providerColors = [
                '#2196F3',  // Синий
                '#4CAF50',  // Зеленый
                '#FF9800',  // Оранжевый
                '#9C27B0',  // Фиолетовый
                '#F44336',  // Красный
                '#00BCD4',  // Голубой
                '#FFC107',  // Желтый
                '#795548'   // Коричневый
              ]
              
              const sortedProviders = [...stats.providers].sort((a, b) => 
                a.provider_name.localeCompare(b.provider_name)
              )
              
              const toggleProvider = (providerName) => {
                setHiddenProviders(prev => {
                  const newSet = new Set(prev)
                  if (newSet.has(providerName)) {
                    newSet.delete(providerName)
                  } else {
                    newSet.add(providerName)
                  }
                  return newSet
                })
              }
              
              return sortedProviders.map((provider, idx) => {
                const isHidden = hiddenProviders.has(provider.provider_name)
                return (
                  <div 
                    key={idx} 
                    className={`legend-item ${isHidden ? 'disabled' : ''}`}
                    onClick={() => toggleProvider(provider.provider_name)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        toggleProvider(provider.provider_name)
                      }
                    }}
                    aria-label={isHidden ? `Показать ${provider.provider_name}` : `Скрыть ${provider.provider_name}`}
                  >
                    <div 
                      className="legend-color" 
                      style={{ backgroundColor: providerColors[idx % providerColors.length] }}
                    />
                    <span className="legend-label">{provider.provider_name}</span>
                  </div>
                )
              })
            })()}
          </div>
        )}
      </div>

      <div className="dashboard-grid">
        {/* Лидеры по количеству */}
        <div className="dashboard-section">
          <div className="leaders-table-header">
            <h3>Топ-10 по количеству (литры)</h3>
            <button 
              className="export-leaders-btn"
              onClick={() => {
                const sortedData = [...stats.leaders_by_quantity].sort((a, b) => {
                  if (!sortConfigQuantity.field) return 0
                  const aVal = sortConfigQuantity.field === 'quantity' ? a.quantity : 
                              sortConfigQuantity.field === 'count' ? a.count : 
                              sortConfigQuantity.field === 'card_number' ? a.card_number : a.vehicle
                  const bVal = sortConfigQuantity.field === 'quantity' ? b.quantity : 
                              sortConfigQuantity.field === 'count' ? b.count : 
                              sortConfigQuantity.field === 'card_number' ? b.card_number : b.vehicle
                  const comparison = typeof aVal === 'string' 
                    ? aVal.localeCompare(bVal)
                    : aVal - bVal
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
              📥 Экспорт
            </button>
          </div>
          <div className="leaders-table">
            <table>
              <thead>
                <tr>
                  <th>№</th>
                  <th 
                    className="sortable"
                    onClick={() => handleSortQuantity('card_number')}
                    role="columnheader button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleSortQuantity('card_number')
                      }
                    }}
                  >
                    <span className="th-content">
                      Карта
                      {sortConfigQuantity.field === 'card_number' && (
                        <span className="sort-icon active">
                          {sortConfigQuantity.order === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </span>
                  </th>
                  <th 
                    className="sortable"
                    onClick={() => handleSortQuantity('vehicle')}
                    role="columnheader button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleSortQuantity('vehicle')
                      }
                    }}
                  >
                    <span className="th-content">
                      ТС
                      {sortConfigQuantity.field === 'vehicle' && (
                        <span className="sort-icon active">
                          {sortConfigQuantity.order === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </span>
                  </th>
                  <th 
                    className="sortable"
                    onClick={() => handleSortQuantity('quantity')}
                    role="columnheader button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleSortQuantity('quantity')
                      }
                    }}
                  >
                    <span className="th-content">
                      Литры
                      {sortConfigQuantity.field === 'quantity' && (
                        <span className="sort-icon active">
                          {sortConfigQuantity.order === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </span>
                  </th>
                  <th 
                    className="sortable"
                    onClick={() => handleSortQuantity('count')}
                    role="columnheader button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleSortQuantity('count')
                      }
                    }}
                  >
                    <span className="th-content">
                      Транзакций
                      {sortConfigQuantity.field === 'count' && (
                        <span className="sort-icon active">
                          {sortConfigQuantity.order === 'asc' ? '↑' : '↓'}
                        </span>
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
                    const comparison = typeof aVal === 'string' 
                      ? aVal.localeCompare(bVal)
                      : aVal - bVal
                    return sortConfigQuantity.order === 'asc' ? comparison : -comparison
                  })
                  return sortedData.map((leader, idx) => (
                    <tr key={idx}>
                      <td>{idx + 1}</td>
                      <td>
                        <Tooltip content={leader.card_number} position="top">
                          <span className="truncated-text">{truncateText(leader.card_number, 15)}</span>
                        </Tooltip>
                      </td>
                      <td>
                        <Tooltip content={leader.vehicle || '-'} position="top">
                          <span className="truncated-text">{truncateText(leader.vehicle || '-', 15)}</span>
                        </Tooltip>
                      </td>
                      <td className="number">{formatNumber(leader.quantity)}</td>
                      <td className="number">{leader.count}</td>
                    </tr>
                  ))
                })()}
              </tbody>
            </table>
          </div>
        </div>

        {/* Лидеры по количеству транзакций */}
        <div className="dashboard-section">
          <div className="leaders-table-header">
            <h3>Топ-10 по количеству транзакций</h3>
            <button 
              className="export-leaders-btn"
              onClick={() => {
                const sortedData = [...stats.leaders_by_count].sort((a, b) => {
                  if (!sortConfigCount.field) return 0
                  const aVal = sortConfigCount.field === 'quantity' ? a.quantity : 
                              sortConfigCount.field === 'count' ? a.count : 
                              sortConfigCount.field === 'card_number' ? a.card_number : a.vehicle
                  const bVal = sortConfigCount.field === 'quantity' ? b.quantity : 
                              sortConfigCount.field === 'count' ? b.count : 
                              sortConfigCount.field === 'card_number' ? b.card_number : b.vehicle
                  const comparison = typeof aVal === 'string' 
                    ? aVal.localeCompare(bVal)
                    : aVal - bVal
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
              📥 Экспорт
            </button>
          </div>
          <div className="leaders-table">
            <table>
              <thead>
                <tr>
                  <th>№</th>
                  <th 
                    className="sortable"
                    onClick={() => handleSortCount('card_number')}
                    role="columnheader button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleSortCount('card_number')
                      }
                    }}
                  >
                    <span className="th-content">
                      Карта
                      {sortConfigCount.field === 'card_number' && (
                        <span className="sort-icon active">
                          {sortConfigCount.order === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </span>
                  </th>
                  <th 
                    className="sortable"
                    onClick={() => handleSortCount('vehicle')}
                    role="columnheader button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleSortCount('vehicle')
                      }
                    }}
                  >
                    <span className="th-content">
                      ТС
                      {sortConfigCount.field === 'vehicle' && (
                        <span className="sort-icon active">
                          {sortConfigCount.order === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </span>
                  </th>
                  <th 
                    className="sortable"
                    onClick={() => handleSortCount('count')}
                    role="columnheader button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleSortCount('count')
                      }
                    }}
                  >
                    <span className="th-content">
                      Транзакций
                      {sortConfigCount.field === 'count' && (
                        <span className="sort-icon active">
                          {sortConfigCount.order === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </span>
                  </th>
                  <th 
                    className="sortable"
                    onClick={() => handleSortCount('quantity')}
                    role="columnheader button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleSortCount('quantity')
                      }
                    }}
                  >
                    <span className="th-content">
                      Литры
                      {sortConfigCount.field === 'quantity' && (
                        <span className="sort-icon active">
                          {sortConfigCount.order === 'asc' ? '↑' : '↓'}
                        </span>
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
                    const comparison = typeof aVal === 'string' 
                      ? aVal.localeCompare(bVal)
                      : aVal - bVal
                    return sortConfigCount.order === 'asc' ? comparison : -comparison
                  })
                  return sortedData.map((leader, idx) => (
                    <tr key={idx}>
                      <td>{idx + 1}</td>
                      <td>
                        <Tooltip content={leader.card_number} position="top">
                          <span className="truncated-text">{truncateText(leader.card_number, 15)}</span>
                        </Tooltip>
                      </td>
                      <td>
                        <Tooltip content={leader.vehicle || '-'} position="top">
                          <span className="truncated-text">{truncateText(leader.vehicle || '-', 15)}</span>
                        </Tooltip>
                      </td>
                      <td className="number">{leader.count}</td>
                      <td className="number">{formatNumber(leader.quantity)}</td>
                    </tr>
                  ))
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Статистика по товарам */}
      <div className="dashboard-section">
        <h3>Статистика по товарам</h3>
        <div className="products-stats">
          {stats.products.map((product, idx) => (
            <div key={idx} className="product-card">
              <div className="product-name">{product.product || 'Не указано'}</div>
              <div className="product-quantity">{formatNumber(product.quantity)} л</div>
              <div className="product-count">{product.count} транзакций</div>
            </div>
          ))}
        </div>
      </div>

      {/* Статистика по провайдерам */}
      {stats.providers && stats.providers.length > 0 && (
        <div className="dashboard-section">
          <h3>Статистика по провайдерам</h3>
          <div className="providers-stats">
            {stats.providers.map((provider, idx) => (
              <div key={idx} className="provider-card">
                <div className="provider-name">{provider.provider_name || 'Не указано'}</div>
                <div className="provider-quantity">{formatNumber(provider.quantity)} л</div>
                <div className="provider-count">{provider.count} транзакций</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* График по провайдерам в разрезе периодов */}
      {stats.period_providers && Object.keys(stats.period_providers).length > 0 && (
        <div className="dashboard-section">
          <h3>Динамика потребления по провайдерам</h3>
          <div className="chart-container">
            {/* Ось Y для второго графика */}
            {(() => {
              const periods = Object.keys(stats.period_providers).sort()
              const providersSet = new Set()
              periods.forEach(period => {
                Object.keys(stats.period_providers[period]).forEach(providerName => {
                  providersSet.add(providerName)
                })
              })
              const providersList = Array.from(providersSet).sort()
              const allQuantities = periods.flatMap(period => 
                providersList
                  .filter(providerName => !hiddenProviders.has(providerName))
                  .map(providerName => {
                    const data = stats.period_providers[period][providerName]
                    return data ? (Number(data.quantity) || 0) : 0
                  })
              )
              const maxQuantity = allQuantities.length > 0 ? Math.max(...allQuantities) : 1
              const yAxisValues = []
              if (maxQuantity > 0) {
                for (let i = 0; i <= 4; i++) {
                  yAxisValues.push((maxQuantity / 4) * i)
                }
              }
              return (
                <div className="chart-y-axis">
                  {yAxisValues.reverse().map((value, idx) => (
                    <div key={idx} className="y-axis-label">
                      {formatNumber(value)}
                    </div>
                  ))}
                </div>
              )
            })()}
            <div className="chart-bars">
              {(() => {
                const periods = Object.keys(stats.period_providers).sort()
                const providersSet = new Set()
                
                // Собираем всех провайдеров из всех периодов
                periods.forEach(period => {
                  Object.keys(stats.period_providers[period]).forEach(providerName => {
                    providersSet.add(providerName)
                  })
                })
                
                // Преобразуем Set в отсортированный массив для консистентности
                const providersList = Array.from(providersSet).sort()
                
                // Генерируем цвета для провайдеров (одинаковые для каждого провайдера во всех периодах)
                const providerColors = [
                  '#2196F3',  // Синий
                  '#4CAF50',  // Зеленый
                  '#FF9800',  // Оранжевый
                  '#9C27B0',  // Фиолетовый
                  '#F44336',  // Красный
                  '#00BCD4',  // Голубой
                  '#FFC107',  // Желтый
                  '#795548'   // Коричневый
                ]
                
                // Создаем мапу цветов для каждого провайдера
                const providerColorMap = {}
                providersList.forEach((providerName, idx) => {
                  providerColorMap[providerName] = providerColors[idx % providerColors.length]
                })
                
                // Вычисляем максимальное значение для масштабирования (только видимые провайдеры)
                const allQuantities = periods.flatMap(period => 
                  providersList
                    .filter(providerName => !hiddenProviders.has(providerName))
                    .map(providerName => {
                      const data = stats.period_providers[period][providerName]
                      return data ? (Number(data.quantity) || 0) : 0
                    })
                )
                const maxQuantity = allQuantities.length > 0 ? Math.max(...allQuantities) : 1
                
                return periods.map((period, periodIdx) => {
                  const periodProviders = providersList
                    .filter(providerName => !hiddenProviders.has(providerName))
                    .map((providerName) => {
                    const data = stats.period_providers[period][providerName]
                    const quantity = data ? (Number(data.quantity) || 0) : 0
                    const heightPercent = maxQuantity > 0 ? (quantity / maxQuantity) * 100 : 0
                    const heightPx = Math.max(20, (heightPercent / 100) * 250)
                    const color = providerColorMap[providerName]
                    
                    // Создаем градиент для цвета провайдера
                    const colorLight = color
                    const colorDark = color
                    // Немного затемняем цвет для градиента
                    const hexToRgb = (hex) => {
                      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
                      return result ? {
                        r: parseInt(result[1], 16),
                        g: parseInt(result[2], 16),
                        b: parseInt(result[3], 16)
                      } : null
                    }
                    const rgb = hexToRgb(color)
                    const darkerColor = rgb 
                      ? `rgb(${Math.max(0, rgb.r - 30)}, ${Math.max(0, rgb.g - 30)}, ${Math.max(0, rgb.b - 30)})`
                      : color
                    
                    return (
                      <div key={providerName} className="chart-bar-group">
                        <div 
                          className="chart-bar" 
                          style={{ 
                            height: `${heightPx}px`,
                            background: `linear-gradient(to top, ${color}, ${darkerColor})`,
                            width: `${100 / providersList.length}%`
                          }}
                          title={`${providerName}: ${formatNumber(quantity)} л`}
                        >
                          {quantity > 0 && (
                            <span className="chart-value-small">{formatNumber(quantity)}</span>
                          )}
                        </div>
                      </div>
                    )
                  })
                  
                  return (
                    <div key={periodIdx} className="chart-bar-wrapper">
                      <div className="chart-bars-group">
                        {periodProviders}
                      </div>
                      <div className="chart-label" title={period}>
                        {formatPeriodLabel(period, period)}
                      </div>
                    </div>
                  )
                })
              })()}
            </div>
          </div>
          
          {/* Легенда провайдеров */}
          {stats.providers && stats.providers.length > 0 && (
            <div className="chart-legend">
              {(() => {
                // Используем те же цвета, что и в графике
                const providerColors = [
                  '#2196F3',  // Синий
                  '#4CAF50',  // Зеленый
                  '#FF9800',  // Оранжевый
                  '#9C27B0',  // Фиолетовый
                  '#F44336',  // Красный
                  '#00BCD4',  // Голубой
                  '#FFC107',  // Желтый
                  '#795548'   // Коричневый
                ]
                
                // Сортируем провайдеров так же, как в графике
                const sortedProviders = [...stats.providers].sort((a, b) => 
                  a.provider_name.localeCompare(b.provider_name)
                )
                
                const toggleProvider = (providerName) => {
                  setHiddenProviders(prev => {
                    const newSet = new Set(prev)
                    if (newSet.has(providerName)) {
                      newSet.delete(providerName)
                    } else {
                      newSet.add(providerName)
                    }
                    return newSet
                  })
                }
                
                return sortedProviders.map((provider, idx) => {
                  const isHidden = hiddenProviders.has(provider.provider_name)
                  return (
                    <div 
                      key={idx} 
                      className={`legend-item ${isHidden ? 'disabled' : ''}`}
                      onClick={() => toggleProvider(provider.provider_name)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          toggleProvider(provider.provider_name)
                        }
                      }}
                      aria-label={isHidden ? `Показать ${provider.provider_name}` : `Скрыть ${provider.provider_name}`}
                    >
                      <div 
                        className="legend-color" 
                        style={{ backgroundColor: providerColors[idx % providerColors.length] }}
                      />
                      <span className="legend-label">{provider.provider_name}</span>
                    </div>
                  )
                })
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default Dashboard

