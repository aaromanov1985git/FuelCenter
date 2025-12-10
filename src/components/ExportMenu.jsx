import React, { useState, useRef, useEffect } from 'react'
import IconButton from './IconButton'
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
        console.error(`Экспорт в формат ${format} не поддерживается`)
        return
      }
      
      await exportFn()
      setIsOpen(false)
    } catch (error) {
      console.error(`Ошибка экспорта в ${format}:`, error)
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
      icon: '📊',
      available: !!onExportExcel
    },
    {
      id: 'csv',
      label: 'CSV (.csv)',
      icon: '📄',
      available: true
    },
    {
      id: 'json',
      label: 'JSON (.json)',
      icon: '📋',
      available: true
    },
    {
      id: 'txt',
      label: 'Текст (.txt)',
      icon: '📝',
      available: true
    },
    {
      id: 'pdf',
      label: 'PDF (.pdf)',
      icon: '📑',
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
          title="Экспорт данных"
          size="medium"
          className="export-menu-icon-button"
        />
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 20 20" fill="currentColor" className="export-menu-arrow">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </div>

      {isOpen && (
        <div className="export-menu-dropdown">
          {availableOptions.map(option => (
            <button
              key={option.id}
              className="export-menu-item"
              onClick={() => handleExport(option.id)}
            >
              <span className="export-menu-icon">{option.icon}</span>
              <span className="export-menu-label">{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default ExportMenu

