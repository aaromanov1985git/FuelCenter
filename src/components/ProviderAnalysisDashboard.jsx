import React, { useState, useEffect, useMemo, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { Card, Button, Table, Badge, Skeleton, Select, Checkbox, Input } from './ui'
import { authFetch } from '../utils/api'
import { useToast } from './ToastContainer'
import { useDebounce } from '../hooks/useDebounce'
import { exportToCSV } from '../utils/exportUtils'
import { logger } from '../utils/logger'
import EmptyState from './EmptyState'
import Pagination from './Pagination'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import './ProviderAnalysisDashboard.css'

// Импортируем leaflet.markercluster для глобального доступа
import * as MarkerClusterModule from 'leaflet.markercluster'
// Добавляем в глобальный объект L
if (typeof L !== 'undefined' && MarkerClusterModule.default) {
  L.markerClusterGroup = MarkerClusterModule.default
}

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

// Исправление иконок маркера Leaflet
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

// Компонент для обновления центра карты
function ChangeView({ center, zoom }) {
  const map = useMap()
  useEffect(() => {
    if (center && map) {
      map.setView(center, zoom)
    }
  }, [center, zoom, map])
  return null
}

// Компонент для кластеризации маркеров
function MarkerCluster({ markers, createIcon, onMarkerClick }) {
  const map = useMap()
  const clusterGroupRef = useRef(null)

  useEffect(() => {
    if (!map || !markers || markers.length === 0) return

    // Проверяем доступность L.markerClusterGroup
    if (typeof L === 'undefined' || !L.markerClusterGroup) {
      logger.warn('L.markerClusterGroup не доступен, используем обычные маркеры')
      return
    }

    // Удаляем старую группу, если она существует
    if (clusterGroupRef.current) {
      map.removeLayer(clusterGroupRef.current)
      clusterGroupRef.current.clearLayers()
    }
    
    // Создаем группу кластеров
    const clusterGroup = L.markerClusterGroup({
        chunkedLoading: true,
        maxClusterRadius: 50, // Радиус кластеризации в пикселях
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        iconCreateFunction: function(cluster) {
          const count = cluster.getChildCount()
          return L.divIcon({
            html: `<div style="
              background-color: var(--color-primary);
              color: white;
              border-radius: 50%;
              width: 40px;
              height: 40px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: bold;
              font-size: 14px;
              border: 3px solid white;
              box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            ">${count}</div>`,
            className: 'marker-cluster',
            iconSize: L.point(40, 40)
          })
        }
      })

      // Добавляем маркеры в группу
      markers.forEach(markerData => {
        const marker = L.marker([markerData.lat, markerData.lon], {
          icon: createIcon(markerData.count, markerData.maxCount)
        })
        
        // Добавляем popup
        const popupContent = `
          <div class="marker-popup">
            <h4>${markerData.name}</h4>
            <p><strong>Заправок:</strong> ${markerData.count}</p>
            <p><strong>Объём:</strong> ${markerData.volume}</p>
            <p><strong>Сумма:</strong> ${markerData.amount}</p>
            ${markerData.fuelTypesHtml || ''}
          </div>
        `
        marker.bindPopup(popupContent)
        
        // Обработчик клика
        marker.on('click', () => {
          if (onMarkerClick) {
            onMarkerClick(markerData.id)
          }
        })
        
        clusterGroup.addLayer(marker)
      })

    // Добавляем группу на карту
    clusterGroup.addTo(map)
    clusterGroupRef.current = clusterGroup

    // Очистка при размонтировании
    return () => {
      if (clusterGroupRef.current) {
        map.removeLayer(clusterGroupRef.current)
        clusterGroupRef.current.clearLayers()
        clusterGroupRef.current = null
      }
    }
  }, [map, markers, createIcon, onMarkerClick])

  return null
}

// Кастомная иконка маркера с размером в зависимости от количества транзакций
function createCustomIcon(transactionCount, maxCount) {
  const size = Math.max(20, Math.min(40, 20 + (transactionCount / maxCount) * 20))
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      width: ${size}px;
      height: ${size}px;
      background-color: var(--color-primary);
      border: 2px solid white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      font-size: ${size * 0.4}px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    ">⛽</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

const formatDateTime = (value) => {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString('ru-RU')
  } catch {
    return value
  }
}

const formatNumber = (value) => {
  if (!value && value !== 0) return '—'
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

const formatLiters = (value) => {
  if (!value && value !== 0) return '—'
  return `${formatNumber(value)} л`
}

const formatCurrency = (value) => {
  if (!value && value !== 0) return '—'
  return `${formatNumber(value)} ₽`
}

const ProviderAnalysisDashboard = () => {
  const { error: showError, success } = useToast()
  
  // Состояния для данных
  const [transactions, setTransactions] = useState([])
  const [allLoadedTransactions, setAllLoadedTransactions] = useState([]) // Все загруженные транзакции для агрегации
  const [gasStations, setGasStations] = useState([])
  const [fuelCards, setFuelCards] = useState([])
  const [providers, setProviders] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  // Фильтры
  const [selectedProvider, setSelectedProvider] = useState(null) // ID провайдера или null для "Все"
  const [selectedCards, setSelectedCards] = useState([]) // массив ID карт или 'all'
  const [selectedGasStations, setSelectedGasStations] = useState([]) // массив ID АЗС или 'all'
  const [selectedFuelTypes, setSelectedFuelTypes] = useState([]) // массив типов топлива
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [quickPeriod, setQuickPeriod] = useState('') // '24h', 'week', 'month', 'year'
  
  // Поиск
  const [gasStationSearch, setGasStationSearch] = useState('')
  const [cardSearch, setCardSearch] = useState('')
  const debouncedGasStationSearch = useDebounce(gasStationSearch, 300)
  const debouncedCardSearch = useDebounce(cardSearch, 300)
  
  // Пагинация
  const [currentPage, setCurrentPage] = useState(1)
  const [limit] = useState(50)
  const [total, setTotal] = useState(0)
  
  // Пагинация для детализации транзакций
  const [detailCurrentPage, setDetailCurrentPage] = useState(1)
  const [detailLimit] = useState(10)
  
  // Пагинация для сводки по картам
  const [cardsSummaryCurrentPage, setCardsSummaryCurrentPage] = useState(1)
  const [cardsSummaryLimit] = useState(10)
  
  // Сортировка
  const [sortConfig, setSortConfig] = useState({ field: 'transaction_date', order: 'desc' })
  
  // Выбранный маркер на карте
  const [selectedMarker, setSelectedMarker] = useState(null)
  
  // Полноэкранный режим карты
  const [isMapFullscreen, setIsMapFullscreen] = useState(false)
  
  // Выбранная карта для детализации
  const [selectedCardForDetails, setSelectedCardForDetails] = useState(null)
  
  // Типы топлива теперь вычисляются из отфильтрованных транзакций
  // Используем useMemo для оптимизации (определяем здесь, чтобы использовать в useEffect ниже)
  const availableFuelTypes = useMemo(() => {
    if (allLoadedTransactions.length === 0) {
      return []
    }
    // Извлекаем уникальные типы топлива из отфильтрованных транзакций
    const uniqueTypes = [...new Set(
      allLoadedTransactions
        .map(t => t.product)
        .filter(Boolean) // Убираем null/undefined
    )].sort() // Сортируем для консистентности
    
    logger.debug('Доступные типы топлива из отфильтрованных транзакций', { 
      count: uniqueTypes.length, 
      types: uniqueTypes 
    })
    
    return uniqueTypes
  }, [allLoadedTransactions])
  
  // Загрузка справочников
  useEffect(() => {
    loadProviders()
    loadFuelCards()
    loadGasStations()
    // Типы топлива теперь извлекаются из отфильтрованных транзакций
  }, [])
  
  // Перезагрузка АЗС при изменении провайдера (на случай, если нужна фильтрация на сервере)
  useEffect(() => {
    // Можно добавить перезагрузку, если API поддерживает фильтрацию по провайдеру
    // Пока оставляем клиентскую фильтрацию
  }, [selectedProvider])
  
  // Применение быстрого периода
  useEffect(() => {
    if (quickPeriod) {
      const now = new Date()
      const from = new Date()
      
      switch (quickPeriod) {
        case '24h':
          from.setHours(now.getHours() - 24)
          break
        case 'week':
          from.setDate(now.getDate() - 7)
          break
        case 'month':
          from.setMonth(now.getMonth() - 1)
          break
        case 'year':
          from.setFullYear(now.getFullYear() - 1)
          break
        default:
          return
      }
      
      setDateFrom(from.toISOString().split('T')[0])
      setDateTo(now.toISOString().split('T')[0])
    }
  }, [quickPeriod])
  
  // Сброс страницы на 1 при изменении фильтров (кроме currentPage и sortConfig)
  const prevFiltersRef = useRef({ dateFrom, dateTo, selectedProvider, selectedCards, selectedGasStations, selectedFuelTypes })
  useEffect(() => {
    const prevFilters = prevFiltersRef.current
    const filtersChanged = 
      prevFilters.dateFrom !== dateFrom ||
      prevFilters.dateTo !== dateTo ||
      prevFilters.selectedProvider !== selectedProvider ||
      JSON.stringify(prevFilters.selectedCards) !== JSON.stringify(selectedCards) ||
      JSON.stringify(prevFilters.selectedGasStations) !== JSON.stringify(selectedGasStations) ||
      JSON.stringify(prevFilters.selectedFuelTypes) !== JSON.stringify(selectedFuelTypes)
    
    if (filtersChanged && currentPage !== 1) {
      logger.debug('Фильтры изменились, сбрасываем страницу на 1')
      setCurrentPage(1)
    }
    
    prevFiltersRef.current = { dateFrom, dateTo, selectedProvider, selectedCards, selectedGasStations, selectedFuelTypes }
  }, [dateFrom, dateTo, selectedProvider, selectedCards, selectedGasStations, selectedFuelTypes, currentPage])
  
  // Очистка выбранных типов топлива, если они больше не доступны
  useEffect(() => {
    if (availableFuelTypes.length > 0 && selectedFuelTypes.length > 0) {
      const validSelectedTypes = selectedFuelTypes.filter(ft => availableFuelTypes.includes(ft))
      if (validSelectedTypes.length !== selectedFuelTypes.length) {
        logger.debug('Очистка недоступных типов топлива из выбранных', {
          before: selectedFuelTypes,
          after: validSelectedTypes,
          available: availableFuelTypes
        })
        setSelectedFuelTypes(validSelectedTypes)
      }
    }
  }, [availableFuelTypes])
  
  // Сброс выбранной карты при изменении фильтров (кроме сортировки)
  useEffect(() => {
    if (selectedCardForDetails) {
      setSelectedCardForDetails(null)
    }
    setDetailCurrentPage(1) // Сбрасываем страницу детализации
    setCardsSummaryCurrentPage(1) // Сбрасываем страницу сводки по картам
  }, [dateFrom, dateTo, selectedProvider, selectedCards, selectedGasStations, selectedFuelTypes])
  
  // Сброс страницы детализации при изменении выбранной карты
  useEffect(() => {
    setDetailCurrentPage(1)
  }, [selectedCardForDetails])
  
  // Загрузка транзакций при изменении фильтров
  useEffect(() => {
    loadTransactions()
  }, [currentPage, sortConfig, dateFrom, dateTo, selectedProvider, selectedCards, selectedGasStations, selectedFuelTypes])
  
  const loadProviders = async () => {
    try {
      const response = await authFetch(`${API_URL}/api/v1/providers?limit=1000`)
      if (response.ok) {
        const result = await response.json()
        setProviders(result.items.filter(p => p.is_active))
      }
    } catch (err) {
      if (!err.isUnauthorized) {
        logger.error('Ошибка загрузки провайдеров', { error: err.message })
      }
    }
  }
  
  const loadFuelCards = async () => {
    try {
      // Бэкенд может ограничивать limit, поэтому загружаем порциями
      let allCards = []
      let skip = 0
      const limit = 1000 // Максимальный лимит API
      let hasMore = true
      
      while (hasMore) {
        const response = await authFetch(`${API_URL}/api/v1/fuel-cards?skip=${skip}&limit=${limit}`)
        
        if (!response.ok) {
          logger.error('Ошибка загрузки карт', { status: response.status, skip, limit })
          break
        }
        
        const result = await response.json()
        const items = result.items || []
        allCards = [...allCards, ...items]
        
        // Если получили меньше записей, чем запрашивали, значит это последняя страница
        if (items.length < limit || allCards.length >= result.total) {
          hasMore = false
        } else {
          skip += limit
        }
      }
      
      setFuelCards(allCards)
    } catch (err) {
      if (!err.isUnauthorized) {
        logger.error('Ошибка загрузки карт', { error: err.message })
      }
    }
  }
  
  const loadGasStations = async () => {
    try {
      // Бэкенд ограничивает limit до 1000, поэтому загружаем порциями
      let allGasStations = []
      let skip = 0
      const limit = 1000 // Максимальный лимит API
      let hasMore = true
      
      while (hasMore) {
        const response = await authFetch(`${API_URL}/api/v1/gas-stations?skip=${skip}&limit=${limit}`)
        
        if (!response.ok) {
          const errorText = await response.text()
          logger.error('Ошибка загрузки АЗС', { status: response.status, error: errorText, skip, limit })
          showError(`Ошибка загрузки АЗС: ${response.status}`)
          break
        }
        
        const result = await response.json()
        const items = result.items || []
        allGasStations = [...allGasStations, ...items]
        
        // Если получили меньше записей, чем запрашивали, значит это последняя страница
        if (items.length < limit || allGasStations.length >= result.total) {
          hasMore = false
        } else {
          skip += limit
        }
      }
      
      logger.debug('АЗС загружены', { count: allGasStations.length })
      setGasStations(allGasStations)
    } catch (err) {
      if (!err.isUnauthorized) {
        logger.error('Ошибка загрузки АЗС', { error: err.message })
        showError(`Ошибка загрузки АЗС: ${err.message}`)
      }
    }
  }
  
  const loadTransactions = async () => {
    logger.debug('Начало загрузки транзакций для дашборда', {
      currentPage,
      selectedProvider,
      dateFrom,
      dateTo,
      selectedCards: selectedCards.length,
      selectedGasStations: selectedGasStations.length,
      selectedFuelTypes: selectedFuelTypes.length
    })
    
    setLoading(true)
    setError('')
    
    try {
      // Определяем, нужно ли загружать все данные для клиентской фильтрации
      const hasMultipleFilters = 
        (selectedCards.length > 1 || (selectedCards.length === 1 && !selectedCards.includes('all'))) ||
        (selectedGasStations.length > 1 || (selectedGasStations.length === 1 && !selectedGasStations.includes('all'))) ||
        selectedFuelTypes.length > 1
      
      // Базовые параметры запроса
      const baseParams = new URLSearchParams()
      baseParams.append('sort_by', sortConfig.field)
      baseParams.append('sort_order', sortConfig.order)
      
      // Фильтры
      if (dateFrom) {
        baseParams.append('date_from', dateFrom)
      }
      if (dateTo) {
        baseParams.append('date_to', `${dateTo} 23:59:59`)
      }
      
      // Фильтр по провайдеру
      if (selectedProvider) {
        baseParams.append('provider_id', selectedProvider.toString())
      }
      
      // Фильтр по картам (только если выбрана одна карта)
      if (selectedCards.length === 1 && !selectedCards.includes('all')) {
        const card = fuelCards.find(c => c.id === selectedCards[0])
        if (card) {
          baseParams.append('card_number', card.card_number)
        }
      }
      
      // Фильтр по АЗС (только если выбрана одна АЗС)
      if (selectedGasStations.length === 1 && !selectedGasStations.includes('all')) {
        const azs = gasStations.find(g => g.id === selectedGasStations[0])
        if (azs && azs.azs_number) {
          baseParams.append('azs_number', azs.azs_number)
        }
      }
      
      // Фильтр по типу топлива (только если выбран один тип)
      if (selectedFuelTypes.length === 1) {
        baseParams.append('product', selectedFuelTypes[0])
      }
      
      // Всегда загружаем все данные для агрегации, но показываем только одну страницу в таблице
      // Это нужно для корректного отображения KPI, графиков и карты
      let allTransactions = []
      let totalCount = 0
      const apiLimit = 1000 // Максимальный лимит API
      let skip = 0
      let hasMore = true
      
      while (hasMore) {
        const params = new URLSearchParams(baseParams)
        params.append('skip', skip.toString())
        params.append('limit', apiLimit.toString())
        
        const response = await authFetch(`${API_URL}/api/v1/transactions?${params}`)
        
        if (!response.ok) {
          const errorText = await response.text()
          logger.error('Ошибка загрузки транзакций', { status: response.status, error: errorText, skip, limit: apiLimit })
          throw new Error(`Ошибка загрузки данных: ${response.status}`)
        }
        
        const result = await response.json()
        const items = result.items || []
        allTransactions = [...allTransactions, ...items]
        totalCount = result.total || allTransactions.length
        
        // Если получили меньше записей, чем запрашивали, значит это последняя страница
        if (items.length < apiLimit || allTransactions.length >= totalCount) {
          hasMore = false
        } else {
          skip += apiLimit
        }
      }
      
      // Обогащаем транзакции данными об АЗС
      let enrichedTransactions = allTransactions.map(t => {
        // Ищем АЗС по gas_station_id или по azs_number
        let gasStation = null
        if (t.gas_station_id) {
          gasStation = gasStations.find(g => g.id === t.gas_station_id)
        }
        // Если не нашли по ID, пробуем найти по номеру АЗС
        if (!gasStation && t.azs_number) {
          gasStation = gasStations.find(g => g.azs_number === t.azs_number)
        }
        
        return {
          ...t,
          gasStationName: gasStation?.name || gasStation?.original_name || t.azs_number || '—',
          gasStationLat: gasStation?.latitude ? parseFloat(gasStation.latitude) : null,
          gasStationLon: gasStation?.longitude ? parseFloat(gasStation.longitude) : null,
          // Обновляем gas_station_id, если нашли по номеру
          gas_station_id: gasStation?.id || t.gas_station_id,
        }
      })
      
      // Фильтрация на клиенте для множественного выбора
      // Фильтр по картам (если выбрано несколько)
      if (selectedCards.length > 1 || (selectedCards.length === 1 && !selectedCards.includes('all'))) {
        const selectedCardNumbers = selectedCards
          .filter(id => id !== 'all')
          .map(id => {
            const card = fuelCards.find(c => c.id === id)
            return card?.card_number
          })
          .filter(Boolean)
        if (selectedCardNumbers.length > 0) {
          enrichedTransactions = enrichedTransactions.filter(t => 
            selectedCardNumbers.includes(t.card_number)
          )
        }
      }
      
      // Фильтр по АЗС (если выбрано несколько)
      if (selectedGasStations.length > 1 || (selectedGasStations.length === 1 && !selectedGasStations.includes('all'))) {
        const selectedAzsIds = selectedGasStations
          .filter(id => id !== 'all')
          .map(id => parseInt(id))
          .filter(id => !isNaN(id))
        if (selectedAzsIds.length > 0) {
          enrichedTransactions = enrichedTransactions.filter(t => 
            t.gas_station_id && selectedAzsIds.includes(t.gas_station_id)
          )
        }
      }
      
      // Фильтр по типу топлива (если выбрано несколько)
      if (selectedFuelTypes.length > 1) {
        enrichedTransactions = enrichedTransactions.filter(t => 
          t.product && selectedFuelTypes.includes(t.product)
        )
      }
      
      // Сохраняем все загруженные транзакции для агрегации (до пагинации)
      setAllLoadedTransactions(enrichedTransactions)
      
      // Применяем пагинацию для отображения в таблице
      const startIndex = Math.max(0, (currentPage - 1) * limit)
      const endIndex = Math.min(startIndex + limit, enrichedTransactions.length)
      const finalTransactions = enrichedTransactions.slice(startIndex, endIndex)
      const finalTotal = enrichedTransactions.length
      
      // Проверяем, что страница не выходит за границы
      const maxPage = Math.ceil(finalTotal / limit) || 1
      if (currentPage > maxPage && maxPage > 0) {
        logger.warn('Текущая страница больше максимальной, сбрасываем на 1', {
          currentPage,
          maxPage,
          total: finalTotal
        })
        // Не меняем здесь, чтобы избежать бесконечного цикла
        // setCurrentPage(1) будет вызван в useEffect выше
      }
      
      logger.debug('Транзакции загружены и обработаны', {
        totalLoaded: allTransactions.length,
        totalEnriched: enrichedTransactions.length,
        totalForTable: finalTotal,
        currentPage,
        limit,
        startIndex,
        endIndex,
        finalTransactionsLength: finalTransactions.length,
        hasMultipleFilters,
        firstTransaction: finalTransactions.length > 0 ? {
          id: finalTransactions[0].id,
          date: finalTransactions[0].transaction_date,
          gasStation: finalTransactions[0].gasStationName,
          card: finalTransactions[0].card_number
        } : 'нет транзакций'
      })
      
      // Всегда устанавливаем данные, даже если массив пустой
      setTransactions(finalTransactions)
      setTotal(finalTotal)
      
      logger.debug('Транзакции установлены в состояние', { 
        count: finalTransactions.length,
        total: finalTotal,
        currentPage,
        startIndex,
        endIndex,
        enrichedCount: enrichedTransactions.length,
        firstTransactionId: finalTransactions.length > 0 ? finalTransactions[0].id : null
      })
      
      // Типы топлива теперь вычисляются через useMemo из allLoadedTransactions
      // Не нужно здесь устанавливать fuelTypes
    } catch (err) {
      if (err.isUnauthorized) {
        return
      }
      setError(err.message || 'Ошибка загрузки данных')
      showError(err.message || 'Ошибка загрузки данных')
    } finally {
      setLoading(false)
    }
  }
  
  // Агрегированные данные для карты и аналитики
  // Используем все загруженные транзакции, а не только отображаемые в таблице
  const aggregatedData = useMemo(() => {
    const transactionsForAggregation = allLoadedTransactions.length > 0 ? allLoadedTransactions : transactions
    if (!transactionsForAggregation.length) return { byGasStation: {}, byFuelType: {}, kpi: null }
    
    const byGasStation = {}
    const byFuelType = {}
    let totalVolume = 0
    let totalAmount = 0
    let totalCount = transactionsForAggregation.length
    const uniqueGasStations = new Set()
    
    transactionsForAggregation.forEach(t => {
      // Используем amount_with_discount, если есть, иначе amount
      const transactionAmount = parseFloat(t.amount_with_discount || t.amount || 0)
      
      const gasStationId = t.gas_station_id
      if (gasStationId) {
        uniqueGasStations.add(gasStationId)
        
        if (!byGasStation[gasStationId]) {
          byGasStation[gasStationId] = {
            id: gasStationId,
            name: t.gasStationName,
            lat: t.gasStationLat,
            lon: t.gasStationLon,
            count: 0,
            volume: 0,
            amount: 0,
            fuelTypes: {}
          }
        }
        
        byGasStation[gasStationId].count++
        byGasStation[gasStationId].volume += parseFloat(t.quantity || 0)
        byGasStation[gasStationId].amount += transactionAmount
        
        const fuelType = t.product || 'Неизвестно'
        if (!byGasStation[gasStationId].fuelTypes[fuelType]) {
          byGasStation[gasStationId].fuelTypes[fuelType] = { count: 0, volume: 0 }
        }
        byGasStation[gasStationId].fuelTypes[fuelType].count++
        byGasStation[gasStationId].fuelTypes[fuelType].volume += parseFloat(t.quantity || 0)
      }
      
      const fuelType = t.product || 'Неизвестно'
      if (!byFuelType[fuelType]) {
        byFuelType[fuelType] = { count: 0, volume: 0, amount: 0 }
      }
      byFuelType[fuelType].count++
      byFuelType[fuelType].volume += parseFloat(t.quantity || 0)
      byFuelType[fuelType].amount += transactionAmount
      
      totalVolume += parseFloat(t.quantity || 0)
      totalAmount += transactionAmount
    })
    
    // Находим любимую АЗС
    const favoriteGasStation = Object.values(byGasStation).reduce((max, gs) => 
      gs.count > (max?.count || 0) ? gs : max, null
    )
    
    // Находим основной тип топлива
    const mainFuelType = Object.entries(byFuelType).reduce((max, [type, data]) => 
      data.volume > (max?.volume || 0) ? { type, ...data } : max, null
    )
    
    return {
      byGasStation,
      byFuelType,
      kpi: {
        totalCount,
        totalVolume,
        totalAmount,
        averageCheck: totalCount > 0 ? totalAmount / totalCount : 0,
        uniqueGasStations: uniqueGasStations.size,
        favoriteGasStation: favoriteGasStation ? {
          id: favoriteGasStation.id,
          name: favoriteGasStation.name,
          count: favoriteGasStation.count
        } : null,
        mainFuelType: mainFuelType ? {
          type: mainFuelType.type,
          percentage: totalVolume > 0 ? (mainFuelType.volume / totalVolume) * 100 : 0
        } : null
      }
    }
  }, [allLoadedTransactions, transactions])
  
  // Топ-10 АЗС по объёму
  const topGasStations = useMemo(() => {
    return Object.values(aggregatedData.byGasStation)
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 10)
  }, [aggregatedData])
  
  // АЗС с координатами для карты
  const gasStationsWithCoords = useMemo(() => {
    return Object.values(aggregatedData.byGasStation).filter(gs => 
      gs.lat !== null && gs.lon !== null && !isNaN(gs.lat) && !isNaN(gs.lon)
    )
  }, [aggregatedData])
  
  // АЗС без координат
  const gasStationsWithoutCoords = useMemo(() => {
    return Object.values(aggregatedData.byGasStation).filter(gs => 
      gs.lat === null || gs.lon === null || isNaN(gs.lat) || isNaN(gs.lon)
    )
  }, [aggregatedData])
  
  // Центр карты
  const mapCenter = useMemo(() => {
    if (gasStationsWithCoords.length === 0) return [55.7558, 37.6173] // Москва по умолчанию
    
    const avgLat = gasStationsWithCoords.reduce((sum, gs) => sum + gs.lat, 0) / gasStationsWithCoords.length
    const avgLon = gasStationsWithCoords.reduce((sum, gs) => sum + gs.lon, 0) / gasStationsWithCoords.length
    return [avgLat, avgLon]
  }, [gasStationsWithCoords])
  
  // Максимальное количество транзакций для нормализации размера маркеров
  const maxTransactionCount = useMemo(() => {
    if (gasStationsWithCoords.length === 0) return 1
    return Math.max(...gasStationsWithCoords.map(gs => gs.count))
  }, [gasStationsWithCoords])
  
  // Фильтрованные списки для селектов
  const filteredGasStations = useMemo(() => {
    let filtered = gasStations || []
    
    // Фильтр по провайдеру
    if (selectedProvider) {
      filtered = filtered.filter(gs => {
        // Показываем только АЗС выбранного провайдера
        // Если provider_id null или undefined, не показываем (т.к. они не принадлежат провайдеру)
        return gs.provider_id === selectedProvider
      })
    }
    // Если провайдер не выбран, показываем все АЗС
    
    // Поиск по названию
    if (debouncedGasStationSearch) {
      filtered = filtered.filter(gs => 
        gs.name?.toLowerCase().includes(debouncedGasStationSearch.toLowerCase()) ||
        gs.azs_number?.toLowerCase().includes(debouncedGasStationSearch.toLowerCase()) ||
        gs.original_name?.toLowerCase().includes(debouncedGasStationSearch.toLowerCase())
      )
    }
    
    logger.debug('Фильтрация АЗС', { 
      total: gasStations?.length || 0, 
      afterProviderFilter: filtered.length,
      selectedProvider,
      search: debouncedGasStationSearch,
      sample: filtered.slice(0, 3).map(gs => ({ id: gs.id, name: gs.name, provider_id: gs.provider_id }))
    })
    
    return filtered
  }, [gasStations, selectedProvider, debouncedGasStationSearch])
  
  const filteredCards = useMemo(() => {
    let filtered = fuelCards
    // Фильтр по провайдеру
    if (selectedProvider) {
      filtered = filtered.filter(card => card.provider_id === selectedProvider)
    }
    // Поиск по номеру карты
    if (debouncedCardSearch) {
      filtered = filtered.filter(card => 
        card.card_number?.toLowerCase().includes(debouncedCardSearch.toLowerCase())
      )
    }
    return filtered
  }, [fuelCards, selectedProvider, debouncedCardSearch])
  
  const handleSort = (field) => {
    setSortConfig(prev => ({
      field,
      order: prev.field === field && prev.order === 'asc' ? 'desc' : 'asc'
    }))
  }
  
  // Группировка транзакций по картам
  const transactionsByCard = useMemo(() => {
    const transactionsForGrouping = allLoadedTransactions.length > 0 ? allLoadedTransactions : transactions
    if (!transactionsForGrouping.length) return []
    
    const grouped = {}
    
    transactionsForGrouping.forEach(t => {
      const cardNumber = t.card_number || 'Без карты'
      if (!grouped[cardNumber]) {
        grouped[cardNumber] = {
          cardNumber,
          count: 0,
          totalVolume: 0,
          totalAmount: 0,
          transactions: []
        }
      }
      
      const transactionAmount = parseFloat(t.amount_with_discount || t.amount || 0)
      grouped[cardNumber].count++
      grouped[cardNumber].totalVolume += parseFloat(t.quantity || 0)
      grouped[cardNumber].totalAmount += transactionAmount
      grouped[cardNumber].transactions.push(t)
    })
    
    // Преобразуем в массив и сортируем по сумме (убывание)
    return Object.values(grouped).sort((a, b) => b.totalAmount - a.totalAmount)
  }, [allLoadedTransactions, transactions])
  
  // Транзакции для детализации (только выбранная карта)
  const detailTransactions = useMemo(() => {
    if (!selectedCardForDetails) {
      return []
    }
    const transactionsForDetail = allLoadedTransactions.length > 0 ? allLoadedTransactions : transactions
    let filtered = transactionsForDetail.filter(t => t.card_number === selectedCardForDetails)
    
    // Применяем сортировку
    if (sortConfig.field) {
      filtered = filtered.sort((a, b) => {
        let aVal = a[sortConfig.field]
        let bVal = b[sortConfig.field]
        
        // Обработка разных типов данных
        if (sortConfig.field === 'transaction_date') {
          aVal = new Date(aVal)
          bVal = new Date(bVal)
        } else if (sortConfig.field === 'quantity' || sortConfig.field === 'amount') {
          aVal = parseFloat(aVal || 0)
          bVal = parseFloat(bVal || 0)
        } else {
          aVal = String(aVal || '').toLowerCase()
          bVal = String(bVal || '').toLowerCase()
        }
        
        if (aVal === bVal) return 0
        if (aVal === null || aVal === undefined) return 1
        if (bVal === null || bVal === undefined) return -1
        
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortConfig.order === 'asc' ? aVal - bVal : bVal - aVal
        }
        
        if (sortConfig.order === 'asc') {
          return aVal < bVal ? -1 : 1
        } else {
          return aVal > bVal ? -1 : 1
        }
      })
    }
    
    return filtered
  }, [selectedCardForDetails, allLoadedTransactions, transactions, sortConfig])
  
  const handleExportCSV = () => {
    const headers = ['Дата и время', 'Карта', 'АЗС', 'Тип топлива', 'Объём (л)', 'Сумма (₽)']
    const data = selectedCardForDetails 
      ? detailTransactions 
      : (allLoadedTransactions.length > 0 ? allLoadedTransactions : transactions)
    const exportData = data.map(t => ({
      'Дата и время': formatDateTime(t.transaction_date),
      'Карта': t.card_number || '—',
      'АЗС': t.gasStationName,
      'Тип топлива': t.product || '—',
      'Объём (л)': formatNumber(t.quantity),
      'Сумма (₽)': formatNumber(t.amount_with_discount || t.amount)
    }))
    exportToCSV(exportData, headers, selectedCardForDetails ? `transactions_card_${selectedCardForDetails}` : 'provider_analysis_transactions')
    success('Данные экспортированы в CSV')
  }
  
  const handleMarkerClick = (gasStationId) => {
    setSelectedMarker(gasStationId)
    // НЕ применяем автоматический фильтр - маркеры остаются видимыми
    // Пользователь может применить фильтр вручную, если нужно
  }
  
  const handleQuickPeriod = (period) => {
    setQuickPeriod(period === quickPeriod ? '' : period)
  }
  
  return (
    <div className="provider-analysis-dashboard">
      <h1>Анализ Провайдера</h1>
      <p className="subtitle">Дашборд топливных транзакций с картой АЗС</p>
      
      {/* Фильтры */}
      <Card className="filters-card">
        <Card.Body>
          <div className="filters-grid">
            {/* Провайдер */}
            <div className="filter-group">
              <label>Провайдер</label>
              <Select
                value={selectedProvider ? selectedProvider.toString() : ''}
                onChange={(value) => {
                  setSelectedProvider(value ? parseInt(value) : null)
                  setCurrentPage(1) // Сбрасываем на первую страницу при изменении фильтра
                }}
                options={[
                  { value: '', label: 'Все провайдеры' },
                  ...providers.map(p => ({
                    value: p.id.toString(),
                    label: p.name
                  }))
                ]}
                fullWidth={true}
              />
            </div>
            
            {/* Топливные карты */}
            <div className="filter-group">
              <label>Топливные карты</label>
              <Input
                placeholder="Поиск по карте..."
                value={cardSearch}
                onChange={(e) => setCardSearch(e.target.value)}
                style={{ marginBottom: 'var(--spacing-xs)' }}
              />
              <div className="multiselect-container">
                <Checkbox
                  checked={selectedCards.includes('all') || selectedCards.length === 0}
                  onChange={(checked) => {
                    if (checked) {
                      setSelectedCards(['all'])
                    } else {
                      setSelectedCards([])
                    }
                  }}
                  label="Все"
                />
                <div className="multiselect-list">
                  {filteredCards.slice(0, 5).map(card => (
                    <Checkbox
                      key={card.id}
                      checked={selectedCards.includes(card.id)}
                      onChange={(checked) => {
                        if (checked) {
                          setSelectedCards(prev => prev.includes('all') ? [card.id] : [...prev, card.id])
                        } else {
                          setSelectedCards(prev => prev.filter(id => id !== card.id))
                        }
                      }}
                      label={card.card_number}
                    />
                  ))}
                </div>
              </div>
            </div>
            
            {/* АЗС */}
            <div className="filter-group">
              <label>АЗС</label>
              <Input
                placeholder="Поиск по названию..."
                value={gasStationSearch}
                onChange={(e) => setGasStationSearch(e.target.value)}
                style={{ marginBottom: 'var(--spacing-xs)' }}
              />
              <div className="multiselect-container">
                <Checkbox
                  checked={selectedGasStations.includes('all') || selectedGasStations.length === 0}
                  onChange={(checked) => {
                    if (checked) {
                      setSelectedGasStations(['all'])
                    } else {
                      setSelectedGasStations([])
                    }
                  }}
                  label="Все"
                />
                <div className="multiselect-list">
                  {filteredGasStations.length === 0 ? (
                    <div style={{ padding: '4px', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
                      {gasStations.length === 0 
                        ? 'АЗС не загружены' 
                        : selectedProvider 
                          ? 'Нет АЗС для выбранного провайдера' 
                          : 'Нет АЗС, соответствующих фильтрам'}
                    </div>
                  ) : (
                    filteredGasStations.slice(0, 5).map(gs => (
                      <Checkbox
                        key={gs.id}
                        checked={selectedGasStations.includes(gs.id)}
                        onChange={(checked) => {
                          if (checked) {
                            setSelectedGasStations(prev => prev.includes('all') ? [gs.id] : [...prev, gs.id])
                          } else {
                            setSelectedGasStations(prev => prev.filter(id => id !== gs.id))
                          }
                        }}
                        label={gs.name || gs.original_name || gs.azs_number || `АЗС #${gs.id}`}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>
            
            {/* Тип топлива */}
            <div className="filter-group">
              <label>Тип топлива</label>
              <div className="multiselect-list" style={{ maxHeight: '120px', overflowY: 'auto', padding: 'var(--spacing-xs)' }}>
                {availableFuelTypes.length === 0 ? (
                  <div style={{ padding: 'var(--spacing-xs)', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                    {loading ? 'Загрузка...' : 'Нет типов топлива'}
                  </div>
                ) : (
                  availableFuelTypes.map((fuelType, index) => (
                    <Checkbox
                      key={`fuel-type-${fuelType}-${index}`}
                      checked={selectedFuelTypes.includes(fuelType)}
                      onChange={(checked) => {
                        if (checked) {
                          setSelectedFuelTypes(prev => [...prev, fuelType])
                        } else {
                          setSelectedFuelTypes(prev => prev.filter(ft => ft !== fuelType))
                        }
                      }}
                      label={fuelType}
                    />
                  ))
                )}
              </div>
            </div>
            
            {/* Период */}
            <div className="filter-group">
              <label>Период</label>
              <div className="quick-periods">
                <Button
                  variant={quickPeriod === '24h' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => handleQuickPeriod('24h')}
                >
                  24 ч
                </Button>
                <Button
                  variant={quickPeriod === 'week' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => handleQuickPeriod('week')}
                >
                  Неделя
                </Button>
                <Button
                  variant={quickPeriod === 'month' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => handleQuickPeriod('month')}
                >
                  Месяц
                </Button>
                <Button
                  variant={quickPeriod === 'year' ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => handleQuickPeriod('year')}
                >
                  Год
                </Button>
              </div>
              <div className="date-range">
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  placeholder="От"
                  style={{ marginTop: '8px' }}
                />
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  placeholder="До"
                  style={{ marginTop: '8px' }}
                />
              </div>
            </div>
          </div>
        </Card.Body>
      </Card>
      
      {/* KPI карточки */}
      {aggregatedData.kpi && (
        <div className="kpi-cards">
          <Card>
            <Card.Body>
              <div className="kpi-value">{aggregatedData.kpi.totalCount}</div>
              <div className="kpi-label">Всего заправок</div>
            </Card.Body>
          </Card>
          <Card>
            <Card.Body>
              <div className="kpi-value">{formatLiters(aggregatedData.kpi.totalVolume)}</div>
              <div className="kpi-label">Общий объём</div>
            </Card.Body>
          </Card>
          <Card>
            <Card.Body>
              <div className="kpi-value">{formatCurrency(aggregatedData.kpi.totalAmount)}</div>
              <div className="kpi-label">Общая сумма</div>
            </Card.Body>
          </Card>
          <Card>
            <Card.Body>
              <div className="kpi-value">{formatCurrency(aggregatedData.kpi.averageCheck)}</div>
              <div className="kpi-label">Средний чек</div>
            </Card.Body>
          </Card>
          <Card>
            <Card.Body>
              <div className="kpi-value">{aggregatedData.kpi.uniqueGasStations}</div>
              <div className="kpi-label">Уникальных АЗС</div>
            </Card.Body>
          </Card>
        </div>
      )}
      
      {/* Карта */}
      {!isMapFullscreen && (
        <Card className="map-card" style={{ marginBottom: 'var(--spacing-section)' }}>
          <Card.Body>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0 }}>Карта заправок</h3>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsMapFullscreen(!isMapFullscreen)}
                style={{ minWidth: 'auto', padding: '6px 12px' }}
              >
                {isMapFullscreen ? '✕ Свернуть' : '⛶ Развернуть'}
              </Button>
            </div>
            {gasStationsWithCoords.length > 0 ? (
              <div className="map-container-wrapper">
                <MapContainer
                  center={mapCenter}
                  zoom={6}
                  style={{ height: '500px', width: '100%' }}
                  className="map-container"
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <ChangeView center={mapCenter} zoom={6} />
                  <MarkerCluster
                    markers={gasStationsWithCoords.map(gs => ({
                      id: gs.id,
                      lat: gs.lat,
                      lon: gs.lon,
                      name: gs.name,
                      count: gs.count,
                      volume: formatLiters(gs.volume),
                      amount: formatCurrency(gs.amount),
                      maxCount: maxTransactionCount,
                      fuelTypesHtml: Object.keys(gs.fuelTypes).length > 0 ? `
                        <div class="fuel-types-distribution">
                          <strong>Топливо:</strong>
                          ${Object.entries(gs.fuelTypes).map(([type, data], idx) => {
                            const percentage = gs.volume > 0 ? (data.volume / gs.volume) * 100 : 0
                            return `<div class="fuel-type-item">${type}: ${percentage.toFixed(1)}%</div>`
                          }).join('')}
                        </div>
                      ` : ''
                    }))}
                    createIcon={createCustomIcon}
                    onMarkerClick={handleMarkerClick}
                  />
                </MapContainer>
              </div>
            ) : (
              <EmptyState message="Нет АЗС с координатами для отображения на карте" />
            )}
            
            {gasStationsWithoutCoords.length > 0 && (
              <div className="no-coords-list">
                <h4>АЗС без геопозиции ({gasStationsWithoutCoords.length})</h4>
                <ul>
                  {gasStationsWithoutCoords.slice(0, 5).map(gs => (
                    <li key={gs.id}>{gs.name} — {gs.count} заправок</li>
                  ))}
                </ul>
              </div>
            )}
          </Card.Body>
        </Card>
      )}
      
      {/* Транзакции в два столбца */}
      {!isMapFullscreen && (
        <div className="transactions-layout">
          {/* Часть 1: Группировка по картам */}
          <Card className="transactions-card">
            <Card.Body>
              <div className="table-header">
                <h3>Сводка по картам</h3>
                {selectedCardForDetails && (
                  <Button variant="secondary" size="sm" onClick={() => setSelectedCardForDetails(null)}>
                    Сбросить выбор
                  </Button>
                )}
              </div>
              {loading ? (
                <Skeleton count={5} />
              ) : transactionsByCard.length === 0 ? (
                <EmptyState message="Нет данных для отображения" />
              ) : (
                <>
                  <div className="table-wrapper" style={{ overflowX: 'auto' }}>
                    <table className="ui-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid var(--color-border)' }}>Карта</th>
                          <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid var(--color-border)' }}>Количество операций</th>
                          <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid var(--color-border)' }}>Общий объём (л)</th>
                          <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid var(--color-border)' }}>Общая сумма (₽)</th>
                          <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid var(--color-border)' }}>Средний чек (₽)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transactionsByCard
                          .slice((cardsSummaryCurrentPage - 1) * cardsSummaryLimit, cardsSummaryCurrentPage * cardsSummaryLimit)
                          .map((cardData, index) => (
                          <tr 
                            key={cardData.cardNumber || index}
                            onClick={() => setSelectedCardForDetails(cardData.cardNumber === 'Без карты' ? null : cardData.cardNumber)}
                            style={{ 
                              borderBottom: '1px solid var(--color-border)',
                              cursor: 'pointer',
                              backgroundColor: selectedCardForDetails === cardData.cardNumber ? 'var(--color-primary-light)' : 'transparent',
                              transition: 'background-color 0.2s'
                            }}
                            onMouseEnter={(e) => {
                              if (selectedCardForDetails !== cardData.cardNumber) {
                                e.currentTarget.style.backgroundColor = 'var(--color-bg-secondary)'
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (selectedCardForDetails !== cardData.cardNumber) {
                                e.currentTarget.style.backgroundColor = 'transparent'
                              }
                            }}
                          >
                            <td style={{ padding: '12px', fontWeight: selectedCardForDetails === cardData.cardNumber ? '600' : 'normal' }}>
                              {cardData.cardNumber}
                            </td>
                            <td style={{ padding: '12px' }}>{cardData.count}</td>
                            <td style={{ padding: '12px' }}>{formatLiters(cardData.totalVolume)}</td>
                            <td style={{ padding: '12px' }}>{formatCurrency(cardData.totalAmount)}</td>
                            <td style={{ padding: '12px' }}>{formatCurrency(cardData.count > 0 ? cardData.totalAmount / cardData.count : 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {transactionsByCard.length > 0 && (
                    <Pagination
                      currentPage={cardsSummaryCurrentPage}
                      totalPages={Math.ceil(transactionsByCard.length / cardsSummaryLimit)}
                      total={transactionsByCard.length}
                      pageSize={cardsSummaryLimit}
                      onPageChange={(page) => {
                        setCardsSummaryCurrentPage(page)
                        // Прокручиваем к началу таблицы при смене страницы
                        const tableElement = document.querySelector('.transactions-card')
                        if (tableElement) {
                          tableElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        }
                      }}
                    />
                  )}
                </>
              )}
            </Card.Body>
          </Card>
          
          {/* Часть 2: Детализация по выбранной карте */}
          {selectedCardForDetails && (
            <Card className="transactions-card">
              <Card.Body>
                <div className="table-header">
                  <h3>Детализация транзакций: {selectedCardForDetails}</h3>
                  <Button variant="secondary" size="sm" onClick={handleExportCSV}>
                    Экспорт CSV
                  </Button>
                </div>
                {loading ? (
                  <Skeleton count={5} />
                ) : detailTransactions.length === 0 ? (
                  <EmptyState message="Нет транзакций для выбранной карты" />
                ) : (
                  <>
                    <div className="table-wrapper" style={{ overflowX: 'auto' }}>
                      <table className="ui-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            <th 
                              onClick={() => handleSort('transaction_date')}
                              style={{ cursor: 'pointer', userSelect: 'none', padding: '12px', textAlign: 'left', borderBottom: '2px solid var(--color-border)' }}
                            >
                              Дата и время
                              {sortConfig.field === 'transaction_date' && (
                                <span style={{ marginLeft: '4px' }}>{sortConfig.order === 'asc' ? ' ↑' : ' ↓'}</span>
                              )}
                            </th>
                            <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid var(--color-border)' }}>АЗС</th>
                            <th 
                              onClick={() => handleSort('product')}
                              style={{ cursor: 'pointer', userSelect: 'none', padding: '12px', textAlign: 'left', borderBottom: '2px solid var(--color-border)' }}
                            >
                              Тип топлива
                              {sortConfig.field === 'product' && (
                                <span style={{ marginLeft: '4px' }}>{sortConfig.order === 'asc' ? ' ↑' : ' ↓'}</span>
                              )}
                            </th>
                            <th 
                              onClick={() => handleSort('quantity')}
                              style={{ cursor: 'pointer', userSelect: 'none', padding: '12px', textAlign: 'left', borderBottom: '2px solid var(--color-border)' }}
                            >
                              Объём (л)
                              {sortConfig.field === 'quantity' && (
                                <span style={{ marginLeft: '4px' }}>{sortConfig.order === 'asc' ? ' ↑' : ' ↓'}</span>
                              )}
                            </th>
                            <th 
                              onClick={() => handleSort('amount')}
                              style={{ cursor: 'pointer', userSelect: 'none', padding: '12px', textAlign: 'left', borderBottom: '2px solid var(--color-border)' }}
                            >
                              Сумма (₽)
                              {sortConfig.field === 'amount' && (
                                <span style={{ marginLeft: '4px' }}>{sortConfig.order === 'asc' ? ' ↑' : ' ↓'}</span>
                              )}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailTransactions
                            .slice((detailCurrentPage - 1) * detailLimit, detailCurrentPage * detailLimit)
                            .map(t => (
                            <tr key={t.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                              <td style={{ padding: '12px' }}>{formatDateTime(t.transaction_date)}</td>
                              <td style={{ padding: '12px' }}>{t.gasStationName}</td>
                              <td style={{ padding: '12px' }}>{t.product || '—'}</td>
                              <td style={{ padding: '12px' }}>{formatLiters(t.quantity)}</td>
                              <td style={{ padding: '12px' }}>{formatCurrency(t.amount_with_discount || t.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {detailTransactions.length > 0 && (
                      <Pagination
                        currentPage={detailCurrentPage}
                        totalPages={Math.ceil(detailTransactions.length / detailLimit)}
                        total={detailTransactions.length}
                        pageSize={detailLimit}
                        onPageChange={(page) => {
                          setDetailCurrentPage(page)
                          // Прокручиваем к началу таблицы при смене страницы
                          const tableElement = document.querySelector('.transactions-card')
                          if (tableElement) {
                            tableElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
                          }
                        }}
                      />
                    )}
                  </>
                )}
              </Card.Body>
            </Card>
          )}
        </div>
      )}
      
      {/* Полноэкранная карта */}
      {isMapFullscreen && (
        <Card className="map-card map-card-fullscreen">
          <Card.Body>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0 }}>Карта заправок</h3>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsMapFullscreen(false)}
                style={{ minWidth: 'auto', padding: '6px 12px' }}
              >
                ✕ Свернуть
              </Button>
            </div>
            {gasStationsWithCoords.length > 0 ? (
              <div className="map-container-wrapper map-container-fullscreen">
                <MapContainer
                  center={mapCenter}
                  zoom={6}
                  style={{ height: 'calc(100vh - 200px)', width: '100%' }}
                  className="map-container"
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <ChangeView center={mapCenter} zoom={6} />
                  <MarkerCluster
                    markers={gasStationsWithCoords.map(gs => ({
                      id: gs.id,
                      lat: gs.lat,
                      lon: gs.lon,
                      name: gs.name,
                      count: gs.count,
                      volume: formatLiters(gs.volume),
                      amount: formatCurrency(gs.amount),
                      maxCount: maxTransactionCount,
                      fuelTypesHtml: Object.keys(gs.fuelTypes).length > 0 ? `
                        <div class="fuel-types-distribution">
                          <strong>Топливо:</strong>
                          ${Object.entries(gs.fuelTypes).map(([type, data], idx) => {
                            const percentage = gs.volume > 0 ? (data.volume / gs.volume) * 100 : 0
                            return `<div class="fuel-type-item">${type}: ${percentage.toFixed(1)}%</div>`
                          }).join('')}
                        </div>
                      ` : ''
                    }))}
                    createIcon={createCustomIcon}
                    onMarkerClick={handleMarkerClick}
                  />
                </MapContainer>
              </div>
            ) : (
              <EmptyState message="Нет АЗС с координатами для отображения на карте" />
            )}
            
            {gasStationsWithoutCoords.length > 0 && (
              <div className="no-coords-list">
                <h4>АЗС без геопозиции ({gasStationsWithoutCoords.length})</h4>
                <ul>
                  {gasStationsWithoutCoords.slice(0, 5).map(gs => (
                    <li key={gs.id}>{gs.name} — {gs.count} заправок</li>
                  ))}
                </ul>
              </div>
            )}
          </Card.Body>
        </Card>
      )}
      
      {/* Аналитические блоки */}
      <div className="analytics-section">
        {/* Распределение по АЗС */}
        <Card>
          <Card.Body>
            <h3>ТОП-10 АЗС по объёму</h3>
            {aggregatedData.kpi?.favoriteGasStation && (
              <div className="favorite-azs">
                <strong>Любимая АЗС:</strong> {aggregatedData.kpi.favoriteGasStation.name} 
                ({aggregatedData.kpi.favoriteGasStation.count} заправок)
              </div>
            )}
            {topGasStations.length > 0 ? (
              <div className="bar-chart">
                {topGasStations.map((gs, idx) => {
                  const maxVolume = topGasStations[0]?.volume || 1
                  const widthPercent = (gs.volume / maxVolume) * 100
                  return (
                    <div key={gs.id} className="bar-item">
                      <div className="bar-label">{gs.name}</div>
                      <div className="bar-wrapper">
                        <div
                          className="bar"
                          style={{ width: `${widthPercent}%` }}
                          title={`${formatLiters(gs.volume)}, ${gs.count} заправок`}
                        >
                          <span className="bar-value">{formatLiters(gs.volume)}</span>
                        </div>
                      </div>
                      <div className="bar-count">{gs.count} заправок</div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <EmptyState message="Нет данных" />
            )}
          </Card.Body>
        </Card>
        
        {/* Распределение по топливу */}
        <Card>
          <Card.Body>
            <h3>Распределение по топливу</h3>
            {aggregatedData.kpi?.mainFuelType && (
              <div className="main-fuel-type">
                <strong>Основной тип топлива:</strong> {aggregatedData.kpi.mainFuelType.type} 
                ({aggregatedData.kpi.mainFuelType.percentage.toFixed(1)}%)
              </div>
            )}
            {Object.keys(aggregatedData.byFuelType).length > 0 ? (
              <div className="fuel-type-chart">
                {Object.entries(aggregatedData.byFuelType)
                  .sort((a, b) => b[1].volume - a[1].volume)
                  .map(([type, data], index) => {
                    const totalVolume = Object.values(aggregatedData.byFuelType)
                      .reduce((sum, d) => sum + d.volume, 0)
                    const percentage = totalVolume > 0 ? (data.volume / totalVolume) * 100 : 0
                    return (
                      <div key={`${type}-${index}`} className="fuel-type-item">
                        <div className="fuel-type-label">{type}</div>
                        <div className="fuel-type-bar-wrapper">
                          <div
                            className="fuel-type-bar"
                            style={{ width: `${percentage}%` }}
                          >
                            <span className="fuel-type-value">{percentage.toFixed(1)}%</span>
                          </div>
                        </div>
                        <div className="fuel-type-details">
                          {formatLiters(data.volume)} ({data.count} заправок)
                        </div>
                      </div>
                    )
                  })}
              </div>
            ) : (
              <EmptyState message="Нет данных" />
            )}
          </Card.Body>
        </Card>
      </div>
    </div>
  )
}

export default ProviderAnalysisDashboard
