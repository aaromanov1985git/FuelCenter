import React, { useState, useRef } from 'react'
import { Button, Input, Select, Badge } from './ui'
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
    // Логируем изменение фильтра для отладки
    console.log('AdvancedSearch: изменение фильтра', { key, value, type: typeof value })
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
        <Button
          variant="secondary"
          onClick={handleToggle}
          aria-expanded={isExpanded}
          className="advanced-search-toggle-button"
        >
          <span className="advanced-search-toggle-content">
            <span>{isExpanded ? '▼' : '▶'}</span>
            <span>Расширенный поиск</span>
            {activeFiltersCount > 0 && (
              <Badge variant="primary" size="sm">{activeFiltersCount}</Badge>
            )}
          </span>
        </Button>
        {activeFiltersCount > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleClear}
            disabled={loading}
            title="Очистить все фильтры"
          >
            Очистить
          </Button>
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
                  <Select
                    id={`filter-${config.key}`}
                    value={filters[config.key] || ''}
                    onChange={(value) => handleFilterChange(config.key, value)}
                    disabled={loading}
                    options={[
                      { value: '', label: 'Все' },
                      ...(config.options || [])
                    ]}
                    fullWidth
                  />
                ) : (
                  <Input
                    ref={(el) => { inputRefs.current[config.key] = el }}
                    id={`filter-${config.key}`}
                    type={config.type || 'text'}
                    value={filters[config.key] || ''}
                    onChange={(e) => handleFilterChange(config.key, e.target.value)}
                    placeholder={config.placeholder || `Введите ${config.label.toLowerCase()}`}
                    disabled={loading}
                    fullWidth
                  />
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

