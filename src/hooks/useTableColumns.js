import { useCallback, useMemo, useState } from 'react'

const STORAGE_KEY = 'visible-columns'

const HEADER_FIELD_MAP = {
  'ID': 'id',
  'Дата и время': 'transaction_date',
  '№ карты': 'card_number',
  'Провайдер': 'provider_id',
  'Закреплена за': 'vehicle',
  'АЗС': 'azs_number',
  'Товар / услуга': 'product',
  'Тип': 'operation_type',
  'Кол-во': 'quantity',
  'Валюта транзакции': 'currency',
  'Курс конвертации': 'exchange_rate',
}

const ALL_HEADERS = [
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
  'Курс конвертации',
]

const loadVisibility = () => {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (!saved) return {}
  try {
    return JSON.parse(saved)
  } catch {
    return {}
  }
}

export const useTableColumns = (sortConfig) => {
  const [visibleColumns, setVisibleColumns] = useState(loadVisibility)

  const displayHeaders = useMemo(
    () => ALL_HEADERS.filter(header => visibleColumns[header] !== false),
    [visibleColumns],
  )

  const toggleColumnVisibility = useCallback((header) => {
    setVisibleColumns(prev => {
      const next = {
        ...prev,
        [header]: prev[header] === false ? undefined : false,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const resetColumnVisibility = useCallback(() => {
    setVisibleColumns({})
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  const getSortIcon = useCallback((header) => {
    const field = HEADER_FIELD_MAP[header]
    if (!field || sortConfig.field !== field) return '⇅'
    return sortConfig.order === 'asc' ? '↑' : '↓'
  }, [sortConfig])

  return {
    allHeaders: ALL_HEADERS,
    headerFieldMap: HEADER_FIELD_MAP,
    displayHeaders,
    visibleColumns,
    toggleColumnVisibility,
    resetColumnVisibility,
    getSortIcon,
  }
}

export default useTableColumns
