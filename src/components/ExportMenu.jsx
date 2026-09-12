import React, { useState, useRef, useEffect } from 'react'
import IconButton from './IconButton'
import { Button } from './ui'
import Icon from './ui/Icon'
import { logger } from '../utils/logger'
import { exportToCSV, exportToJSON, exportToTXT, exportToPDF } from '../utils/exportUtils'
import './ExportMenu.css'

/**
 * Компонент меню экспорта данных в различные форматы
 * 
 * @param {Array} data - Данные для экспорта
 * @param {Array} headers - Заголовки колонок
 * @param {function} onExportExcel - Обработчик экспорта в Excel (опционально)
 * @param {string} filename - Базовое имя файла (без расширения)
 */
const ExportMenu = ({ data, headers, onExportExcel, filename = 'transactions' }) => {
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

  const handleExport = async (format) => {
    try {
      const exportFn = getExportFunction(format)
      if (!exportFn) {
        logger.error(`Экспорт в формат ${format} не поддерживается`)
        return
      }
      
      await exportFn()
      setIsOpen(false)
    } catch (error) {
      logger.error(`Ошибка экспорта в ${format}:`, error)
      throw error
    }
  }

  // Получение функции экспорта для формата
  const getExportFunction = (format) => {
    switch (format) {
      case 'excel':
        return onExportExcel
      case 'csv':
        return () => exportToCSV(data, headers, filename)
      case 'json':
        return () => exportToJSON(data, filename)
      case 'txt':
        return () => exportToTXT(data, headers, filename)
      case 'pdf':
        return () => exportToPDF(data, headers, `Экспорт транзакций`)
      default:
        return null
    }
  }

  const exportOptions = [
    {
      id: 'excel',
      label: 'Excel (.xlsx)',
      icon: 'chart',
      available: !!onExportExcel
    },
    {
      id: 'csv',
      label: 'CSV (.csv)',
      icon: 'rows',
      available: true
    },
    {
      id: 'json',
      label: 'JSON (.json)',
      icon: 'box',
      available: true
    },
    {
      id: 'txt',
      label: 'Текст (.txt)',
      icon: 'file',
      available: true
    },
    {
      id: 'pdf',
      label: 'PDF (.pdf)',
      icon: 'layers',
      available: true
    }
  ]

  const availableOptions = exportOptions.filter(opt => opt.available)

  return (
    <div className={`export-menu ${isOpen ? 'dropdown-open' : ''}`} ref={menuRef}>
      <div className="export-menu-button-wrapper">
        <IconButton
          icon="export"
          variant="primary"
          onClick={() => setIsOpen(!isOpen)}
          title="Экспорт данных (Excel, CSV, JSON, TXT, PDF)"
          size="medium"
          className="export-menu-icon-button"
        />
        {/* Один и тот же залитый каре был скопирован в оба меню, но у
            export-menu-arrow размер перебивает CSS (10px), а у
            clear-menu-arrow его не было — в одной панели рядом стояли 10px и
            12px. Теперь оба 10px из примитива; strokeWidth 2.4 при 10px даёт
            отрисованный штрих 1.5px (тот же приём, что в ThemeToggle). */}
        <Icon name="chevron-down" size={10} strokeWidth={2.4} className="export-menu-arrow" />
      </div>

      {isOpen && (
        <div className="export-menu-dropdown">
          {availableOptions.map(option => (
            <Button
              key={option.id}
              variant="ghost"
              size="sm"
              onClick={() => handleExport(option.id)}
              className="export-menu-item"
              style={{ 
                width: '100%', 
                justifyContent: 'flex-start',
                padding: 'var(--padding-small) var(--padding-element)'
              }}
            >
              <span className="export-menu-icon"><Icon name={option.icon} size={16} /></span>
              <span className="export-menu-label">{option.label}</span>
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

export default ExportMenu

