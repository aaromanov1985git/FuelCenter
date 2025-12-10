import React, { useState, useRef } from 'react'
import './AdvancedSearch.css'

/**
 * Компонент расширенного поиска с фильтрами
 * 
 * @param {object} filters - Текущие значения фильтров
 * @param {function} onFiltersChange - Обработчик изменения фильтров
 * @param {function} onClear - Обработчик очистки фильтров
 * @param {boolean} loading - Состояние загрузки
 * @param {object} filterConfig - Конфигурация фильтров [{ key, label, placeholder, type }]
 */
const AdvancedSearch = ({
  filters = {},
  onFiltersChange,
  onClear,
  loading = false,
  filterConfig = []
}) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [activeFiltersCount, setActiveFiltersCount] = useState(0)
  const inputRefs = useRef({})

  // Подсчет активных фильтров
  React.useEffect(() => {
    const count = Object.values(filters).filter(value => 
      value !== null && value !== undefined && value !== ''
    ).length
    setActiveFiltersCount(count)
  }, [filters])

  const handleFilterChange = (key, value) => {
    onFiltersChange({
      ...filters,
      [key]: value
    })
  }


  const handleClear = () => {
    const clearedFilters = {}
    filterConfig.forEach(config => {
      clearedFilters[config.key] = ''
    })
    onFiltersChange(clearedFilters)
    if (onClear) {
      onClear()
    }
  }

  const handleToggle = () => {
    setIsExpanded(!isExpanded)
  }

  return (
    <div className="advanced-search">
      <div className="advanced-search-header">
        <button
          className="advanced-search-toggle"
          onClick={handleToggle}
          type="button"
          aria-expanded={isExpanded}
        >
          <span className="advanced-search-icon">
            {isExpanded ? '▼' : '▶'}
          </span>
          <span className="advanced-search-title">Расширенный поиск</span>
          {activeFiltersCount > 0 && (
            <span className="advanced-search-badge">{activeFiltersCount}</span>
          )}
        </button>
        {activeFiltersCount > 0 && (
          <button
            className="advanced-search-clear"
            onClick={handleClear}
            type="button"
            disabled={loading}
            title="Очистить все фильтры"
          >
            Очистить
          </button>
        )}
      </div>

      {isExpanded && (
        <div className="advanced-search-content">
          <div className="advanced-search-filters">
            {filterConfig.map(config => (
              <div key={config.key} className="advanced-search-filter">
                <label htmlFor={`filter-${config.key}`} className="advanced-search-label">
                  {config.label}
                </label>
                {config.type === 'select' ? (
                  <select
                    id={`filter-${config.key}`}
                    value={filters[config.key] || ''}
                    onChange={(e) => handleFilterChange(config.key, e.target.value)}
                    disabled={loading}
                    className="advanced-search-select"
                  >
                    <option value="">Все</option>
                    {config.options?.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="advanced-search-input-wrapper">
                    <input
                      ref={(el) => { inputRefs.current[config.key] = el }}
                      id={`filter-${config.key}`}
                      type={config.type || 'text'}
                      value={filters[config.key] || ''}
                      onChange={(e) => handleFilterChange(config.key, e.target.value)}
                      placeholder={config.placeholder || `Введите ${config.label.toLowerCase()}`}
                      disabled={loading}
                      className="advanced-search-input"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default AdvancedSearch

