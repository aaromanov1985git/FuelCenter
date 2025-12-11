import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './Tooltip.css';

const Tooltip = ({
  children,
  content,
  position = 'top', // 'top', 'bottom', 'left', 'right'
  delay = 200,
  disabled = false,
  className = '',
  ...props
}) => {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const timeoutRef = useRef(null);

  // Вычисление позиции тултипа
  const calculatePosition = () => {
    if (!triggerRef.current || !tooltipRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    const gap = 8; // Отступ от элемента

    let top = 0;
    let left = 0;

    switch (position) {
      case 'top':
        top = triggerRect.top + scrollY - tooltipRect.height - gap;
        left = triggerRect.left + scrollX + (triggerRect.width - tooltipRect.width) / 2;
        break;
      case 'bottom':
        top = triggerRect.bottom + scrollY + gap;
        left = triggerRect.left + scrollX + (triggerRect.width - tooltipRect.width) / 2;
        break;
      case 'left':
        top = triggerRect.top + scrollY + (triggerRect.height - tooltipRect.height) / 2;
        left = triggerRect.left + scrollX - tooltipRect.width - gap;
        break;
      case 'right':
        top = triggerRect.top + scrollY + (triggerRect.height - tooltipRect.height) / 2;
        left = triggerRect.right + scrollX + gap;
        break;
      default:
        break;
    }

    // Проверка границ экрана
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Корректировка по горизонтали
    if (left < scrollX + 8) {
      left = scrollX + 8;
    } else if (left + tooltipRect.width > scrollX + viewportWidth - 8) {
      left = scrollX + viewportWidth - tooltipRect.width - 8;
    }

    // Корректировка по вертикали
    if (top < scrollY + 8) {
      top = scrollY + 8;
    } else if (top + tooltipRect.height > scrollY + viewportHeight - 8) {
      top = scrollY + viewportHeight - tooltipRect.height - 8;
    }

    setCoords({ top, left });
  };

  // Показать тултип с задержкой
  const handleMouseEnter = () => {
    if (disabled || !content) return;

    timeoutRef.current = setTimeout(() => {
      setVisible(true);
    }, delay);
  };

  // Скрыть тултип
  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setVisible(false);
  };

  // Пересчет позиции при показе или изменении размера
  useEffect(() => {
    if (visible) {
      calculatePosition();

      const handleResize = () => calculatePosition();
      const handleScroll = () => calculatePosition();

      window.addEventListener('resize', handleResize);
      window.addEventListener('scroll', handleScroll, true);

      return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('scroll', handleScroll, true);
      };
    }
  }, [visible, position, content]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const tooltipElement = visible && content && (
    <div
      ref={tooltipRef}
      className={`ui-tooltip ui-tooltip-${position} ${className}`}
      style={{
        top: `${coords.top}px`,
        left: `${coords.left}px`
      }}
      role="tooltip"
      {...props}
    >
      <div className="ui-tooltip-content">{content}</div>
      <div className="ui-tooltip-arrow"></div>
    </div>
  );

  return (
    <>
      <span
        ref={triggerRef}
        className="ui-tooltip-trigger"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleMouseEnter}
        onBlur={handleMouseLeave}
      >
        {children}
      </span>
      {typeof document !== 'undefined' &&
        createPortal(tooltipElement, document.body)}
    </>
  );
};

export default Tooltip;
