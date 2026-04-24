import React, { useState, useEffect, useCallback, useMemo, Suspense, lazy } from 'react'
import * as XLSX from 'xlsx'
import { logger } from './utils/logger'
const Login = lazy(() => import('./components/Login'))
import AppSidebar from './components/AppSidebar'
import AppModals from './components/AppModals'
import AppRoutes from './components/AppRoutes'
import TransactionUpload from './components/TransactionUpload'
import TransactionTable from './components/TransactionTable'
import Breadcrumbs from './components/Breadcrumbs'
import AdvancedSearch from './components/AdvancedSearch'
import './components/ColumnSettingsModal.css'
import StatusIndicator from './components/StatusIndicator'
import ScrollToTop from './components/ScrollToTop'
import { useToast } from './components/ToastContainer'
import { useAuth } from './contexts/AuthContext'
import { useTheme } from './hooks/useTheme'
import { useSidebar } from './hooks/useSidebar'
import { useTransactions } from './hooks/useTransactions'
import { useFileUpload } from './hooks/useFileUpload'
import { authFetch } from './utils/api'
import './App.css'

// Используем прокси Vite в режиме разработки или прямой URL
const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

const TAB_LABELS = {
  transactions: 'Транзакции',
  vehicles: 'Транспорт',
  cards: 'Топливные карты',
  'fuel-card-analysis': 'Анализ топливных карт',
  'gas-stations': 'АЗС',
  'fuel-types': 'Виды топлива',
  providers: 'Провайдеры',
  'provider-analysis': 'Анализ Провайдера',
  templates: 'Шаблоны',
  organizations: 'Организации',
  users: 'Пользователи',
  'my-actions': 'Мои действия',
  'upload-events': 'События загрузок',
  notifications: 'Уведомления',
  settings: 'Настройки',
}

const App = () => {
  const { success, error: showError, info } = useToast()
  const { user, isAuthenticated, loading: authLoading, logout } = useAuth()
  const isAdmin = user && (user.role === 'admin' || user.is_superuser)
  const [showRegister, setShowRegister] = useState(false)
  const [authEnabled, setAuthEnabled] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('') // Оставляем для обратной совместимости, но используем toast
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [showClearProviderModal, setShowClearProviderModal] = useState(false)
  const [activeTab, setActiveTab] = useState('dashboard') // dashboard, transactions, vehicles, cards, fuel-card-analysis, gas-stations, fuel-types, providers, templates, upload-events, organizations, users, settings, notifications
  const [showRefuelsUpload, setShowRefuelsUpload] = useState(false)
  const [showLocationsUpload, setShowLocationsUpload] = useState(false)
  const { theme, handleThemeChange } = useTheme('dark')
  const { sidebarVisible, isMobile, toggleSidebar, closeSidebar } = useSidebar()
  const [showColumnSettings, setShowColumnSettings] = useState(false) // Видимость настроек колонок
  const [contextMenu, setContextMenu] = useState({ isOpen: false, x: 0, y: 0, rowIndex: null })

  // Показывать подсказку по горячим клавишам (скрыто по умолчанию)
  const showKeyboardHint = false

  const {
    data,
    total,
    stats,
    hasLoadedOnce,
    page,
    pageSize,
    filters,
    sortConfig,
    providers,
    selectedProviderTab,
    debouncedCardNumber,
    debouncedAzsNumber,
    debouncedProduct,
    debouncedProvider,
    setData,
    setFilters,
    setSortConfig,
    setSelectedProviderTab,
    setPage,
    setPageSize,
    loadTransactions,
    loadStats,
  } = useTransactions({ authEnabled, isAuthenticated, checkingAuth, setLoading, setError })

  const onUploaded = useCallback(async () => {
    await loadTransactions()
    await loadStats()
  }, [loadTransactions, loadStats])

  const {
    fileName,
    fileMatchInfo,
    uploadProgress,
    uploadStatus,
    uploadedBytes,
    totalBytes,
    processedItems,
    totalItems,
    dragActive,
    previewFile,
    showTemplateSelectModal,
    templateSelectData,
    setShowTemplateSelectModal,
    setTemplateSelectData,
    handleDrag,
    handleDrop,
    handleFileInput,
    handleFileConfirm,
    handleFileCancel,
    handleFileWithTemplate,
    checkFileMatch,
  } = useFileUpload({ onUploaded, setLoading, setError, logout })

  // Проверка настроек аутентификации при загрузке приложения
  useEffect(() => {
    let abortController = null
    let timeoutId = null
    
    // Резервный таймаут на случай, если authLoading зависнет
    const fallbackTimeout = setTimeout(() => {
      logger.warn('Таймаут проверки аутентификации - продолжаем работу')
      setCheckingAuth(false)
      setAuthEnabled(false)
    }, 10000) // Максимум 10 секунд

    const checkAuthSettings = async () => {
      // Отменяем предыдущий запрос, если он еще выполняется
      if (abortController) {
        abortController.abort()
      }
      
      abortController = new AbortController()
      timeoutId = setTimeout(() => abortController.abort(), 3000) // Таймаут 3 секунды
      
      try {
        // Запрашиваем настройки из API
        // В dev режиме API_URL пустой, поэтому используем относительный путь для прокси
        const configUrl = API_URL ? `${API_URL}/api/v1/config` : '/api/v1/config'
        const response = await authFetch(configUrl, {
          method: 'GET',
          signal: abortController.signal
        })
        
        if (response.ok) {
          const config = await response.json()
          setAuthEnabled(config.enable_auth === true)
        } else {
          // Если не удалось получить настройки, предполагаем, что аутентификация отключена
          logger.warn('Не удалось получить настройки аутентификации', { status: response.status })
          logger.debug('[Auth Check] Ошибка получения настроек, устанавливаем authEnabled = false')
          setAuthEnabled(false)
        }
      } catch (error) {
        // При ошибке сети предполагаем, что аутентификация отключена
        // или просто не можем проверить - продолжаем работу
        if (error.name !== 'AbortError') {
          logger.warn('Не удалось проверить настройки аутентификации', { error: error.message })
        }
        setAuthEnabled(false)
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
        clearTimeout(fallbackTimeout)
        // В любом случае завершаем проверку
        setCheckingAuth(false)
      }
    }

    // Ждем завершения загрузки AuthContext, затем проверяем настройки
    if (!authLoading) {
      checkAuthSettings()
    }

    return () => {
      clearTimeout(fallbackTimeout)
      // Отменяем активный запрос при unmount
      if (abortController) {
        abortController.abort()
      }
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [authLoading])

  // Экспорт транзакций в Excel через API
  const downloadExcel = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      
      // Формируем параметры экспорта с учетом текущих фильтров
      const params = new URLSearchParams({
        format: 'xlsx'
      })
      
      // Добавляем фильтры, если они установлены
      if (debouncedCardNumber) params.append('card_number', debouncedCardNumber)
      if (debouncedAzsNumber) params.append('azs_number', debouncedAzsNumber)
      if (debouncedProduct) params.append('product', debouncedProduct)
      
      // Обрабатываем фильтр по провайдеру
      // Приоритет у фильтра из расширенного поиска, если он установлен
      if (debouncedProvider && debouncedProvider !== '') {
        // debouncedProvider теперь содержит ID провайдера (строка)
        params.append('provider_id', debouncedProvider)
      } else if (selectedProviderTab !== null) {
        // Если фильтр из расширенного поиска не установлен, используем выбранную вкладку
        params.append('provider_id', selectedProviderTab.toString())
      }
      
      logger.info('Начало экспорта транзакций', { 
        filters: {
          card_number: debouncedCardNumber,
          azs_number: debouncedAzsNumber,
          product: debouncedProduct,
          provider_id: selectedProviderTab
        }
      })
      
      // Загружаем файл с сервера
      const response = await authFetch(`${API_URL}/api/v1/transactions/export?${params}`)
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Ошибка экспорта' }))
        throw new Error(errorData.detail || 'Ошибка экспорта транзакций')
      }
      
      // Получаем имя файла из заголовка Content-Disposition или используем по умолчанию
      const contentDisposition = response.headers.get('Content-Disposition')
      let fileName = `transactions_export_${new Date().toISOString().split('T')[0]}.xlsx`
      
      if (contentDisposition) {
        const fileNameMatch = contentDisposition.match(/filename="?(.+)"?/i)
        if (fileNameMatch) {
          fileName = fileNameMatch[1]
        }
      }
      
      // Создаем blob и скачиваем файл
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      
      success(`Файл ${fileName} успешно экспортирован`)
      logger.info('Excel файл успешно экспортирован', { filename: fileName })
    } catch (err) {
      // Безопасное извлечение сообщения об ошибке
      let errorText = 'Неизвестная ошибка'
      if (err instanceof Error) {
        errorText = err.message || 'Ошибка экспорта'
      } else if (typeof err === 'string') {
        errorText = err
      } else if (err && typeof err === 'object') {
        errorText = err.detail || err.message || err.error || JSON.stringify(err)
      }
      const errorMessage = 'Ошибка экспорта: ' + errorText
      showError(errorMessage)
      setError(errorMessage) // Оставляем для обратной совместимости
      logger.error('Ошибка экспорта в Excel', { error: errorText, originalError: err })
      setTimeout(() => setError(''), 10000)
    } finally {
      setLoading(false)
    }
  }, [debouncedCardNumber, debouncedAzsNumber, debouncedProduct, selectedProviderTab, success, showError])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Игнорируем горячие клавиши, если пользователь вводит текст в input/textarea
      const target = e.target
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      
      // Ctrl+B или Cmd+B - переключение сайдбара
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault()
        toggleSidebar()
      }
      // Ctrl+K или Cmd+K - фокус на поиск
      else if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        const searchInput = document.querySelector('.filter-input')
        if (searchInput) {
          searchInput.focus()
          searchInput.select()
        }
        logger.debug('Поиск через keyboard shortcut')
      }
      // Ctrl+S или Cmd+S - сохранение (только если не в input)
      else if ((e.ctrlKey || e.metaKey) && e.key === 's' && !isInput) {
        e.preventDefault()
        const saveButton = document.querySelector('button[title*="Сохранить"], button[title*="Создать"]')
        if (saveButton && !saveButton.disabled) {
          saveButton.click()
        }
        logger.debug('Сохранение через keyboard shortcut')
      }
      // Ctrl+N или Cmd+N - новый элемент (только если не в input)
      else if ((e.ctrlKey || e.metaKey) && e.key === 'n' && !isInput) {
        e.preventDefault()
        const addButton = document.querySelector('button[title*="Добавить"], button[title*="Создать"]')
        if (addButton && activeTab !== 'dashboard') {
          addButton.click()
        }
        logger.debug('Создание нового элемента через keyboard shortcut')
      }
      // Ctrl+F или Cmd+F - поиск/фильтр
      else if ((e.ctrlKey || e.metaKey) && e.key === 'f' && !isInput) {
        e.preventDefault()
        const searchInput = document.querySelector('.filter-input')
        if (searchInput) {
          searchInput.focus()
          searchInput.select()
        }
        logger.debug('Поиск/фильтр через keyboard shortcut')
      }
      // Ctrl+E или Cmd+E - экспорт
      else if ((e.ctrlKey || e.metaKey) && e.key === 'e' && !isInput) {
        e.preventDefault()
        if (activeTab === 'transactions' && data.length > 0) {
          downloadExcel()
        }
        logger.debug('Экспорт через keyboard shortcut')
      }
      // Escape - закрыть модальное окно или отменить действие
      else if (e.key === 'Escape') {
        const modal = document.querySelector('.modal-overlay.active, .confirm-modal-overlay, [aria-modal="true"]')
        if (modal) {
          const closeButton = modal.querySelector('button[aria-label="Закрыть"], .modal-close')
          if (closeButton) {
            closeButton.click()
          }
        }
        if (showColumnSettings) {
          setShowColumnSettings(false)
        }
        logger.debug('Закрытие через Escape')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [sidebarVisible, isMobile, activeTab, data.length, showColumnSettings, downloadExcel])


  const formatNumber = (num) => {
    return new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(num)
  }

  const formatLiters = (num) => {
    if (!num && num !== 0) return '0.00'
    if (num >= 1000000) {
      const thousands = num / 1000
      return formatNumber(thousands) + ' тыс. л'
    }
    return formatNumber(num) + ' л'
  }

  // Обработка сортировки
  const handleSort = (field) => {
    setSortConfig(prev => {
      if (prev.field === field) {
        // Меняем направление сортировки
        return {
          field,
          order: prev.order === 'asc' ? 'desc' : 'asc'
        }
      } else {
        // Новое поле, сортируем по убыванию
        return {
          field,
          order: 'desc'
        }
      }
    })
    setPage(0) // Сбрасываем страницу при изменении сортировки
  }

  // Очистка базы данных
  const handleClearDatabase = () => {
    setShowClearConfirm(true)
  }

  // Очистка транзакций по провайдеру
  const handleClearProvider = () => {
    setShowClearProviderModal(true)
  }

  const handleConfirmClearProvider = async (params) => {
    try {
      setLoading(true)
      setError('')
      setShowClearProviderModal(false)
      
      // Формируем URL с параметрами
      const urlParams = new URLSearchParams({
        provider_id: params.provider_id.toString(),
        confirm: 'true'
      })
      
      if (params.date_from) {
        urlParams.append('date_from', params.date_from)
      }
      
      if (params.date_to) {
        urlParams.append('date_to', params.date_to)
      }
      
      const response = await authFetch(`${API_URL}/api/v1/transactions/clear-by-provider?${urlParams.toString()}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        let errorMessage = 'Ошибка очистки транзакций провайдера'
        try {
          const errorData = await response.json()
          // Обрабатываем разные форматы ответа об ошибке
          if (typeof errorData === 'string') {
            errorMessage = errorData
          } else if (errorData.detail) {
            errorMessage = typeof errorData.detail === 'string' ? errorData.detail : JSON.stringify(errorData.detail)
          } else if (errorData.message) {
            errorMessage = typeof errorData.message === 'string' ? errorData.message : JSON.stringify(errorData.message)
          } else {
            errorMessage = JSON.stringify(errorData)
          }
        } catch (parseError) {
          errorMessage = `Ошибка ${response.status}: ${response.statusText}`
        }
        throw new Error(errorMessage)
      }

      const result = await response.json()
      const message = result.message || `Удалено транзакций: ${result.deleted_count}`
      success(message)
      setError(message) // Оставляем для обратной совместимости
      setTimeout(() => setError(''), 5000)
      
      // Перезагружаем данные
      await loadTransactions()
      await loadStats()
    } catch (err) {
      let errorMessage = 'Ошибка очистки транзакций провайдера'
      if (err instanceof Error) {
        errorMessage = err.message
      } else if (typeof err === 'string') {
        errorMessage = err
      } else if (err && typeof err === 'object') {
        errorMessage = err.message || err.detail || JSON.stringify(err)
      }
      showError('Ошибка очистки транзакций провайдера: ' + errorMessage)
      logger.error('Ошибка очистки транзакций провайдера', { error: errorMessage, stack: err?.stack })
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmClearDatabase = async () => {
    try {
      setLoading(true)
      setError('')
      setShowClearConfirm(false)
      
      const response = await authFetch(`${API_URL}/api/v1/transactions/clear?confirm=true`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        let errorMessage = 'Ошибка очистки базы данных'
        try {
          const errorData = await response.json()
          // Обрабатываем разные форматы ответа об ошибке
          if (typeof errorData === 'string') {
            errorMessage = errorData
          } else if (errorData.detail) {
            errorMessage = typeof errorData.detail === 'string' ? errorData.detail : JSON.stringify(errorData.detail)
          } else if (errorData.message) {
            errorMessage = typeof errorData.message === 'string' ? errorData.message : JSON.stringify(errorData.message)
          } else {
            errorMessage = JSON.stringify(errorData)
          }
        } catch (parseError) {
          errorMessage = `Ошибка ${response.status}: ${response.statusText}`
        }
        throw new Error(errorMessage)
      }

      const result = await response.json()
      const message = `База данных очищена. Удалено транзакций: ${result.deleted_count}`
      success(message)
      setError(message) // Оставляем для обратной совместимости
      setTimeout(() => setError(''), 5000)
      
      // Перезагружаем данные
      await loadTransactions()
      await loadStats()
    } catch (err) {
      let errorMessage = 'Ошибка очистки базы данных'
      if (err instanceof Error) {
        errorMessage = err.message
      } else if (typeof err === 'string') {
        errorMessage = err
      } else if (err && typeof err === 'object') {
        errorMessage = err.message || err.detail || JSON.stringify(err)
      }
      setError('Ошибка очистки базы данных: ' + errorMessage)
      logger.error('Ошибка очистки базы данных', { error: errorMessage, stack: err?.stack })
    } finally {
      setLoading(false)
    }
  }

  // Обработка события для установки фильтра транзакций и переключения вкладки
  useEffect(() => {
    const handleSetTransactionFilter = (event) => {
      const { product, tab } = event.detail || {}
      if (product) {
        setFilters(prev => ({ ...prev, product }))
        if (tab) {
          setActiveTab(tab)
        }
      }
    }
    
    window.addEventListener('setTransactionFilterAndTab', handleSetTransactionFilter)
    return () => {
      window.removeEventListener('setTransactionFilterAndTab', handleSetTransactionFilter)
    }
  }, [])

  // Маппинг заголовков на поля API для сортировки
  const headerFieldMap = {
    'ID': 'id',
    'Дата и время': 'transaction_date',
    '№ карты': 'card_number',
    'Провайдер': 'provider_id',
    'Закреплена за': 'vehicle',
    'АЗС': 'azs_number',  // Для сортировки используем azs_number, но отображаем gas_station_name
    'Товар / услуга': 'product',
    'Тип': 'operation_type',
    'Кол-во': 'quantity',
    'Валюта транзакции': 'currency',
    'Курс конвертации': 'exchange_rate'
  }

  const allHeaders = [
    'ID', 
    'Дата и время', 
    '№ карты', 
    'Провайдер',
    'Закреплена за', 
    'АЗС',
    'Товар / услуга', 
    'Тип', 
    'Кол-во', 
    'Валюта транзакции', 
    'Курс конвертации'
  ]
  
  // Настройки видимости колонок
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem('visible-columns')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch {
        return {}
      }
    }
    // По умолчанию все колонки видимы
    return {}
  })
  
  // Фильтруем колонки по настройкам видимости
  const displayHeaders = allHeaders.filter(header => {
    // Если настройка не сохранена, колонка видима по умолчанию
    return visibleColumns[header] !== false
  })
  
  // Сохранение настроек видимости колонок
  const toggleColumnVisibility = (header) => {
    const newVisibleColumns = {
      ...visibleColumns,
      [header]: visibleColumns[header] === false ? undefined : false
    }
    setVisibleColumns(newVisibleColumns)
    localStorage.setItem('visible-columns', JSON.stringify(newVisibleColumns))
  }
  
  // Сброс всех настроек колонок
  const resetColumnVisibility = () => {
    setVisibleColumns({})
    localStorage.removeItem('visible-columns')
  }

  // Функция получения иконки сортировки
  const getSortIcon = (header) => {
    const field = headerFieldMap[header]
    if (!field || sortConfig.field !== field) {
      return '⇅'
    }
    return sortConfig.order === 'asc' ? '↑' : '↓'
  }

  const transactionFilterConfig = useMemo(() => [
    { key: 'card_number', label: 'Номер карты', placeholder: 'Введите номер карты', type: 'text' },
    { key: 'azs_number', label: 'АЗС', placeholder: 'Введите номер АЗС', type: 'text' },
    { key: 'product', label: 'Товар', placeholder: 'Введите название товара', type: 'text' },
    {
      key: 'provider',
      label: 'Провайдер',
      placeholder: 'Выберите провайдера',
      type: 'select',
      options: providers
        .filter(p => p.is_active)
        .map(p => ({ value: p.id.toString(), label: p.name })),
    },
  ], [providers])

  // Показываем Login, если аутентификация включена и пользователь не авторизован
  if (checkingAuth || authLoading) {
    return (
      <div className="app">
        <div className="app-loading">
          <div className="loading-spinner">Загрузка...</div>
        </div>
      </div>
    )
  }

  if (authEnabled && !isAuthenticated) {
    return (
      <div className="app">
        <Suspense fallback={<div className="app-loading"><div className="loading-spinner">Загрузка...</div></div>}>
          <Login onSuccess={() => {
            // После успешного входа компонент перерендерится с новым состоянием auth
          }} />
        </Suspense>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="app-layout">
        {/* Кнопка переключения сайдбара (hamburger menu на мобильных) */}
        <button
          className={`sidebar-toggle ${!sidebarVisible ? 'sidebar-hidden-toggle' : ''} ${isMobile ? 'mobile-toggle' : ''}`}
          onClick={toggleSidebar}
          title={sidebarVisible ? (isMobile ? 'Закрыть меню' : 'Скрыть меню (Ctrl+B)') : (isMobile ? 'Открыть меню' : 'Показать меню (Ctrl+B)')}
          aria-label={sidebarVisible ? 'Закрыть меню' : 'Открыть меню'}
          aria-expanded={sidebarVisible}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            {sidebarVisible ? (
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            ) : (
              <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
            )}
          </svg>
        </button>

        {isMobile && sidebarVisible && (
          <div
            className="sidebar-overlay active"
            onClick={closeSidebar}
            aria-label="Закрыть меню"
          />
        )}

        <AppSidebar
          sidebarVisible={sidebarVisible}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isAdmin={isAdmin}
          user={user}
          authEnabled={authEnabled}
          logout={logout}
          theme={theme}
          onThemeChange={handleThemeChange}
          providers={providers}
          selectedProviderTab={selectedProviderTab}
          setSelectedProviderTab={setSelectedProviderTab}
        />

        {/* Основной контент */}
        <main className="main-content">
          <div className="container">
            <Breadcrumbs
              items={[
                { label: 'Главная', onClick: () => setActiveTab('dashboard') },
                ...(TAB_LABELS[activeTab] ? [{ label: TAB_LABELS[activeTab] }] : []),
              ]}
            />
            
            {/* Заголовок показываем только для транзакций */}
            {activeTab === 'transactions' && (
              <>
            <h1>Транзакции ГСМ</h1>
            <p className="subtitle">Загрузите файл для импорта, затем просматривайте и фильтруйте данные</p>
              </>
            )}

        <AppRoutes
          activeTab={activeTab}
          onOpenRefuelsUpload={() => setShowRefuelsUpload(true)}
          onOpenLocationsUpload={() => setShowLocationsUpload(true)}
        />
        
        {activeTab === 'transactions' && (
          <div className="tx-root">
        <TransactionUpload
          dragActive={dragActive}
          loading={loading}
          fileName={fileName}
          fileMatchInfo={fileMatchInfo}
          uploadStatus={uploadStatus}
          uploadProgress={uploadProgress}
          uploadedBytes={uploadedBytes}
          totalBytes={totalBytes}
          processedItems={processedItems}
          totalItems={totalItems}
          error={error}
          stats={stats}
          providers={providers}
          selectedProviderTab={selectedProviderTab}
          onSelectedProviderTabChange={setSelectedProviderTab}
          onDrag={handleDrag}
          onDrop={handleDrop}
          onFileInput={handleFileInput}
          formatLiters={formatLiters}
        />

        {hasLoadedOnce && (
          <AdvancedSearch
            filters={filters}
            onFiltersChange={setFilters}
            onClear={() => setFilters({ card_number: '', azs_number: '', product: '', provider: '' })}
            loading={loading}
            filterConfig={transactionFilterConfig}
          />
        )}

        {hasLoadedOnce && (
          <TransactionTable
            data={data}
            total={total}
            page={page}
            pageSize={pageSize}
            loading={loading}
            displayHeaders={displayHeaders}
            headerFieldMap={headerFieldMap}
            sortConfig={sortConfig}
            debouncedCardNumber={debouncedCardNumber}
            debouncedAzsNumber={debouncedAzsNumber}
            debouncedProduct={debouncedProduct}
            isAdmin={isAdmin}
            onSort={handleSort}
            getSortIcon={getSortIcon}
            onOpenColumnSettings={() => setShowColumnSettings(true)}
            onDownloadExcel={downloadExcel}
            onRefresh={() => loadTransactions()}
            onClearAll={handleClearDatabase}
            onClearByProvider={handleClearProvider}
            onContextMenu={setContextMenu}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        )}
          </div>
        )}
          </div>
        </main>
      </div>

      <AppModals
        clearDb={{
          open: showClearConfirm,
          onConfirm: handleConfirmClearDatabase,
          onCancel: () => setShowClearConfirm(false),
        }}
        clearProvider={{
          open: showClearProviderModal,
          onClose: () => setShowClearProviderModal(false),
          onConfirm: handleConfirmClearProvider,
          providers,
          loading,
        }}
        templateSelect={{
          open: showTemplateSelectModal,
          data: templateSelectData,
          loading,
          onClose: () => {
            setShowTemplateSelectModal(false)
            setTemplateSelectData(null)
          },
          onConfirm: async (selected) => {
            if (templateSelectData && templateSelectData.file) {
              setShowTemplateSelectModal(false)
              await handleFileWithTemplate(
                templateSelectData.file,
                selected.provider_id,
                selected.template_id
              )
              setTemplateSelectData(null)
            }
          },
        }}
        columnSettings={{
          open: showColumnSettings,
          onClose: () => setShowColumnSettings(false),
          allHeaders,
          visibleColumns,
          onToggle: toggleColumnVisibility,
          onReset: resetColumnVisibility,
        }}
        keyboardHint={showKeyboardHint}
        filePreview={{
          file: previewFile,
          onConfirm: handleFileConfirm,
          onCancel: handleFileCancel,
          onCheckTemplate: checkFileMatch,
          loading: loading && uploadStatus === 'uploading',
        }}
        contextMenu={{
          state: contextMenu,
          data,
          displayHeaders,
          onClose: () => setContextMenu({ isOpen: false, x: 0, y: 0, rowIndex: null }),
          onExport: () => downloadExcel(),
          onRefresh: () => loadTransactions(),
        }}
        register={{
          open: showRegister,
          onClose: () => setShowRegister(false),
          onSuccess: () => {
            setShowRegister(false)
            success('Пользователь успешно зарегистрирован')
          },
        }}
        refuelsUpload={{
          open: showRefuelsUpload,
          onClose: () => setShowRefuelsUpload(false),
        }}
        locationsUpload={{
          open: showLocationsUpload,
          onClose: () => setShowLocationsUpload(false),
        }}
        toastSuccess={success}
      />

      <ScrollToTop />
    </div>
  )
}

export default App

