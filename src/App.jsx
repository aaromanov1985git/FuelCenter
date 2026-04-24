import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react'
import * as XLSX from 'xlsx'
import { logger } from './utils/logger'
// Lazy load large page components for code-splitting
const VehiclesList = lazy(() => import('./components/VehiclesList'))
const GasStationsList = lazy(() => import('./components/GasStationsList'))
const FuelTypesList = lazy(() => import('./components/FuelTypesList'))
const FuelCardsList = lazy(() => import('./components/FuelCardsList'))
const FuelCardAnalysisList = lazy(() => import('./components/FuelCardAnalysisList'))
const ProviderAnalysisDashboard = lazy(() => import('./components/ProviderAnalysisDashboard'))
const ProvidersList = lazy(() => import('./components/ProvidersList'))
const TemplatesList = lazy(() => import('./components/TemplatesList'))
const Dashboard = lazy(() => import('./components/Dashboard'))
const UsersList = lazy(() => import('./components/UsersList'))
const OrganizationsList = lazy(() => import('./components/OrganizationsList'))
const UploadEventsList = lazy(() => import('./components/UploadEventsList'))
const UserActionLogsList = lazy(() => import('./components/UserActionLogsList'))
const Login = lazy(() => import('./components/Login'))
const Settings = lazy(() => import('./components/Settings'))
const NotificationsList = lazy(() => import('./components/NotificationsList'))
// Keep smaller components as static imports (they're used frequently)
import AppSidebar from './components/AppSidebar'
import AppModals from './components/AppModals'
import TransactionUpload, { MAX_FILE_SIZE } from './components/TransactionUpload'
import TransactionTable from './components/TransactionTable'
import Breadcrumbs from './components/Breadcrumbs'
import AdvancedSearch from './components/AdvancedSearch'
import './components/ColumnSettingsModal.css'
import StatusIndicator from './components/StatusIndicator'
import ScrollToTop from './components/ScrollToTop'
import { useToast } from './components/ToastContainer'
import { useAuth } from './contexts/AuthContext'
import { useDebounce } from './hooks/useDebounce'
import { useTouchGestures } from './hooks/useTouchGestures'
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
  const [activeTab, setActiveTab] = useState('dashboard') // dashboard, transactions, vehicles, cards, fuel-card-analysis, gas-stations, fuel-types, providers, templates, upload-events, organizations, users, settings, notifications
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
  const [theme, setTheme] = useState('dark') // 'dark', 'light'
  const [sidebarVisible, setSidebarVisible] = useState(true) // Видимость сайдбара
  const [isMobile, setIsMobile] = useState(false) // Определение мобильного устройства
  const [showColumnSettings, setShowColumnSettings] = useState(false) // Видимость настроек колонок
  const [contextMenu, setContextMenu] = useState({ isOpen: false, x: 0, y: 0, rowIndex: null })
  const [previewFile, setPreviewFile] = useState(null) // Файл для предпросмотра
  const [showTemplateSelectModal, setShowTemplateSelectModal] = useState(false)
  const [templateSelectData, setTemplateSelectData] = useState(null) // { file, availableTemplates, matchInfo, etc }

  // Показывать подсказку по горячим клавишам (скрыто по умолчанию)
  const showKeyboardHint = false

  // Debounced фильтры для уменьшения количества запросов к API
  const debouncedCardNumber = useDebounce(filters.card_number, 500)
  const debouncedAzsNumber = useDebounce(filters.azs_number, 500)
  const debouncedProduct = useDebounce(filters.product, 500)
  const debouncedProvider = useDebounce(filters.provider, 500)

  // Применение темы к документу
  const applyTheme = (themeName) => {
    document.documentElement.setAttribute('data-theme', themeName)
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
    const savedTheme = localStorage.getItem('gsm-theme') || 'dark'
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

  // Переключение темы с плавной анимацией
  const handleThemeChange = (newTheme) => {
    // Добавляем класс для плавного перехода
    const root = document.documentElement
    root.classList.add('theme-transitioning')
    
    // Небольшая задержка для начала анимации
    requestAnimationFrame(() => {
      setTheme(newTheme)
      localStorage.setItem('gsm-theme', newTheme)
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
      // Проверяем, что значение не пустое (может быть '', null, undefined)
      const providerIdStr = debouncedProvider && String(debouncedProvider).trim() !== '' 
        ? String(debouncedProvider).trim() 
        : null
      
      if (providerIdStr) {
        // providerIdStr содержит ID провайдера (строка)
        logger.debug('Применение фильтра по провайдеру из расширенного поиска', {
          provider_id: providerIdStr,
          provider_name: providers.find(p => String(p.id) === providerIdStr)?.name,
          debouncedProvider: debouncedProvider,
          debouncedProviderType: typeof debouncedProvider
        })
        params.append('provider_id', providerIdStr)
      } else if (selectedProviderTab !== null) {
        // Если фильтр из расширенного поиска не установлен, используем выбранную вкладку
        logger.debug('Применение фильтра по провайдеру из вкладки', {
          provider_id: selectedProviderTab
        })
        params.append('provider_id', selectedProviderTab.toString())
      }

      logger.debug('Параметры запроса транзакций', {
        url: `${API_URL}/api/v1/transactions?${params}`,
        params: Object.fromEntries(params)
      })

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
      // Безопасное извлечение сообщения об ошибке
      let errorText = 'Неизвестная ошибка'
      if (err instanceof Error) {
        errorText = err.message || 'Ошибка загрузки данных'
      } else if (typeof err === 'string') {
        errorText = err
      } else if (err && typeof err === 'object') {
        errorText = err.detail || err.message || err.error || JSON.stringify(err)
      }
      const errorMessage = 'Ошибка загрузки данных: ' + errorText
      setError(errorMessage) // Оставляем для обратной совместимости
      showError(errorMessage)
      logger.error('Ошибка загрузки транзакций', { error: errorText, originalError: err })
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
      // Безопасное извлечение сообщения об ошибке
      let errorText = 'Неизвестная ошибка'
      if (err instanceof Error) {
        errorText = err.message || 'Ошибка загрузки файла'
      } else if (typeof err === 'string') {
        errorText = err
      } else if (err && typeof err === 'object') {
        errorText = err.detail || err.message || err.error || JSON.stringify(err)
      }
      const errorMessage = 'Ошибка загрузки файла: ' + errorText
      setError(errorMessage)
      showError(errorMessage)
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
      // Безопасное извлечение сообщения об ошибке
      let errorText = 'Неизвестная ошибка'
      if (err instanceof Error) {
        errorText = err.message || 'Ошибка загрузки файла'
      } else if (typeof err === 'string') {
        errorText = err
      } else if (err && typeof err === 'object') {
        errorText = err.detail || err.message || err.error || JSON.stringify(err)
      }
      const errorMessage = 'Ошибка загрузки файла: ' + errorText
      setError(errorMessage)
      logger.error('Ошибка загрузки файла', { filename: file.name, error: errorText, originalError: err })
      setUploadStatus(null)
      setUploadProgress(0)
      setLoading(false)
      
      // Показываем ошибку дольше для важных сообщений
      if (errorText.includes('таймаут') || errorText.includes('timeout')) {
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
        // Безопасное извлечение сообщения об ошибке
        let errorText = 'Неизвестная ошибка'
        if (err instanceof Error) {
          errorText = err.message || 'Ошибка загрузки файла'
        } else if (typeof err === 'string') {
          errorText = err
        } else if (err && typeof err === 'object') {
          errorText = err.detail || err.message || err.error || JSON.stringify(err)
        }
        showError('Ошибка загрузки файла: ' + errorText)
        logger.error('Ошибка загрузки файла', { error: errorText, originalError: err })
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
  }, [page, pageSize, debouncedCardNumber, debouncedAzsNumber, debouncedProduct, debouncedProvider, sortConfig.field, sortConfig.order, selectedProviderTab, authEnabled, isAuthenticated, checkingAuth])


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
                ...(activeTab === 'provider-analysis' ? [{ label: 'Анализ Провайдера' }] : []),
                ...(activeTab === 'templates' ? [{ label: 'Шаблоны' }] : []),
                ...(activeTab === 'organizations' ? [{ label: 'Организации' }] : []),
                ...(activeTab === 'users' ? [{ label: 'Пользователи' }] : []),
                ...(activeTab === 'my-actions' ? [{ label: 'Мои действия' }] : []),
                ...(activeTab === 'upload-events' ? [{ label: 'События загрузок' }] : []),
                ...(activeTab === 'notifications' ? [{ label: 'Уведомления' }] : []),
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
        {activeTab === 'vehicles' && (
          <Suspense fallback={<div className="loading"><div className="spinner"></div>Загрузка...</div>}>
            <VehiclesList />
          </Suspense>
        )}
        {activeTab === 'cards' && (
          <Suspense fallback={<div className="loading"><div className="spinner"></div>Загрузка...</div>}>
            <FuelCardsList />
          </Suspense>
        )}
        {activeTab === 'fuel-card-analysis' && (
          <Suspense fallback={<div className="loading"><div className="spinner"></div>Загрузка...</div>}>
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
          </Suspense>
        )}
        {activeTab === 'gas-stations' && (
          <Suspense fallback={<div className="loading"><div className="spinner"></div>Загрузка...</div>}>
            <GasStationsList />
          </Suspense>
        )}
        {activeTab === 'fuel-types' && (
          <Suspense fallback={<div className="loading"><div className="spinner"></div>Загрузка...</div>}>
            <FuelTypesList />
          </Suspense>
        )}
        {activeTab === 'providers' && (
          <Suspense fallback={<div className="loading"><div className="spinner"></div>Загрузка...</div>}>
            <ProvidersList />
          </Suspense>
        )}
        {activeTab === 'provider-analysis' && (
          <Suspense fallback={<div className="loading"><div className="spinner"></div>Загрузка...</div>}>
            <ProviderAnalysisDashboard />
          </Suspense>
        )}
        {activeTab === 'templates' && (
          <Suspense fallback={<div className="loading"><div className="spinner"></div>Загрузка...</div>}>
            <TemplatesList />
          </Suspense>
        )}
        {activeTab === 'organizations' && (
          <Suspense fallback={<div className="loading"><div className="spinner"></div>Загрузка...</div>}>
            <OrganizationsList />
          </Suspense>
        )}
        {activeTab === 'users' && (
          <Suspense fallback={<div className="loading"><div className="spinner"></div>Загрузка...</div>}>
            <UsersList />
          </Suspense>
        )}
        {activeTab === 'my-actions' && (
          <Suspense fallback={<div className="loading"><div className="spinner"></div>Загрузка...</div>}>
            <UserActionLogsList showMyActionsOnly={true} />
          </Suspense>
        )}
        {activeTab === 'dashboard' && (
          <Suspense fallback={<div className="loading"><div className="spinner"></div>Загрузка...</div>}>
            <Dashboard />
          </Suspense>
        )}
        {activeTab === 'upload-events' && (
          <Suspense fallback={<div className="loading"><div className="spinner"></div>Загрузка...</div>}>
            <UploadEventsList />
          </Suspense>
        )}
        {activeTab === 'notifications' && (
          <Suspense fallback={<div className="loading"><div className="spinner"></div>Загрузка...</div>}>
            <NotificationsList />
          </Suspense>
        )}
        {activeTab === 'settings' && (
          <Suspense fallback={<div className="loading"><div className="spinner"></div>Загрузка...</div>}>
            <Settings />
          </Suspense>
        )}
        
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
                placeholder: 'Выберите провайдера',
                type: 'select',
                options: providers
                  .filter(p => p.is_active)
                  .map(p => ({ value: p.id.toString(), label: p.name }))
              }
            ]}
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
            onPageSizeChange={(newSize) => {
              setPageSize(newSize)
              setPage(0)
              localStorage.setItem('transaction-page-size', newSize.toString())
            }}
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

