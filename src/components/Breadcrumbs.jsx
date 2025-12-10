import React from 'react'
import './Breadcrumbs.css'

/**
 * Компонент Breadcrumbs (хлебные крошки) для навигации
 * 
 * @param {array} items - Массив элементов навигации [{ label, path?, onClick? }]
 * @param {string} separator - Разделитель между элементами (по умолчанию '>')
 * @param {string} className - Дополнительные CSS классы
 * 
 * @example
 * <Breadcrumbs 
 *   items={[
 *     { label: 'Главная', path: '/' },
 *     { label: 'Провайдеры', path: '/providers' },
 *     { label: 'РП-Газпром', onClick: () => handleClick() }
 *   ]}
 * />
 */
const Breadcrumbs = ({ items = [], separator = '>', className = '' }) => {
  if (!items || items.length === 0) {
    return null
  }

  const handleClick = (item, index) => {
    if (item.onClick) {
      item.onClick(item, index)
    } else if (item.path) {
      // Если нужна навигация через router, можно добавить
      // navigate(item.path)
    }
  }

  return (
    <nav className={`breadcrumbs ${className}`} aria-label="Breadcrumb">
      <ol className="breadcrumbs-list">
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          const isClickable = item.onClick || item.path
          
          return (
            <li key={index} className="breadcrumbs-item">
              {index > 0 && (
                <span className="breadcrumbs-separator" aria-hidden="true">
                  {separator}
                </span>
              )}
              {isLast ? (
                <span 
                  className="breadcrumbs-current" 
                  aria-current="page"
                >
                  {item.label}
                </span>
              ) : isClickable ? (
                <button
                  className="breadcrumbs-link"
                  onClick={() => handleClick(item, index)}
                  type="button"
                >
                  {item.label}
                </button>
              ) : (
                <span className="breadcrumbs-text">{item.label}</span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export default Breadcrumbs

