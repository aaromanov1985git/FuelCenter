import React, { useEffect, useRef } from 'react'
import './ContextMenu.css'

/**
 * Компонент контекстного меню (правый клик)
 * 
 * @param {boolean} isOpen - Открыто ли меню
 * @param {number} x - X координата
 * @param {number} y - Y координата
 * @param {array} items - Массив элементов меню [{ label, icon?, onClick, disabled?, divider? }]
 * @param {function} onClose - Обработчик закрытия меню
 */
const ContextMenu = ({ isOpen, x, y, items = [], onClose }) => {
  const menuRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose()
      }
    }

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    // Корректировка позиции, чтобы меню не выходило за границы экрана
    const adjustPosition = () => {
      if (!menuRef.current) return

      const rect = menuRef.current.getBoundingClientRect()
      const windowWidth = window.innerWidth
      const windowHeight = window.innerHeight

      let adjustedX = x
      let adjustedY = y

      if (rect.right > windowWidth) {
        adjustedX = windowWidth - rect.width - 10
      }
      if (rect.bottom > windowHeight) {
        adjustedY = windowHeight - rect.height - 10
      }
      if (adjustedX < 0) adjustedX = 10
      if (adjustedY < 0) adjustedY = 10

      menuRef.current.style.left = `${adjustedX}px`
      menuRef.current.style.top = `${adjustedY}px`
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    
    // Корректируем позицию после рендера
    setTimeout(adjustPosition, 0)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, x, y, onClose])

  if (!isOpen || items.length === 0) {
    return null
  }

  const handleItemClick = (item) => {
    if (!item.disabled && item.onClick) {
      item.onClick()
      onClose()
    }
  }

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{
        left: `${x}px`,
        top: `${y}px`
      }}
      role="menu"
      aria-label="Контекстное меню"
    >
      {items.map((item, index) => {
        if (item.divider) {
          return <div key={`divider-${index}`} className="context-menu-divider" />
        }

        return (
          <button
            key={index}
            className={`context-menu-item ${item.disabled ? 'disabled' : ''}`}
            onClick={() => handleItemClick(item)}
            disabled={item.disabled}
            role="menuitem"
          >
            {item.icon && (
              <span className="context-menu-icon">{item.icon}</span>
            )}
            <span className="context-menu-label">{item.label}</span>
            {item.shortcut && (
              <span className="context-menu-shortcut">{item.shortcut}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export default ContextMenu

