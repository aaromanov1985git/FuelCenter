import { useEffect } from 'react'
import { logger } from '../utils/logger'

const isTextInput = (target) =>
  target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

const focusSearchInput = () => {
  const searchInput = document.querySelector('.filter-input')
  if (searchInput) {
    searchInput.focus()
    searchInput.select()
  }
}

const clickButtonByTitle = (selector) => {
  const button = document.querySelector(selector)
  if (button && !button.disabled) button.click()
}

const closeOpenModal = () => {
  const modal = document.querySelector('.modal-overlay.active, .confirm-modal-overlay, [aria-modal="true"]')
  if (!modal) return
  const closeButton = modal.querySelector('button[aria-label="Закрыть"], .modal-close')
  if (closeButton) closeButton.click()
}

export const useKeyboardShortcuts = ({
  activeTab,
  hasData,
  toggleSidebar,
  downloadExcel,
  showColumnSettings,
  setShowColumnSettings,
}) => {
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isInput = isTextInput(e.target)
      const mod = e.ctrlKey || e.metaKey

      if (mod && e.key === 'b') {
        e.preventDefault()
        toggleSidebar()
      } else if (mod && e.key === 'k') {
        e.preventDefault()
        focusSearchInput()
        logger.debug('Поиск через keyboard shortcut')
      } else if (mod && e.key === 's' && !isInput) {
        e.preventDefault()
        clickButtonByTitle('button[title*="Сохранить"], button[title*="Создать"]')
        logger.debug('Сохранение через keyboard shortcut')
      } else if (mod && e.key === 'n' && !isInput) {
        e.preventDefault()
        if (activeTab !== 'dashboard') {
          clickButtonByTitle('button[title*="Добавить"], button[title*="Создать"]')
        }
        logger.debug('Создание нового элемента через keyboard shortcut')
      } else if (mod && e.key === 'f' && !isInput) {
        e.preventDefault()
        focusSearchInput()
        logger.debug('Поиск/фильтр через keyboard shortcut')
      } else if (mod && e.key === 'e' && !isInput) {
        e.preventDefault()
        if (activeTab === 'transactions' && hasData) downloadExcel()
        logger.debug('Экспорт через keyboard shortcut')
      } else if (e.key === 'Escape') {
        closeOpenModal()
        if (showColumnSettings) setShowColumnSettings(false)
        logger.debug('Закрытие через Escape')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeTab, hasData, toggleSidebar, downloadExcel, showColumnSettings, setShowColumnSettings])
}

export default useKeyboardShortcuts
