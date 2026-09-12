import React, { useState, useRef, useEffect } from 'react'
import IconButton from './IconButton'
import { Button } from './ui'
import Icon from './ui/Icon'
import './ClearMenu.css'

/**
 * Компонент меню очистки транзакций
 * 
 * @param {function} onClearAll - Обработчик очистки всех транзакций
 * @param {function} onClearByProvider - Обработчик очистки по провайдеру
 * @param {boolean} disabled - Отключено ли меню
 */
const ClearMenu = ({ onClearAll, onClearByProvider, disabled = false }) => {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleClearAll = () => {
    onClearAll()
    setIsOpen(false)
  }

  const handleClearByProvider = () => {
    onClearByProvider()
    setIsOpen(false)
  }

  const clearOptions = [
    {
      id: 'all',
      label: 'Очистить всю БД',
      description: 'Удалить все транзакции',
      icon: 'trash',
      onClick: handleClearAll
    },
    {
      id: 'provider',
      label: 'Очистить по провайдеру',
      description: 'Удалить транзакции выбранного провайдера',
      icon: 'filter',
      onClick: handleClearByProvider
    }
  ]

  return (
    <div className={`clear-menu ${isOpen ? 'dropdown-open' : ''}`} ref={menuRef}>
      <div className="clear-menu-button-wrapper">
        <IconButton
          icon="delete"
          variant="error"
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled}
          title="Удалить транзакции (все или по провайдеру)"
          size="medium"
          className="clear-menu-icon-button"
        />
        {/* Один и тот же залитый каре был скопирован в оба меню, но у
            export-menu-arrow размер перебивает CSS (10px), а у
            clear-menu-arrow его не было — в одной панели рядом стояли 10px и
            12px. Теперь оба 10px из примитива; strokeWidth 2.4 при 10px даёт
            отрисованный штрих 1.5px (тот же приём, что в ThemeToggle). */}
        <Icon name="chevron-down" size={10} strokeWidth={2.4} className="clear-menu-arrow" />
      </div>

      {isOpen && (
        <div className="clear-menu-dropdown">
          {clearOptions.map(option => (
            <Button
              key={option.id}
              variant="ghost"
              size="sm"
              onClick={option.onClick}
              className="clear-menu-item"
              style={{ 
                width: '100%', 
                justifyContent: 'flex-start',
                padding: '0.75rem 1rem',
                flexDirection: 'row',
                alignItems: 'flex-start',
                minHeight: '60px',
                whiteSpace: 'normal'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', width: '100%', minHeight: '100%' }}>
                <span className="clear-menu-icon" style={{ flexShrink: 0, marginTop: '2px' }}><Icon name={option.icon} size={16} /></span>
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                  <span className="clear-menu-label">{option.label}</span>
                  <span className="clear-menu-description">{option.description}</span>
                </div>
              </div>
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

export default ClearMenu
