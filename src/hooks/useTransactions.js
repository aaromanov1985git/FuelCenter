import { useCallback, useEffect, useState } from 'react'
import { useToast } from '../components/ToastContainer'
import { logger } from '../utils/logger'
import { authFetch, getApiUrl } from '../utils/api'
import { useDebounce } from './useDebounce'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

const PAGE_SIZE_STORAGE_KEY = 'transaction-page-size'

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

const mapTransactionRow = (item) => ({
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
  _hasErrors: item.vehicle_has_errors || false,
})

const extractErrorText = (err) => {
  if (err instanceof Error) return err.message || 'Ошибка загрузки данных'
  if (typeof err === 'string') return err
  if (err && typeof err === 'object') {
    return err.detail || err.message || err.error || JSON.stringify(err)
  }
  return 'Неизвестная ошибка'
}

export const useTransactions = ({ authEnabled, isAuthenticated, checkingAuth, setLoading, setError }) => {
  const { error: showError } = useToast()

  const [data, setData] = useState([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState(null)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(() => {
    const saved = localStorage.getItem(PAGE_SIZE_STORAGE_KEY)
    return saved ? parseInt(saved, 10) : 100
  })
  const [filters, setFilters] = useState({
    card_number: '',
    azs_number: '',
    product: '',
    provider: '',
  })
  const [sortConfig, setSortConfig] = useState({
    field: 'transaction_date',
    order: 'desc',
  })
  const [providers, setProviders] = useState([])
  const [selectedProviderTab, setSelectedProviderTab] = useState(null)

  const debouncedCardNumber = useDebounce(filters.card_number, 500)
  const debouncedAzsNumber = useDebounce(filters.azs_number, 500)
  const debouncedProduct = useDebounce(filters.product, 500)
  const debouncedProvider = useDebounce(filters.provider, 500)

  const loadTransactions = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const params = new URLSearchParams({
        skip: (page * pageSize).toString(),
        limit: pageSize.toString(),
        sort_by: sortConfig.field,
        sort_order: sortConfig.order,
      })

      if (debouncedCardNumber) params.append('card_number', debouncedCardNumber)
      if (debouncedAzsNumber) params.append('azs_number', debouncedAzsNumber)
      if (debouncedProduct) params.append('product', debouncedProduct)

      const providerIdStr = debouncedProvider && String(debouncedProvider).trim() !== ''
        ? String(debouncedProvider).trim()
        : null

      if (providerIdStr) {
        logger.debug('Применение фильтра по провайдеру из расширенного поиска', {
          provider_id: providerIdStr,
          provider_name: providers.find(p => String(p.id) === providerIdStr)?.name,
        })
        params.append('provider_id', providerIdStr)
      } else if (selectedProviderTab !== null) {
        params.append('provider_id', selectedProviderTab.toString())
      }

      const response = await authFetch(`${API_URL}/api/v1/transactions?${params}`)
      if (!response.ok) throw new Error('Ошибка загрузки данных')

      const result = await response.json()
      setData(result.items.map(mapTransactionRow))
      setTotal(result.total)
      setHasLoadedOnce(true)
      logger.info('Транзакции загружены', { count: result.items.length, total: result.total })
    } catch (err) {
      if (err.isUnauthorized) return
      const errorText = extractErrorText(err)
      const errorMessage = 'Ошибка загрузки данных: ' + errorText
      setError(errorMessage)
      showError(errorMessage)
      logger.error('Ошибка загрузки транзакций', { error: errorText, originalError: err })
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, sortConfig.field, sortConfig.order, debouncedCardNumber, debouncedAzsNumber, debouncedProduct, debouncedProvider, selectedProviderTab, providers, setLoading, setError, showError])

  const loadStats = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (selectedProviderTab !== null) {
        params.append('provider_id', selectedProviderTab.toString())
      }
      const response = await authFetch(`${API_URL}/api/v1/transactions/stats/summary?${params}`)
      if (response.ok) {
        const statsData = await response.json()
        setStats(statsData)
      } else {
        logger.warn('Статистика недоступна', { status: response.status })
      }
    } catch (err) {
      logger.warn('Ошибка загрузки статистики', { error: err.message })
    }
  }, [selectedProviderTab])

  const loadProviders = useCallback(async () => {
    try {
      const response = await authFetch(`${API_URL}/api/v1/providers?limit=1000`)
      if (response.ok) {
        const result = await response.json()
        setProviders(result.items)
      }
    } catch (err) {
      logger.error('Ошибка загрузки провайдеров', { error: err.message })
    }
  }, [])

  useEffect(() => {
    loadProviders()
  }, [loadProviders])

  useEffect(() => {
    setPage(0)
  }, [debouncedCardNumber, debouncedAzsNumber, debouncedProduct, selectedProviderTab])

  useEffect(() => {
    if (checkingAuth) return
    if (!authEnabled || (authEnabled && isAuthenticated)) {
      loadTransactions()
      loadStats()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, debouncedCardNumber, debouncedAzsNumber, debouncedProduct, debouncedProvider, sortConfig.field, sortConfig.order, selectedProviderTab, authEnabled, isAuthenticated, checkingAuth])

  const updatePageSize = useCallback((newSize) => {
    setPageSize(newSize)
    setPage(0)
    localStorage.setItem(PAGE_SIZE_STORAGE_KEY, newSize.toString())
  }, [])

  const handleSort = useCallback((field) => {
    setSortConfig(prev => {
      if (prev.field === field) {
        return { field, order: prev.order === 'asc' ? 'desc' : 'asc' }
      }
      return { field, order: 'desc' }
    })
    setPage(0)
  }, [])

  return {
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
    setPageSize: updatePageSize,
    loadTransactions,
    loadStats,
    loadProviders,
    handleSort,
  }
}

export default useTransactions
