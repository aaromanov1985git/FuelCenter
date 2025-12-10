import React from 'react'
import './Skeleton.css'

/**
 * Компонент Skeleton для отображения состояния загрузки
 * 
 * @param {string} variant - Вариант: 'text', 'circular', 'rectangular', 'table', 'card'
 * @param {number} width - Ширина (в px, %, или строка)
 * @param {number} height - Высота (в px, %, или строка)
 * @param {number} lines - Количество строк (для variant='text')
 * @param {boolean} animated - Показывать ли анимацию пульсации
 */

const Skeleton = ({ 
  variant = 'rectangular', 
  width, 
  height, 
  lines = 1,
  animated = true,
  className = ''
}) => {
  const style = {}
  
  if (width) {
    style.width = typeof width === 'number' ? `${width}px` : width
  }
  
  if (height) {
    style.height = typeof height === 'number' ? `${height}px` : height
  }

  const baseClassName = `skeleton skeleton-${variant} ${animated ? 'skeleton-animated' : ''} ${className}`.trim()

  if (variant === 'text') {
    return (
      <div className="skeleton-text-container">
        {Array.from({ length: lines }).map((_, index) => (
          <div
            key={index}
            className={`${baseClassName} ${index < lines - 1 ? 'skeleton-text-line' : 'skeleton-text-last-line'}`}
            style={index === lines - 1 ? style : {}}
          />
        ))}
      </div>
    )
  }

  return (
    <div 
      className={baseClassName}
      style={style}
      aria-busy="true"
      aria-live="polite"
    />
  )
}

/**
 * Skeleton для таблицы
 */
export const SkeletonTable = ({ rows = 5, columns = 5 }) => {
  return (
    <div className="skeleton-table">
      <div className="skeleton-table-header">
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={index} variant="rectangular" height={40} width="100%" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="skeleton-table-row">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton 
              key={colIndex} 
              variant="rectangular" 
              height={48} 
              width="100%" 
            />
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * Skeleton для карточки
 */
export const SkeletonCard = () => {
  return (
    <div className="skeleton-card">
      <Skeleton variant="rectangular" height={200} width="100%" />
      <div className="skeleton-card-content">
        <Skeleton variant="text" width="60%" lines={1} />
        <Skeleton variant="text" width="100%" lines={2} />
        <Skeleton variant="rectangular" height={36} width={100} />
      </div>
    </div>
  )
}

/**
 * Skeleton для списка (для VehiclesList, FuelCardsList и т.д.)
 */
export const SkeletonList = ({ items = 5 }) => {
  return (
    <div className="skeleton-list">
      {Array.from({ length: items }).map((_, index) => (
        <div key={index} className="skeleton-list-item">
          <Skeleton variant="circular" width={40} height={40} />
          <div className="skeleton-list-content">
            <Skeleton variant="text" width="40%" lines={1} />
            <Skeleton variant="text" width="60%" lines={1} />
          </div>
          <Skeleton variant="rectangular" height={32} width={80} />
        </div>
      ))}
    </div>
  )
}

export default Skeleton

