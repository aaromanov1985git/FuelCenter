import React, { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import * as XLSX from 'xlsx'
import VehiclesList from './components/VehiclesList'
import GasStationsList from './components/GasStationsList'
import FuelTypesList from './components/FuelTypesList'
import FuelCardsList from './components/FuelCardsList'
import FuelCardAnalysisList from './components/FuelCardAnalysisList'
import RefuelsUpload from './components/RefuelsUpload'
import LocationsUpload from './components/LocationsUpload'
import ProvidersList from './components/ProvidersList'
import TemplatesList from './components/TemplatesList'
import CardInfoSchedulesList from './components/CardInfoSchedulesList'
import Dashboard from './components/Dashboard'
import ConfirmModal from './components/ConfirmModal'
import ClearProviderModal from './components/ClearProviderModal'
import TemplateSelectModal from './components/TemplateSelectModal'
import ClearMenu from './components/ClearMenu'
import FileUploadProgress from './components/FileUploadProgress'
import ThemeToggle from './components/ThemeToggle'
import IconButton from './components/IconButton'
import Pagination from './components/Pagination'
import Highlight from './components/Highlight'
import Breadcrumbs from './components/Breadcrumbs'
import AdvancedSearch from './components/AdvancedSearch'
import './components/ColumnSettingsModal.css'
import StatusIndicator from './components/StatusIndicator'
import ScrollToTop from './components/ScrollToTop'
import EmptyState from './components/EmptyState'
import ContextMenu from './components/ContextMenu'
import FilePreviewModal from './components/FilePreviewModal'
import UsersList from './components/UsersList'
import OrganizationsList from './components/OrganizationsList'
import ExportMenu from './components/ExportMenu'
import UploadEventsList from './components/UploadEventsList'
import UserActionLogsList from './components/UserActionLogsList'
import Login from './components/Login'
import Register from './components/Register'
import Settings from './components/Settings'
import { useToast } from './components/ToastContainer'
import { useAuth } from './contexts/AuthContext'
import { useCopyToClipboard } from './hooks/useCopyToClipboard'
import { SkeletonTable } from './components/Skeleton'
import { useDebounce } from './hooks/useDebounce'
import { useTouchGestures } from './hooks/useTouchGestures'
import { logger } from './utils/logger'
import { authFetch, getApiUrl } from './utils/api'
import { Card, Button } from './components/ui'
import './App.css'

// Используем прокси Vite в режиме разработки или прямой URL
const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

const App = () => {
  const { success, error: showError, info } = useToast()
  const { user, isAuthenticated, loading: authLoading, logout } = useAuth()
  const isAdmin = user && (user.role === 'admin' || user.is_superuser)
  const [showRegister, setShowRegister] = useState(false)
  const [authEnabled, setAuthEnabled] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [data, setData] = useState([])
  const [fileName, setFileName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('') // Оставляем для обратной совместимости, но используем toast
  const [stats, setStats] = useState(null)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(() => {
    // Загружаем сохраненный размер страницы из localStorage
    const saved = localStorage.getItem('transaction-page-size')
    return saved ? parseInt(saved, 10) : 100
  })
  const [total, setTotal] = useState(0)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false) // Флаг для отслеживания первой загрузки
  const [filters, setFilters] = useState({
    card_number: '',
    azs_number: '',
    product: '',
    provider: ''
  })
  const [sortConfig, setSortConfig] = useState({
    field: 'transaction_date',
    order: 'desc'
  })
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [showClearProviderModal, setShowClearProviderModal] = useState(false)
  const [activeTab, setActiveTab] = useState('dashboard') // dashboard, transactions, vehicles, cards, fuel-card-analysis, gas-stations, fuel-types, providers, templates, upload-events, organizations, users, settings
  const [showRefuelsUpload, setShowRefuelsUpload] = useState(false)
  const [showLocationsUpload, setShowLocationsUpload] = useState(false)
  const [providers, setProviders] = useState([])
  const [selectedProviderTab, setSelectedProviderTab] = useState(null) // null = "Все", иначе ID провайдера
  const [dragActive, setDragActive] = useState(false)
  const [fileMatchInfo, setFileMatchInfo] = useState(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStatus, setUploadStatus] = useState(null) // 'uploading', 'processing', null
  const [uploadedBytes, setUploadedBytes] = useState(0)
  const [totalBytes, setTotalBytes] = useState(0)
  const [processedItems, setProcessedItems] = useState(0)
  const [totalItems, setTotalItems] = useState(0)
  const [theme, setTheme] = useState('light') // 'light', 'midnight'
  const [sidebarVisible, setSidebarVisible] = useState(true) // Видимость сайдбара
  const [isMobile, setIsMobile] = useState(false) // Определение мобильного устройства
  const [showColumnSettings, setShowColumnSettings] = useState(false) // Видимость настроек колонок
  const [contextMenu, setContextMenu] = useState({ isOpen: false, x: 0, y: 0, rowIndex: null })
  const [previewFile, setPreviewFile] = useState(null) // Файл для предпросмотра
  const [showTemplateSelectModal, setShowTemplateSelectModal] = useState(false)
  const [templateSelectData, setTemplateSelectData] = useState(null) // { file, availableTemplates, matchInfo, etc }
  const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB в байтах

  // Показывать подсказку по горячим клавишам (скрыто по умолчанию)
  const showKeyboardHint = false

  // Debounced фильтры для уменьшения количества запросов к API
  const debouncedCardNumber = useDebounce(filters.card_number, 500)
  const debouncedAzsNumber = useDebounce(filters.azs_number, 500)
  const debouncedProduct = useDebounce(filters.product, 500)
  const debouncedProvider = useDebounce(filters.provider, 500)

  // Применение темы к документу
  const applyTheme = (themeName) => {
    const root = document.documentElement
    if (themeName === 'light') {
      root.removeAttribute('data-theme')
    } else {
      root.setAttribute('data-theme', themeName)
    }
  }

  // Определение мобильного устройства
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth <= 768
      setIsMobile(mobile)
      // На мобильных устройствах сайдбар по умолчанию скрыт
      if (mobile && !localStorage.getItem('sidebar-visible')) {
        setSidebarVisible(false)
      }
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Touch-жесты для мобильных устройств
  useTouchGestures({
    onSwipeRight: () => {
      // Свайп вправо открывает сайдбар на мобильных
      if (isMobile && !sidebarVisible) {
        setSidebarVisible(true)
      }
    },
    onSwipeLeft: () => {
      // Свайп влево закрывает сайдбар на мобильных
      if (isMobile && sidebarVisible) {
        setSidebarVisible(false)
      }
    },
    minSwipeDistance: 50,
    maxSwipeTime: 300
  })

  // Загрузка темы и состояния сайдбара из localStorage при монтировании
  useEffect(() => {
    const savedTheme = localStorage.getItem('app-theme') || 'light'
    setTheme(savedTheme)
    applyTheme(savedTheme)
    
    // Восстанавливаем состояние сайдбара только если не мобильное устройство
    if (!isMobile) {
      const savedSidebarState = localStorage.getItem('sidebar-visible')
      if (savedSidebarState !== null) {
        setSidebarVisible(savedSidebarState === 'true')
      }
    }
  }, [isMobile])

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
          console.log('[Auth Check] Ошибка получения настроек, устанавливаем authEnabled = false')
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

  // Переключение темы с плавной анимацией
  const handleThemeChange = (newTheme) => {
    // Добавляем класс для плавного перехода
    const root = document.documentElement
    root.classList.add('theme-transitioning')
    
    // Небольшая задержка для начала анимации
    requestAnimationFrame(() => {
      setTheme(newTheme)
      localStorage.setItem('app-theme', newTheme)
      applyTheme(newTheme)
      logger.info('Тема изменена', { theme: newTheme })
      
      // Удаляем класс после завершения перехода
      setTimeout(() => {
        root.classList.remove('theme-transitioning')
      }, 500)
    })
  }

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
      if (debouncedProvider) {
        // Ищем провайдера по названию (без учета регистра)
        const foundProvider = providers.find(p => 
          p.name && p.name.toLowerCase().includes(debouncedProvider.toLowerCase())
        )
        if (foundProvider) {
          params.append('provider_id', foundProvider.id.toString())
        }
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
      const errorMessage = 'Ошибка экспорта: ' + err.message
      showError(errorMessage)
      setError(errorMessage) // Оставляем для обратной совместимости
      logger.error('Ошибка экспорта в Excel', { error: err.message, stack: err.stack })
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
        const newState = !sidebarVisible
        setSidebarVisible(newState)
        if (!isMobile) {
          localStorage.setItem('sidebar-visible', newState.toString())
        }
        logger.debug('Состояние сайдбара изменено через keyboard shortcut', { visible: newState })
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


  // Загрузка транзакций с сервера
  const loadTransactions = async () => {
    setLoading(true)
    setError('')
    
    try {
      const params = new URLSearchParams({
        skip: (page * pageSize).toString(),
        limit: pageSize.toString(),
        sort_by: sortConfig.field,
        sort_order: sortConfig.order
      })
      
      // Используем debounced значения для фильтров
      if (debouncedCardNumber) params.append('card_number', debouncedCardNumber)
      if (debouncedAzsNumber) params.append('azs_number', debouncedAzsNumber)
      if (debouncedProduct) params.append('product', debouncedProduct)
      
      // Обрабатываем фильтр по провайдеру
      // Приоритет у фильтра из расширенного поиска, если он установлен
      if (debouncedProvider) {
        // Ищем провайдера по названию (без учета регистра)
        const foundProvider = providers.find(p => 
          p.name && p.name.toLowerCase().includes(debouncedProvider.toLowerCase())
        )
        if (foundProvider) {
          params.append('provider_id', foundProvider.id.toString())
        }
      } else if (selectedProviderTab !== null) {
        // Если фильтр из расширенного поиска не установлен, используем выбранную вкладку
        params.append('provider_id', selectedProviderTab.toString())
      }
      
      const response = await authFetch(`${API_URL}/api/v1/transactions?${params}`)
      
      if (!response.ok) {
        // Ошибка 401 обрабатывается централизованно в authFetch
        throw new Error('Ошибка загрузки данных')
      }
      
      const result = await response.json()
      
      // Конвертируем данные для отображения
      const converted = result.items.map(item => ({
        ID: item.id,
        'Дата и время': formatDateFromISO(item.transaction_date),
        '№ карты': item.card_number || '',
        'Провайдер': item.provider_name || item.supplier || '-',
        'Закреплена за': item.vehicle_display_name || item.vehicle || '',
        'АЗС': item.gas_station_name || item.azs_number || '',
        'Товар / услуга': item.product || '',
        'Тип': item.operation_type || 'Покупка',
        'Кол-во': item.quantity || '',
        'Валюта транзакции': item.currency || 'RUB',
        'Курс конвертации': item.exchange_rate || 1,
        _hasErrors: item.vehicle_has_errors || false  // Скрытое поле для выделения
      }))
      
      setData(converted)
      setTotal(result.total)
      setHasLoadedOnce(true) // Отмечаем, что данные были загружены хотя бы раз
      logger.info('Транзакции загружены', { count: converted.length, total: result.total })
    } catch (err) {
      // Не показываем ошибку при 401 - это обрабатывается централизованно
      if (err.isUnauthorized) {
        return
      }
      const errorMessage = 'Ошибка загрузки данных: ' + err.message
      setError(errorMessage) // Оставляем для обратной совместимости
      showError(errorMessage)
      logger.error('Ошибка загрузки транзакций', { error: err.message, stack: err.stack })
    } finally {
      setLoading(false)
    }
  }

  // Загрузка статистики
  const loadStats = async () => {
    try {
      const params = new URLSearchParams()
      if (selectedProviderTab !== null) {
        params.append('provider_id', selectedProviderTab.toString())
      }
      const response = await authFetch(`${API_URL}/api/v1/transactions/stats/summary?${params}`)
      if (response.ok) {
        const statsData = await response.json()
        setStats(statsData)
        logger.debug('Статистика загружена', { stats: statsData })
      } else {
        // Если статистика недоступна, не показываем ошибку пользователю
        logger.warn('Статистика недоступна', { status: response.status })
      }
    } catch (err) {
      // Игнорируем ошибки загрузки статистики при первом запуске
      logger.warn('Ошибка загрузки статистики', { error: err.message })
    }
  }

  // Форматирование даты из ISO формата
  const formatDateFromISO = (dateStr) => {
    if (!dateStr) return ''
    try {
      const date = new Date(dateStr)
      const day = String(date.getDate()).padStart(2, '0')
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const year = String(date.getFullYear()).slice(-2)
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      return `${day}/${month}/${year} ${hours}:${minutes}`
    } catch {
      return ''
    }
  }

  // Форматирование числа с разделителями
  const formatNumber = (num) => {
    return new Intl.NumberFormat('ru-RU', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    }).format(num)
  }

  // Форматирование литров: если >= 1000000, то в тысячах
  const formatLiters = (num) => {
    if (!num && num !== 0) return '0.00'
    if (num >= 1000000) {
      const thousands = num / 1000
      return formatNumber(thousands) + ' тыс. л'
    }
    return formatNumber(num) + ' л'
  }

  // Загрузка списка провайдеров
  const loadProviders = async () => {
    try {
      const response = await authFetch(`${API_URL}/api/v1/providers?limit=1000`)
      if (response.ok) {
        const result = await response.json()
        setProviders(result.items)
        logger.debug('Провайдеры загружены', { count: result.items.length })
      }
    } catch (err) {
      logger.error('Ошибка загрузки провайдеров', { error: err.message })
    }
  }

  useEffect(() => {
    loadProviders()
  }, [])


  // Проверка соответствия файла шаблону
  const checkFileMatch = useCallback(async (file) => {
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await authFetch(`${API_URL}/api/v1/transactions/check-match`, {
        method: 'POST',
        body: formData
      })

      if (response.ok) {
        const matchData = await response.json()
        setFileMatchInfo(matchData.match_info)
        
        // Проверяем, требуется ли выбор шаблона
        const requiresSelection = matchData.require_template_selection === true
        
        if (requiresSelection) {
          logger.info('Требуется выбор шаблона', { 
            matchInfo: matchData.match_info,
            availableTemplates: matchData.available_templates?.length || 0
          })
        } else {
          logger.info('Проверка соответствия файла завершена', { 
            matchInfo: matchData.match_info,
            isMatch: matchData.is_match
          })
        }
        
        return { requiresSelection, matchData }
      }
    } catch (err) {
      logger.warn('Ошибка проверки соответствия файла', { error: err.message })
    }
    return { requiresSelection: false, matchData: null }
  }, [])

  // Валидация файла перед загрузкой
  const validateFile = (file) => {
    // Проверка типа файла
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      return { valid: false, error: 'Поддерживаются только файлы Excel (.xlsx, .xls)' }
    }

    // Проверка размера файла
    if (file.size > MAX_FILE_SIZE) {
      const fileSizeMB = (file.size / 1024 / 1024).toFixed(2)
      const maxSizeMB = (MAX_FILE_SIZE / 1024 / 1024).toFixed(0)
      return { 
        valid: false, 
        error: `Размер файла (${fileSizeMB}MB) превышает максимально допустимый (${maxSizeMB}MB)` 
      }
    }

    return { valid: true }
  }

  // Повторная загрузка файла с выбранным шаблоном
  const handleFileWithTemplate = async (file, providerId, templateId) => {
    if (!file) return

    setFileName(file.name)
    setLoading(true)
    setError('')
    setFileMatchInfo(null)
    setUploadProgress(0)
    setUploadStatus('uploading')
    setUploadedBytes(0)
    setTotalBytes(0)
    setProcessedItems(0)
    setTotalItems(0)

    try {
      // Загружаем файл с отслеживанием прогресса
      const formData = new FormData()
      formData.append('file', file)

      const xhr = new XMLHttpRequest()
      
      // Устанавливаем таймаут для обработки (10 минут для больших файлов)
      const PROCESSING_TIMEOUT = 10 * 60 * 1000 // 10 минут
      let timeoutId = null

      // Отслеживание прогресса загрузки
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 100
          setUploadProgress(percentComplete)
          setUploadedBytes(e.loaded)
          setTotalBytes(e.total)
        }
      })

      // Обработка завершения загрузки
      xhr.addEventListener('load', async () => {
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          setUploadStatus('processing')
          setUploadProgress(100)
          
          try {
            const contentType = xhr.getResponseHeader('content-type')
            if (!contentType || !contentType.includes('application/json')) {
              throw new Error(`Неожиданный формат ответа от сервера`)
            }
            
            const result = JSON.parse(xhr.responseText)
            
            if (result.require_template_selection) {
              // Если все еще требуется выбор, показываем ошибку
              throw new Error('Ошибка: требуется выбор шаблона')
            }
            
            if (typeof result.transactions_created === 'undefined') {
              throw new Error('Некорректный ответ от сервера')
            }

            setProcessedItems(result.transactions_created || 0)
            setTotalItems((result.transactions_created || 0) + (result.transactions_skipped || 0))
            
            await loadTransactions()
            await loadStats()
            
            let message = `✅ Файл успешно загружен. Обработано ${result.transactions_created} транзакций`
            if (result.transactions_skipped > 0) {
              message += `. Пропущено дубликатов: ${result.transactions_skipped}`
            }
            
            if (result.validation_warnings && result.validation_warnings.length > 0) {
              const warningsText = result.validation_warnings.join(', ')
              success(message)
              info(`⚠️ Предупреждения валидации: ${warningsText}`, 10000)
            } else {
              success(message)
            }
            
            logger.info('Файл успешно загружен с выбранным шаблоном', { 
              filename: file.name, 
              created: result.transactions_created,
              providerId,
              templateId
            })
          } catch (parseError) {
            throw new Error('Ошибка парсинга ответа сервера')
          } finally {
            setUploadStatus(null)
            setUploadProgress(0)
            setLoading(false)
          }
        } else {
          let errorMessage = 'Ошибка загрузки файла'
          try {
            const contentType = xhr.getResponseHeader('content-type')
            if (contentType && contentType.includes('application/json')) {
              const errorData = JSON.parse(xhr.responseText)
              errorMessage = errorData.detail || errorData.message || errorMessage
            }
          } catch (parseError) {
            // Игнорируем ошибки парсинга
          }
          
          if (xhr.status === 401) {
            localStorage.removeItem('auth_token')
            logout()
            setUploadStatus(null)
            setUploadProgress(0)
            setLoading(false)
            return
          }
          
          setError(errorMessage)
          showError(errorMessage)
          setUploadStatus(null)
          setUploadProgress(0)
          setLoading(false)
        }
      })

      xhr.addEventListener('error', () => {
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
        const networkError = 'Ошибка сети при загрузке файла'
        setError(networkError)
        showError(networkError)
        setUploadStatus(null)
        setUploadProgress(0)
        setLoading(false)
      })

      xhr.addEventListener('timeout', () => {
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
        setError('Превышено время ожидания обработки файла')
        showError('Превышено время ожидания обработки файла')
        setUploadStatus(null)
        setUploadProgress(0)
        setLoading(false)
      })
      
      timeoutId = setTimeout(() => {
        if (xhr.readyState !== XMLHttpRequest.DONE) {
          xhr.abort()
          const timeoutError = 'Превышено время ожидания обработки файла'
          setError(timeoutError)
          showError(timeoutError)
          setUploadStatus(null)
          setUploadProgress(0)
          setLoading(false)
        }
      }, PROCESSING_TIMEOUT)

      // Отправляем запрос с параметрами шаблона
      let uploadUrl
      if (API_URL) {
        // Если API_URL задан, создаем полный URL
        uploadUrl = new URL(`${API_URL}/api/v1/transactions/upload`)
      uploadUrl.searchParams.append('provider_id', providerId.toString())
      uploadUrl.searchParams.append('template_id', templateId.toString())
        uploadUrl = uploadUrl.toString()
      } else {
        // Если API_URL пустой (dev режим), используем относительный URL
        const params = new URLSearchParams({
          provider_id: providerId.toString(),
          template_id: templateId.toString()
        })
        uploadUrl = `/api/v1/transactions/upload?${params.toString()}`
      }
      
      xhr.open('POST', uploadUrl)
      xhr.timeout = PROCESSING_TIMEOUT
      
      const token = localStorage.getItem('auth_token')
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      }
      
      xhr.send(formData)

    } catch (err) {
      setError('Ошибка загрузки файла: ' + err.message)
      showError('Ошибка загрузки файла: ' + err.message)
      setUploadStatus(null)
      setUploadProgress(0)
      setLoading(false)
    }
  }

  // Загрузка файла на сервер с отслеживанием прогресса
  const handleFile = async (file) => {
    if (!file) return

    // Валидация файла
    const validation = validateFile(file)
    if (!validation.valid) {
      setError(validation.error) // Оставляем для обратной совместимости
      showError(validation.error)
      logger.warn('Валидация файла не пройдена', { filename: file.name, error: validation.error })
      return
    }

    setFileName(file.name)
    setLoading(true)
    setError('')
    setFileMatchInfo(null)
    setUploadProgress(0)
    setUploadStatus('uploading')
    setUploadedBytes(0)
    setTotalBytes(0)
    setProcessedItems(0)
    setTotalItems(0)

    try {
      // Загружаем файл с отслеживанием прогресса
      // Проверка шаблона уже выполнена в handleFileConfirm
      const formData = new FormData()
      formData.append('file', file)

      const xhr = new XMLHttpRequest()
      
      // Устанавливаем таймаут для обработки (10 минут для больших файлов)
      const PROCESSING_TIMEOUT = 10 * 60 * 1000 // 10 минут
      let timeoutId = null

      // Отслеживание прогресса загрузки
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 100
          setUploadProgress(percentComplete)
          setUploadedBytes(e.loaded)
          setTotalBytes(e.total)
          logger.debug('Прогресс загрузки файла', { 
            filename: file.name, 
            progress: percentComplete,
            loaded: e.loaded,
            total: e.total
          })
        }
      })

      // Обработка завершения загрузки
      xhr.addEventListener('load', async () => {
        // Отменяем таймаут при успешной загрузке
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          setUploadStatus('processing')
          setUploadProgress(100)
          
          try {
            // Проверяем тип контента перед парсингом
            const contentType = xhr.getResponseHeader('content-type')
            if (!contentType || !contentType.includes('application/json')) {
              const responseText = xhr.responseText.substring(0, 200)
              throw new Error(`Неожиданный формат ответа от сервера: ${responseText}`)
            }
            
            const result = JSON.parse(xhr.responseText)
            
            // Проверяем, требуется ли выбор шаблона
            if (result.require_template_selection) {
              // Показываем модальное окно выбора шаблона
              setTemplateSelectData({
                file: file,
                availableTemplates: result.available_templates || [],
                detectedProviderId: result.detected_provider_id,
                detectedTemplateId: result.detected_template_id,
                matchInfo: result.match_info
              })
              setShowTemplateSelectModal(true)
              setUploadStatus(null)
              setUploadProgress(0)
              setLoading(false)
              logger.info('Требуется выбор шаблона', { 
                filename: file.name, 
                availableTemplates: result.available_templates?.length || 0 
              })
              return
            }
            
            // Проверяем наличие обязательных полей
            if (typeof result.transactions_created === 'undefined') {
              logger.warn('Ответ сервера не содержит transactions_created', { result })
              throw new Error('Некорректный ответ от сервера: отсутствует информация о созданных транзакциях')
            }
            
            // Обновляем информацию о совпадении из ответа сервера (если есть)
            if (result.match_info) {
              setFileMatchInfo(result.match_info)
            }

            // Обновляем прогресс обработки
            setProcessedItems(result.transactions_created || 0)
            setTotalItems((result.transactions_created || 0) + (result.transactions_skipped || 0))
            
            // Перезагружаем данные
            await loadTransactions()
            await loadStats()
            
            let message = `✅ Файл успешно загружен. Обработано ${result.transactions_created} транзакций`
            if (result.transactions_skipped > 0) {
              message += `. Пропущено дубликатов: ${result.transactions_skipped}`
            }
            
            // Показываем предупреждения валидации
            if (result.validation_warnings && result.validation_warnings.length > 0) {
              const warningsText = result.validation_warnings.join(', ')
              success(message)
              info(`⚠️ Предупреждения валидации: ${warningsText}`, 10000)
              setError(message) // Оставляем для обратной совместимости
              setTimeout(() => setError(''), 15000)
            } else {
              success(message)
              setError(message) // Оставляем для обратной совместимости
              setTimeout(() => setError(''), 10000)
            }
            
            logger.info('Файл успешно загружен', { filename: file.name, created: result.transactions_created })
          } catch (parseError) {
            throw new Error('Ошибка парсинга ответа сервера')
          } finally {
            setUploadStatus(null)
            setUploadProgress(0)
            setLoading(false)
          }
        } else {
          // Ошибка от сервера
          let errorMessage = 'Ошибка загрузки файла'
          try {
            // Проверяем тип контента
            const contentType = xhr.getResponseHeader('content-type')
            if (contentType && contentType.includes('application/json')) {
              const errorData = JSON.parse(xhr.responseText)
              errorMessage = errorData.detail || errorData.message || errorMessage
              logger.error('Ошибка от сервера (JSON)', { 
                status: xhr.status, 
                error: errorData,
                filename: file.name
              })
            } else {
              // Если не JSON, читаем как текст
              const errorText = xhr.responseText.substring(0, 500)
              errorMessage = `Ошибка ${xhr.status}: ${xhr.statusText}. ${errorText}`
              logger.error('Ошибка от сервера (не JSON)', { 
                status: xhr.status,
                statusText: xhr.statusText,
                responseText: errorText,
                filename: file.name
              })
            }
          } catch (parseError) {
            const errorText = xhr.responseText ? xhr.responseText.substring(0, 500) : 'Нет деталей ошибки'
            errorMessage = `Ошибка ${xhr.status}: ${xhr.statusText}`
            if (errorText && errorText !== 'Internal Server Error') {
              errorMessage += `. ${errorText}`
            }
            logger.error('Ошибка парсинга ответа об ошибке', { 
              status: xhr.status,
              parseError: parseError.message,
              responseText: errorText,
              filename: file.name
            })
          }
          
          // Обработка 401 ошибки - автоматический выход
          if (xhr.status === 401) {
            localStorage.removeItem('auth_token')
            logout()
            logger.warn('Токен авторизации истек при загрузке файла')
            setUploadStatus(null)
            setUploadProgress(0)
            setUploadedBytes(0)
            setTotalBytes(0)
            setProcessedItems(0)
            setTotalItems(0)
            setLoading(false)
            return // Не показываем ошибку, так как будет показана форма входа
          }
          
          // Устанавливаем состояние ошибки перед выбрасыванием
          setError(errorMessage)
          setUploadStatus(null)
          setUploadProgress(0)
          setUploadedBytes(0)
          setTotalBytes(0)
          setProcessedItems(0)
          setTotalItems(0)
          setLoading(false)
          
          throw new Error(errorMessage)
        }
      })

      // Обработка ошибок
      xhr.addEventListener('error', () => {
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
        const networkError = 'Ошибка сети при загрузке файла. Проверьте подключение к серверу и убедитесь, что backend запущен.'
        setError(networkError)
        setUploadStatus(null)
        setUploadProgress(0)
        setLoading(false)
        logger.error('Ошибка сети при загрузке файла', { filename: file.name })
      })

      xhr.addEventListener('abort', () => {
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
        // Не показываем ошибку, если это был таймаут (он уже обработан)
        if (xhr.status === 0) {
          setError('Загрузка файла прервана')
          setUploadStatus(null)
          setUploadProgress(0)
          setLoading(false)
          logger.warn('Загрузка файла прервана', { filename: file.name })
        }
      })
      
      // Обработка таймаута XHR
      xhr.addEventListener('timeout', () => {
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
        setError('Превышено время ожидания обработки файла. Файл может быть слишком большим.')
        setUploadStatus(null)
        setUploadProgress(0)
        setLoading(false)
        logger.error('Таймаут XHR при загрузке файла', { filename: file.name })
      })
      
      // Таймаут для обработки
      timeoutId = setTimeout(() => {
        if (xhr.readyState !== XMLHttpRequest.DONE) {
          logger.error('Таймаут при обработке файла', { 
            filename: file.name,
            readyState: xhr.readyState,
            status: xhr.status
          })
          xhr.abort()
          const timeoutError = 'Превышено время ожидания обработки файла (10 минут). Файл может быть слишком большим или обработка занимает слишком много времени. Проверьте логи сервера.'
          setError(timeoutError)
          setUploadStatus(null)
          setUploadProgress(0)
          setLoading(false)
          setTimeout(() => setError(''), 30000) // Показываем ошибку таймаута 30 секунд
        }
      }, PROCESSING_TIMEOUT)

      // Отправляем запрос
      const uploadUrl = API_URL 
        ? new URL(`${API_URL}/api/v1/transactions/upload`).toString()
        : '/api/v1/transactions/upload'
      xhr.open('POST', uploadUrl)
      xhr.timeout = PROCESSING_TIMEOUT
      
      // Добавляем токен авторизации в заголовки
      const token = localStorage.getItem('auth_token')
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      }
      
      xhr.send(formData)

    } catch (err) {
      setError('Ошибка загрузки файла: ' + err.message)
      logger.error('Ошибка загрузки файла', { filename: file.name, error: err.message, stack: err.stack })
      setUploadStatus(null)
      setUploadProgress(0)
      setLoading(false)
      
      // Показываем ошибку дольше для важных сообщений
      if (err.message.includes('таймаут') || err.message.includes('timeout')) {
        setTimeout(() => setError(''), 30000) // 30 секунд для таймаутов
      }
    }
  }

  // Обработка drag-and-drop
  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0]
      // Валидация перед показом предпросмотра
      const validation = validateFile(file)
      if (!validation.valid) {
        showError(validation.error)
        return
      }
      setPreviewFile(file)
    }
  }

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      // Валидация перед показом предпросмотра
      const validation = validateFile(file)
      if (!validation.valid) {
        showError(validation.error)
        e.target.value = '' // Очищаем input
        return
      }
      setPreviewFile(file)
    }
  }

  const handleFileConfirm = async (templateData) => {
    if (previewFile) {
      setLoading(true)
      try {
        // Если передан templateData, используем его для загрузки
        if (templateData && templateData.provider_id && templateData.template_id) {
          setPreviewFile(null) // Закрываем модальное окно предпросмотра
          await handleFileWithTemplate(previewFile, templateData.provider_id, templateData.template_id)
        } else {
          // Если шаблон определен автоматически, загружаем файл
          setPreviewFile(null) // Закрываем модальное окно предпросмотра
          await handleFile(previewFile)
        }
      } catch (err) {
        setLoading(false)
        showError('Ошибка загрузки файла: ' + err.message)
        logger.error('Ошибка загрузки файла', { error: err.message })
      }
    }
  }

  const handleFileCancel = () => {
    setPreviewFile(null)
    // Очищаем input file
    const fileInput = document.getElementById('file-upload-input')
    if (fileInput) {
      fileInput.value = ''
    }
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

  // Сброс страницы при изменении debounced фильтров или провайдера
  useEffect(() => {
    setPage(0)
  }, [debouncedCardNumber, debouncedAzsNumber, debouncedProduct, selectedProviderTab])

  // Загрузка данных при монтировании и изменении debounced фильтров/страницы/сортировки
  useEffect(() => {
    // Ждем, пока определится статус аутентификации
    if (checkingAuth) {
      return
    }
    
    // Не загружаем транзакции, если аутентификация включена и пользователь не авторизован
    if (!authEnabled || (authEnabled && isAuthenticated)) {
      loadTransactions()
      loadStats()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, debouncedCardNumber, debouncedAzsNumber, debouncedProduct, sortConfig.field, sortConfig.order, selectedProviderTab, authEnabled, isAuthenticated, checkingAuth])


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
        <Login onSuccess={() => {
          // После успешного входа компонент перерендерится с новым состоянием auth
        }} />
      </div>
    )
  }

  return (
    <div className="app">
      <div className="app-layout">
        {/* Кнопка переключения сайдбара (hamburger menu на мобильных) */}
        <button 
          className={`sidebar-toggle ${!sidebarVisible ? 'sidebar-hidden-toggle' : ''} ${isMobile ? 'mobile-toggle' : ''}`}
          onClick={() => {
            const newState = !sidebarVisible
            setSidebarVisible(newState)
            if (!isMobile) {
              localStorage.setItem('sidebar-visible', newState.toString())
            }
            logger.debug('Состояние сайдбара изменено', { visible: newState, isMobile })
          }}
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

        {/* Overlay для мобильного меню */}
        {isMobile && sidebarVisible && (
          <div 
            className="sidebar-overlay active"
            onClick={() => {
              setSidebarVisible(false)
              logger.debug('Сайдбар закрыт через overlay')
            }}
            aria-label="Закрыть меню"
          />
        )}

        {/* Боковое меню */}
        <aside className={`sidebar ${sidebarVisible ? '' : 'sidebar-hidden'}`}>
          <div className="sidebar-header">
            <h2>Меню</h2>
          </div>
          <nav className="sidebar-nav">
            <button 
              className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              Дашборд
            </button>
            <button 
              className={`nav-item ${activeTab === 'transactions' ? 'active' : ''}`}
              onClick={() => setActiveTab('transactions')}
            >
              Транзакции
            </button>
            <button 
              className={`nav-item ${activeTab === 'vehicles' ? 'active' : ''}`}
              onClick={() => setActiveTab('vehicles')}
            >
              Транспорт
            </button>
            <button 
              className={`nav-item ${activeTab === 'cards' ? 'active' : ''}`}
              onClick={() => setActiveTab('cards')}
            >
              Топливные карты
            </button>
            <button 
              className={`nav-item ${activeTab === 'fuel-card-analysis' ? 'active' : ''}`}
              onClick={() => setActiveTab('fuel-card-analysis')}
            >
              Анализ карт
            </button>
            <button 
              className={`nav-item ${activeTab === 'gas-stations' ? 'active' : ''}`}
              onClick={() => setActiveTab('gas-stations')}
            >
              АЗС
            </button>
            <button 
              className={`nav-item ${activeTab === 'fuel-types' ? 'active' : ''}`}
              onClick={() => setActiveTab('fuel-types')}
            >
              Виды топлива
            </button>
            <button 
              className={`nav-item ${activeTab === 'providers' ? 'active' : ''}`}
              onClick={() => setActiveTab('providers')}
            >
              Провайдеры
            </button>
            <button 
              className={`nav-item ${activeTab === 'templates' ? 'active' : ''}`}
              onClick={() => setActiveTab('templates')}
            >
              Шаблоны
            </button>
            {isAdmin && (
              <>
                <button 
                  className={`nav-item ${activeTab === 'organizations' ? 'active' : ''}`}
                  onClick={() => setActiveTab('organizations')}
                >
                  Организации
                </button>
                <button 
                  className={`nav-item ${activeTab === 'users' ? 'active' : ''}`}
                  onClick={() => setActiveTab('users')}
                >
                  Пользователи
                </button>
              </>
            )}
            {user && !isAdmin && (
              <button 
                className={`nav-item ${activeTab === 'my-actions' ? 'active' : ''}`}
                onClick={() => setActiveTab('my-actions')}
              >
                Мои действия
              </button>
            )}
            <button
              className={`nav-item ${activeTab === 'upload-events' ? 'active' : ''}`}
              onClick={() => setActiveTab('upload-events')}
            >
              События загрузок
            </button>
            <button
              className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              Настройки
            </button>
          </nav>

          {/* Закладки провайдеров для вкладки транзакций */}
          {activeTab === 'transactions' && (
            <div className="provider-tabs">
              <div className="provider-tabs-header">
                <h3>Провайдеры</h3>
              </div>
              <div className="provider-tabs-list">
                <button
                  className={`provider-tab ${selectedProviderTab === null ? 'active' : ''}`}
                  onClick={() => setSelectedProviderTab(null)}
                >
                  Все
                </button>
                {providers.filter(p => p.is_active).map(provider => (
                  <button
                    key={provider.id}
                    className={`provider-tab ${selectedProviderTab === provider.id ? 'active' : ''}`}
                    onClick={() => setSelectedProviderTab(provider.id)}
                  >
                    {provider.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {authEnabled && user && (
            <div className="sidebar-footer">
              <div className="sidebar-footer-row sidebar-footer-combined">
                <div className="sidebar-user-section">
                  <div className="sidebar-user-compact">
                    <div className="sidebar-user-name">{user.username}</div>
                    <div className="sidebar-user-role">
                      {user.role === 'admin' ? 'Администратор' : user.role === 'viewer' ? 'Наблюдатель' : 'Пользователь'}
                    </div>
                  </div>
                  <button
                    className="sidebar-logout-link"
                    onClick={logout}
                    title="Выйти из системы"
                  >
                    Выйти
                  </button>
                </div>
                <div className="sidebar-theme-section">
                  <ThemeToggle currentTheme={theme} onThemeChange={handleThemeChange} />
                </div>
              </div>
            </div>
          )}
        </aside>

        {/* Основной контент */}
        <main className="main-content">
          <div className="container">
            {/* Breadcrumbs навигация */}
            <Breadcrumbs
              items={[
                { label: 'Главная', onClick: () => setActiveTab('dashboard') },
                ...(activeTab === 'transactions' ? [{ label: 'Транзакции' }] : []),
                ...(activeTab === 'vehicles' ? [{ label: 'Транспорт' }] : []),
                ...(activeTab === 'cards' ? [{ label: 'Топливные карты' }] : []),
                ...(activeTab === 'fuel-card-analysis' ? [{ label: 'Анализ топливных карт' }] : []),
                ...(activeTab === 'gas-stations' ? [{ label: 'АЗС' }] : []),
                ...(activeTab === 'fuel-types' ? [{ label: 'Виды топлива' }] : []),
                ...(activeTab === 'providers' ? [{ label: 'Провайдеры' }] : []),
                ...(activeTab === 'templates' ? [{ label: 'Шаблоны' }] : []),
                ...(activeTab === 'organizations' ? [{ label: 'Организации' }] : []),
                ...(activeTab === 'users' ? [{ label: 'Пользователи' }] : []),
                ...(activeTab === 'my-actions' ? [{ label: 'Мои действия' }] : []),
                ...(activeTab === 'upload-events' ? [{ label: 'События загрузок' }] : []),
                ...(activeTab === 'settings' ? [{ label: 'Настройки' }] : [])
              ]}
            />
            
            {/* Заголовок показываем только для транзакций */}
            {activeTab === 'transactions' && (
              <>
            <h1>Транзакции ГСМ</h1>
            <p className="subtitle">Загрузите файл для импорта, затем просматривайте и фильтруйте данные</p>
              </>
            )}

        {/* Контент вкладок */}
        {activeTab === 'vehicles' && <VehiclesList />}
        {activeTab === 'cards' && <FuelCardsList />}
        {activeTab === 'fuel-card-analysis' && (
          <>
            <FuelCardAnalysisList />
            <Card style={{ marginTop: 'var(--spacing-section)' }}>
              <Card.Body>
                <div style={{ display: 'flex', gap: 'var(--spacing-element)', flexWrap: 'wrap' }}>
                  <Button
                    variant="secondary"
                    onClick={() => setShowRefuelsUpload(true)}
                  >
                    Загрузить заправки
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setShowLocationsUpload(true)}
                  >
                    Загрузить местоположения
                  </Button>
                </div>
              </Card.Body>
            </Card>
          </>
        )}
        {activeTab === 'gas-stations' && <GasStationsList />}
        {activeTab === 'fuel-types' && <FuelTypesList />}
        {activeTab === 'providers' && <ProvidersList />}
        {activeTab === 'templates' && <TemplatesList />}
        {activeTab === 'organizations' && <OrganizationsList />}
        {activeTab === 'users' && <UsersList />}
        {activeTab === 'my-actions' && <UserActionLogsList showMyActionsOnly={true} />}
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'upload-events' && <UploadEventsList />}
        {activeTab === 'settings' && <Settings />}
        
        {activeTab === 'transactions' && (
          <>
        <div 
          className={`upload-section ${dragActive ? 'drag-active' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <div className="drag-drop-area">
            <input 
              type="file" 
              accept=".xlsx,.xls" 
              onChange={handleFileInput} 
              className="file-input"
              disabled={loading}
              id="file-upload-input"
            />
            <label htmlFor="file-upload-input" className="drag-drop-label">
              <svg xmlns="http://www.w3.org/2000/svg" className="icon-large" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              <div className="drag-drop-text">
                <span className="drag-drop-title">Перетащите файл сюда</span>
                <span className="drag-drop-subtitle">или нажмите для выбора файла</span>
                <span className="drag-drop-hint">Максимальный размер файла: {(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB</span>
              </div>
            </label>
          </div>
          
          {fileName && (
            <div className="file-info">
              <span className="file-name">Загружен: {fileName}</span>
              {fileMatchInfo && fileMatchInfo.provider_name && (
                <div className="match-info">
                  <span className="match-label">Определен провайдер:</span>
                  <span className="match-value">{fileMatchInfo.provider_name}</span>
                  {fileMatchInfo.template_name && (
                    <span className="match-template">(шаблон: {fileMatchInfo.template_name})</span>
                  )}
                </div>
              )}
            </div>
          )}

          {(uploadStatus || uploadProgress > 0) && (
            <FileUploadProgress 
              progress={uploadStatus === 'uploading' ? uploadProgress : (uploadStatus === 'processing' ? 100 : undefined)}
              fileName={fileName}
              status={uploadStatus}
              uploadedBytes={uploadedBytes}
              totalBytes={totalBytes}
              processedItems={processedItems}
              totalItems={totalItems}
            />
          )}

          {loading && !uploadStatus && (
            <div className="loading">
              <div className="spinner"></div>
              Обработка...
            </div>
          )}

          {/* Оставляем старый блок ошибок для обратной совместимости, но теперь основное - toast */}
          {error && (
            <div className={error.includes('Успешно') ? 'success' : 'error'}>
              {error}
            </div>
          )}
        </div>

        {/* Дашборд загрузки */}
        <div className="upload-dashboard">
          <h3 className="upload-dashboard-title">Дашборд загрузки</h3>
          <div className="upload-dashboard-grid">
            <div className="upload-dashboard-card stat-primary">
              <div className="upload-dashboard-label">Всего транзакций</div>
              <div className="upload-dashboard-value">{stats?.total_transactions || 0}</div>
            </div>
            <div className="upload-dashboard-card stat-success">
              <div className="upload-dashboard-label">Всего литров</div>
              <div className="upload-dashboard-value">
                {stats?.total_quantity ? formatLiters(stats.total_quantity) : '0.00 л'}
              </div>
            </div>
            <div className="upload-dashboard-card stat-secondary">
              <div className="upload-dashboard-label">Видов топлива</div>
              <div className="upload-dashboard-value">
                {stats?.products ? Object.keys(stats.products).length : 0}
              </div>
            </div>
            <div className="upload-dashboard-card stat-secondary">
              <div className="upload-dashboard-label">Провайдеров</div>
              <div className="upload-dashboard-value">
                {stats?.provider_count || (selectedProviderTab ? 1 : providers.length)}
              </div>
              {selectedProviderTab !== null && (
                <div className="upload-dashboard-subvalue">
                  <span style={{ fontWeight: 'bold', color: 'var(--color-primary)' }}>
                    Фильтр: {providers.find(p => p.id === selectedProviderTab)?.name || '—'}
                  </span>
                  <button
                    onClick={() => setSelectedProviderTab(null)}
                    style={{
                      marginLeft: '8px',
                      padding: '2px 8px',
                      fontSize: '12px',
                      background: 'var(--color-error-light)',
                      color: 'var(--color-error-dark)',
                      border: '1px solid var(--color-error)',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                    title="Сбросить фильтр"
                  >
                    ✕ Сбросить
                  </button>
                </div>
              )}
            </div>
            {fileMatchInfo && fileMatchInfo.provider_name && (
              <div className="upload-dashboard-card upload-dashboard-card-highlight">
                <div className="upload-dashboard-label">Последний провайдер</div>
                <div className="upload-dashboard-value-small">{fileMatchInfo.provider_name}</div>
                {fileMatchInfo.template_name && (
                  <div className="upload-dashboard-subvalue">Шаблон: {fileMatchInfo.template_name}</div>
                )}
                {fileMatchInfo.score && fileMatchInfo.score > 0 && (
                  <div className="upload-dashboard-subvalue">Совпадение: {fileMatchInfo.score}%</div>
                )}
              </div>
            )}
            {fileName && (
              <div className="upload-dashboard-card">
                <div className="upload-dashboard-label">Последний файл</div>
                <div className="upload-dashboard-value-small">{fileName}</div>
              </div>
            )}
          </div>
        </div>

        {/* Показываем расширенный поиск, если данные были загружены хотя бы раз */}
        {hasLoadedOnce && (
          <AdvancedSearch
            filters={filters}
            onFiltersChange={setFilters}
            onClear={() => setFilters({ card_number: '', azs_number: '', product: '', provider: '' })}
            loading={loading}
            filterConfig={[
              {
                key: 'card_number',
                label: 'Номер карты',
                placeholder: 'Введите номер карты',
                type: 'text'
              },
              {
                key: 'azs_number',
                label: 'АЗС',
                placeholder: 'Введите номер АЗС',
                type: 'text'
              },
              {
                key: 'product',
                label: 'Товар',
                placeholder: 'Введите название товара',
                type: 'text'
              },
              {
                key: 'provider',
                label: 'Провайдер',
                placeholder: 'Введите название провайдера',
                type: 'text'
              }
            ]}
          />
        )}

        {/* Показываем таблицу всегда, когда данные были загружены хотя бы раз */}
        {hasLoadedOnce && (
          <>
            <div className="result-header">
              <h2>Результат ({total} записей, показано {data.length})</h2>
              <div className="header-actions">
                <IconButton 
                  icon="settings" 
                  variant="primary" 
                  onClick={() => setShowColumnSettings(true)}
                  title="⚙️ Настройка колонок таблицы"
                  size="medium"
                />
                <ExportMenu
                  data={data}
                  headers={displayHeaders}
                  onExportExcel={downloadExcel}
                  filename="transactions"
                />
                <IconButton 
                  icon="copy" 
                  variant="primary" 
                  onClick={async () => {
                    // Копируем данные таблицы в формате CSV
                    const csvHeaders = displayHeaders.join(',')
                    const csvRows = data.map(row => 
                      displayHeaders.map(h => {
                        const value = row[h] || ''
                        // Экранируем кавычки и оборачиваем в кавычки, если содержит запятую или перенос строки
                        if (value.includes(',') || value.includes('\n') || value.includes('"')) {
                          return `"${String(value).replace(/"/g, '""')}"`
                        }
                        return value
                      }).join(',')
                    ).join('\n')
                    const csvContent = csvHeaders + '\n' + csvRows
                    
                    const copied = await copyToClipboard(csvContent)
                    if (copied) {
                      success('Данные скопированы в буфер обмена')
                    } else {
                      showError('Не удалось скопировать данные')
                    }
                  }}
                  title="📋 Копировать данные в буфер обмена (CSV)"
                  size="medium"
                />
                <IconButton 
                  icon="refresh" 
                  variant="primary" 
                  onClick={() => loadTransactions()}
                  title="🔄 Обновить данные"
                  size="medium"
                />
                {isAdmin && (
                  <ClearMenu
                    onClearAll={handleClearDatabase}
                    onClearByProvider={handleClearProvider}
                    disabled={loading}
                  />
                )}
              </div>
            </div>

            <div className="table-wrapper">
              {loading && data.length === 0 ? (
                <SkeletonTable rows={10} columns={displayHeaders.length} />
              ) : data.length === 0 ? (
                <EmptyState
                  title="Нет данных"
                  message="Транзакции не найдены. Попробуйте изменить фильтры или загрузить новый файл."
                  icon="📊"
                  variant="large"
                />
              ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    {displayHeaders.map((h) => {
                      const field = headerFieldMap[h]
                      const isSortable = !!field
                      const isActive = sortConfig.field === field
                      
                      return (
                        <th 
                          key={h}
                          className={isSortable ? 'sortable' : ''}
                          onClick={() => isSortable && handleSort(field)}
                          style={{ cursor: isSortable ? 'pointer' : 'default' }}
                          data-label={h}
                          role={isSortable ? 'columnheader button' : 'columnheader'}
                          aria-sort={isSortable ? (isActive ? (sortConfig.order === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
                          tabIndex={isSortable ? 0 : undefined}
                          onKeyDown={(e) => {
                            if (isSortable && (e.key === 'Enter' || e.key === ' ')) {
                              e.preventDefault()
                              handleSort(field)
                            }
                          }}
                        >
                          <span className="th-content">
                            {h}
                            {isSortable && (
                              <span className={`sort-icon ${isActive ? 'active' : ''}`}>
                                {getSortIcon(h)}
                              </span>
                            )}
                          </span>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, idx) => (
                    <tr 
                      key={idx} 
                      className={row._hasErrors ? 'row-with-errors' : ''}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        setContextMenu({
                          isOpen: true,
                          x: e.clientX,
                          y: e.clientY,
                          rowIndex: idx
                        })
                      }}
                    >
                      {displayHeaders.map((h) => {
                        const searchTerms = [
                          debouncedCardNumber,
                          debouncedAzsNumber,
                          debouncedProduct
                        ].filter(Boolean)
                        const cellValue = row[h] || ''
                        
                        return (
                          <td 
                            key={h} 
                            data-label={h}
                            className="table-cell-clickable"
                            title="Двойной клик для копирования"
                            onDoubleClick={async () => {
                              if (cellValue) {
                                const copied = await copyToClipboard(String(cellValue))
                                if (copied) {
                                  success(`Скопировано: ${cellValue}`)
                                }
                              }
                            }}
                          >
                            {h === 'Закреплена за' && row._hasErrors ? (
                              <span className="error-highlight" title="Требуется проверка данных ТС">
                                {searchTerms.length > 0 ? (
                                  <Highlight 
                                    text={cellValue} 
                                    searchTerm={searchTerms}
                                  />
                                ) : (
                                  cellValue
                                )}
                              </span>
                            ) : searchTerms.length > 0 ? (
                              <Highlight 
                                text={cellValue} 
                                searchTerm={searchTerms}
                              />
                            ) : (
                              cellValue
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              )}
              <div className="table-footer">
                Показаны основные колонки. Полные данные — в скачиваемом файле.
                {total > pageSize && (
                  <Pagination
                    currentPage={page + 1} // Компонент использует страницы начиная с 1
                    totalPages={Math.ceil(total / pageSize)}
                    total={total}
                    pageSize={pageSize}
                    onPageChange={(newPage) => setPage(newPage - 1)} // Конвертируем обратно в формат с 0
                    onPageSizeChange={(newSize) => {
                      setPageSize(newSize)
                      setPage(0) // Сбрасываем на первую страницу при изменении размера
                      localStorage.setItem('transaction-page-size', newSize.toString())
                    }}
                    loading={loading}
                  />
                )}
              </div>
            </div>
          </>
        )}
          </>
        )}
          </div>
        </main>
      </div>

      <ConfirmModal
        isOpen={showClearConfirm}
        title="Подтверждение очистки базы данных"
        message="Вы уверены, что хотите очистить базу данных? Это действие удалит все транзакции и не может быть отменено."
        onConfirm={handleConfirmClearDatabase}
        onCancel={() => setShowClearConfirm(false)}
        confirmText="Очистить БД"
        cancelText="Отмена"
        variant="danger"
      />

      <ClearProviderModal
        isOpen={showClearProviderModal}
        onClose={() => setShowClearProviderModal(false)}
        onConfirm={handleConfirmClearProvider}
        providers={providers}
        loading={loading}
      />

      <TemplateSelectModal
        isOpen={showTemplateSelectModal}
        onClose={() => {
          setShowTemplateSelectModal(false)
          setTemplateSelectData(null)
        }}
        onConfirm={async (selected) => {
          if (templateSelectData && templateSelectData.file) {
            setShowTemplateSelectModal(false)
            await handleFileWithTemplate(
              templateSelectData.file,
              selected.provider_id,
              selected.template_id
            )
            setTemplateSelectData(null)
          }
        }}
        availableTemplates={templateSelectData?.availableTemplates || []}
        detectedProviderId={templateSelectData?.detectedProviderId}
        detectedTemplateId={templateSelectData?.detectedTemplateId}
        matchInfo={templateSelectData?.matchInfo}
        loading={loading}
      />

      {/* Модальное окно настройки колонок */}
      {showColumnSettings && createPortal(
        <div className="column-settings-modal" onClick={() => setShowColumnSettings(false)}>
          <div className="column-settings-content" onClick={(e) => e.stopPropagation()}>
            <div className="column-settings-header">
              <h3 className="column-settings-title">Настройка колонок</h3>
              <button 
                className="column-settings-close" 
                onClick={() => setShowColumnSettings(false)}
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>
            <div className="column-settings-list">
              <div className="column-settings-grid">
                {allHeaders.map((header) => {
                  const isVisible = visibleColumns[header] !== false
                  return (
                    <label key={header} className="column-settings-item">
                      <input
                        type="checkbox"
                        checked={isVisible}
                        onChange={() => toggleColumnVisibility(header)}
                      />
                      <span>{header}</span>
                    </label>
                  )
                })}
              </div>
            </div>
            <div className="column-settings-actions">
              <button 
                className="btn btn-secondary btn-sm" 
                onClick={resetColumnVisibility}
              >
                Сбросить
              </button>
              <button 
                className="btn btn-primary btn-sm" 
                onClick={() => setShowColumnSettings(false)}
              >
                Готово
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showKeyboardHint && (
        <div className="keyboard-hint">
          <div className="keyboard-hint-title">Горячие клавиши</div>
          <div className="keyboard-hint-item">
            <span>Переключить меню</span>
            <kbd className="keyboard-hint-key">Ctrl+B</kbd>
          </div>
          <div className="keyboard-hint-item">
            <span>Поиск</span>
            <kbd className="keyboard-hint-key">Ctrl+K</kbd>
          </div>
          <div className="keyboard-hint-item">
            <span>Сохранить</span>
            <kbd className="keyboard-hint-key">Ctrl+S</kbd>
          </div>
          <div className="keyboard-hint-item">
            <span>Новый элемент</span>
            <kbd className="keyboard-hint-key">Ctrl+N</kbd>
          </div>
          <div className="keyboard-hint-item">
            <span>Фильтр</span>
            <kbd className="keyboard-hint-key">Ctrl+F</kbd>
          </div>
          <div className="keyboard-hint-item">
            <span>Экспорт</span>
            <kbd className="keyboard-hint-key">Ctrl+E</kbd>
          </div>
          <div className="keyboard-hint-item">
            <span>Закрыть</span>
            <kbd className="keyboard-hint-key">Esc</kbd>
          </div>
        </div>
      )}

      {/* Модальное окно предпросмотра файла */}
      <FilePreviewModal
        isOpen={!!previewFile}
        file={previewFile}
        onConfirm={handleFileConfirm}
        onCancel={handleFileCancel}
        onCheckTemplate={checkFileMatch}
        loading={loading && uploadStatus === 'uploading'}
      />

      {/* Контекстное меню */}
      {contextMenu.isOpen && contextMenu.rowIndex !== null && (
        <ContextMenu
          isOpen={contextMenu.isOpen}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu({ isOpen: false, x: 0, y: 0, rowIndex: null })}
          items={[
            {
              label: 'Копировать строку',
              icon: '📋',
              onClick: async () => {
                const row = data[contextMenu.rowIndex]
                const rowData = displayHeaders.map(h => `${h}: ${row[h] || ''}`).join('\n')
                const copied = await copyToClipboard(rowData)
                if (copied) {
                  success('Строка скопирована')
                }
              }
            },
            {
              label: 'Копировать все данные',
              icon: '📄',
              onClick: async () => {
                const csvHeaders = displayHeaders.join(',')
                const csvRows = data.map(r => 
                  displayHeaders.map(h => {
                    const value = r[h] || ''
                    if (value.includes(',') || value.includes('\n') || value.includes('"')) {
                      return `"${String(value).replace(/"/g, '""')}"`
                    }
                    return value
                  }).join(',')
                ).join('\n')
                const csvContent = csvHeaders + '\n' + csvRows
                const copied = await copyToClipboard(csvContent)
                if (copied) {
                  success('Все данные скопированы')
                }
              }
            },
            { divider: true },
            {
              label: 'Экспорт в Excel',
              icon: '📥',
              onClick: () => {
                downloadExcel()
              }
            },
            {
              label: 'Обновить данные',
              icon: '🔄',
              onClick: () => {
                loadTransactions()
              }
            }
          ]}
        />
        )}

      {/* Модальное окно регистрации */}
      {showRegister && (
        <div className="modal-overlay" onClick={() => setShowRegister(false)}>
          <div className="modal-content auth-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close"
              onClick={() => setShowRegister(false)}
              aria-label="Закрыть"
            >
              ×
            </button>
            <Register
              onSuccess={() => {
                setShowRegister(false)
                success('Пользователь успешно зарегистрирован')
              }}
              onCancel={() => setShowRegister(false)}
            />
          </div>
        </div>
      )}

      {/* Кнопка "Наверх" */}
      <ScrollToTop />

      {/* Модальные окна для загрузки данных анализа */}
      <RefuelsUpload
        isOpen={showRefuelsUpload}
        onClose={() => setShowRefuelsUpload(false)}
      />
      <LocationsUpload
        isOpen={showLocationsUpload}
        onClose={() => setShowLocationsUpload(false)}
      />
    </div>
  )
}

export default App

