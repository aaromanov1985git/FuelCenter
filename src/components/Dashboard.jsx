import React, { useState, useEffect } from 'react'
import Skeleton, { SkeletonCard } from './Skeleton'
import { useToast } from './ToastContainer'
import Tooltip from './Tooltip'
import { authFetch } from '../utils/api'
import './Dashboard.css'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

const Dashboard = () => {
  const { error: showError } = useToast()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [period, setPeriod] = useState('month') // day, month, year

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

  useEffect(() => {
    loadStats()
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
                
                // Вычисляем максимальное значение для масштабирования
                const allQuantities = periods.flatMap(period => 
                  providersList.map(providerName => {
                    const data = stats.period_providers[period][providerName]
                    return data ? (Number(data.quantity) || 0) : 0
                  })
                )
                const maxQuantity = allQuantities.length > 0 ? Math.max(...allQuantities) : 1
                
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
                  // Собираем данные по провайдерам для этого периода
                  const providerData = providersList.map(providerName => {
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
              
              return sortedProviders.map((provider, idx) => (
                <div key={idx} className="legend-item">
                  <div 
                    className="legend-color" 
                    style={{ backgroundColor: providerColors[idx % providerColors.length] }}
                  />
                  <span className="legend-label">{provider.provider_name}</span>
                </div>
              ))
            })()}
          </div>
        )}
      </div>

      <div className="dashboard-grid">
        {/* Лидеры по количеству */}
        <div className="dashboard-section">
          <h3>Топ-10 по количеству (литры)</h3>
          <div className="leaders-table">
            <table>
              <thead>
                <tr>
                  <th>№</th>
                  <th>Карта</th>
                  <th>ТС</th>
                  <th>Литры</th>
                  <th>Транзакций</th>
                </tr>
              </thead>
              <tbody>
                {stats.leaders_by_quantity.map((leader, idx) => (
                  <tr key={idx}>
                    <td>{idx + 1}</td>
                    <td>{leader.card_number}</td>
                    <td>{leader.vehicle}</td>
                    <td className="number">{formatNumber(leader.quantity)}</td>
                    <td className="number">{leader.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Лидеры по количеству транзакций */}
        <div className="dashboard-section">
          <h3>Топ-10 по количеству транзакций</h3>
          <div className="leaders-table">
            <table>
              <thead>
                <tr>
                  <th>№</th>
                  <th>Карта</th>
                  <th>ТС</th>
                  <th>Транзакций</th>
                  <th>Литры</th>
                </tr>
              </thead>
              <tbody>
                {stats.leaders_by_count.map((leader, idx) => (
                  <tr key={idx}>
                    <td>{idx + 1}</td>
                    <td>{leader.card_number}</td>
                    <td>{leader.vehicle}</td>
                    <td className="number">{leader.count}</td>
                    <td className="number">{formatNumber(leader.quantity)}</td>
                  </tr>
                ))}
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
                
                // Вычисляем максимальное значение для масштабирования
                const allQuantities = periods.flatMap(period => 
                  providersList.map(providerName => {
                    const data = stats.period_providers[period][providerName]
                    return data ? (Number(data.quantity) || 0) : 0
                  })
                )
                const maxQuantity = allQuantities.length > 0 ? Math.max(...allQuantities) : 1
                
                return periods.map((period, periodIdx) => {
                  const periodProviders = providersList.map((providerName) => {
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
                
                return sortedProviders.map((provider, idx) => (
                  <div key={idx} className="legend-item">
                    <div 
                      className="legend-color" 
                      style={{ backgroundColor: providerColors[idx % providerColors.length] }}
                    />
                    <span className="legend-label">{provider.provider_name}</span>
                  </div>
                ))
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default Dashboard

