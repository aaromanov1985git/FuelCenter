import React, { useState, useRef, useEffect } from 'react'
import './Tooltip.css'

/**
 * Компонент Tooltip с позиционированием
 * 
 * @param {React.ReactNode} children - Элемент, на который наводится tooltip
 * @param {string|React.ReactNode} content - Текст tooltip или React элемент
 * @param {string} title - Заголовок tooltip (опционально)
 * @param {string} position - Позиция: 'top', 'bottom', 'left', 'right' (по умолчанию 'top')
 * @param {number} delay - Задержка показа в миллисекундах (по умолчанию 200)
 * @param {boolean} disabled - Отключить tooltip
 * @param {string} className - Дополнительные CSS классы
 * @param {number} maxWidth - Максимальная ширина tooltip в пикселях (по умолчанию 250)
 */
const Tooltip = ({
  children,
  content,
  title = null,
  position = 'top',
  delay = 200,
  disabled = false,
  className = '',
  maxWidth = 250
}) => {
  const [isVisible, setIsVisible] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 })
  const tooltipRef = useRef(null)
  const wrapperRef = useRef(null)
  const timeoutRef = useRef(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  // Вычисление позиции tooltip
  const calculatePosition = () => {
    if (!wrapperRef.current || !tooltipRef.current) return

    const wrapperRect = wrapperRef.current.getBoundingClientRect()
    const tooltipRect = tooltipRef.current.getBoundingClientRect()

    let top = 0
    let left = 0

    switch (position) {
      case 'top':
        top = wrapperRect.top - tooltipRect.height - 8
        left = wrapperRect.left + (wrapperRect.width / 2) - (tooltipRect.width / 2)
        break
      case 'bottom':
        top = wrapperRect.bottom + 8
        left = wrapperRect.left + (wrapperRect.width / 2) - (tooltipRect.width / 2)
        break
      case 'left':
        top = wrapperRect.top + (wrapperRect.height / 2) - (tooltipRect.height / 2)
        left = wrapperRect.left - tooltipRect.width - 8
        break
      case 'right':
        top = wrapperRect.top + (wrapperRect.height / 2) - (tooltipRect.height / 2)
        left = wrapperRect.right + 8
        break
      default:
        top = wrapperRect.top - tooltipRect.height - 8
        left = wrapperRect.left + (wrapperRect.width / 2) - (tooltipRect.width / 2)
    }

    // Корректировка позиции, чтобы tooltip не выходил за границы экрана
    const margin = 8
    if (left < margin) {
      left = margin
    } else if (left + tooltipRect.width > window.innerWidth - margin) {
      left = window.innerWidth - tooltipRect.width - margin
    }

    if (top < margin) {
      top = margin
    } else if (top + tooltipRect.height > window.innerHeight - margin) {
      top = window.innerHeight - tooltipRect.height - margin
    }

    setTooltipPosition({ top, left })
  }

  const handleMouseEnter = () => {
    if (disabled || !content) return

    timeoutRef.current = setTimeout(() => {
      setIsVisible(true)
      // Небольшая задержка для расчета позиции после рендера
      setTimeout(() => {
        calculatePosition()
      }, 10)
    }, delay)
  }

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setIsVisible(false)
  }

  // Обновление позиции при скролле и ресайзе
  useEffect(() => {
    if (!isVisible) return

    const updatePosition = () => {
      calculatePosition()
    }

    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)

    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [isVisible, position])

  if (!content || disabled) {
    return children
  }

  return (
    <>
      <div
        ref={wrapperRef}
        className={`tooltip-wrapper ${className}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{ display: 'inline-block' }}
      >
        {children}
      </div>
      {isVisible && (
        <div
          ref={tooltipRef}
          className={`tooltip tooltip-${position} ${isVisible ? 'tooltip-visible' : ''}`}
          style={{
            position: 'fixed',
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
            maxWidth: `${maxWidth}px`
          }}
          role="tooltip"
        >
          {title && (
            <div className="tooltip-title">{title}</div>
          )}
          <div className="tooltip-content">
            {typeof content === 'string' ? content : content}
          </div>
          <div className={`tooltip-arrow tooltip-arrow-${position}`} />
        </div>
      )}
    </>
  )
}

export default Tooltip

