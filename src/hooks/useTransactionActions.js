import { useCallback } from 'react'
import { useToast } from '../components/ToastContainer'
import { authFetch } from '../utils/api'
import { logger } from '../utils/logger'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

const extractErrorText = (err, fallback) => {
  if (err instanceof Error) return err.message || fallback
  if (typeof err === 'string') return err
  if (err && typeof err === 'object') {
    return err.detail || err.message || err.error || JSON.stringify(err)
  }
  return fallback
}

const parseErrorResponse = async (response, fallback) => {
  try {
    const errorData = await response.json()
    if (typeof errorData === 'string') return errorData
    if (errorData.detail) return typeof errorData.detail === 'string' ? errorData.detail : JSON.stringify(errorData.detail)
    if (errorData.message) return typeof errorData.message === 'string' ? errorData.message : JSON.stringify(errorData.message)
    return JSON.stringify(errorData)
  } catch {
    return `Ошибка ${response.status}: ${response.statusText}` || fallback
  }
}

export const useTransactionActions = ({
  debouncedCardNumber,
  debouncedAzsNumber,
  debouncedProduct,
  debouncedProvider,
  selectedProviderTab,
  loadTransactions,
  loadStats,
  setLoading,
  setError,
}) => {
  const { success, error: showError } = useToast()

  const downloadExcel = useCallback(async () => {
    try {
      setLoading(true)
      setError('')

      const params = new URLSearchParams({ format: 'xlsx' })
      if (debouncedCardNumber) params.append('card_number', debouncedCardNumber)
      if (debouncedAzsNumber) params.append('azs_number', debouncedAzsNumber)
      if (debouncedProduct) params.append('product', debouncedProduct)
      if (debouncedProvider && debouncedProvider !== '') {
        params.append('provider_id', debouncedProvider)
      } else if (selectedProviderTab !== null) {
        params.append('provider_id', selectedProviderTab.toString())
      }

      logger.info('Начало экспорта транзакций')
      const response = await authFetch(`${API_URL}/api/v1/transactions/export?${params}`)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Ошибка экспорта' }))
        throw new Error(errorData.detail || 'Ошибка экспорта транзакций')
      }

      const contentDisposition = response.headers.get('Content-Disposition')
      let fileName = `transactions_export_${new Date().toISOString().split('T')[0]}.xlsx`
      if (contentDisposition) {
        const fileNameMatch = contentDisposition.match(/filename="?(.+)"?/i)
        if (fileNameMatch) fileName = fileNameMatch[1]
      }

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
      const errorText = extractErrorText(err, 'Ошибка экспорта')
      const errorMessage = 'Ошибка экспорта: ' + errorText
      showError(errorMessage)
      setError(errorMessage)
      logger.error('Ошибка экспорта в Excel', { error: errorText, originalError: err })
      setTimeout(() => setError(''), 10000)
    } finally {
      setLoading(false)
    }
  }, [debouncedCardNumber, debouncedAzsNumber, debouncedProduct, debouncedProvider, selectedProviderTab, setLoading, setError, success, showError])

  const clearByProvider = useCallback(async (params) => {
    try {
      setLoading(true)
      setError('')

      const urlParams = new URLSearchParams({
        provider_id: params.provider_id.toString(),
        confirm: 'true',
      })
      if (params.date_from) urlParams.append('date_from', params.date_from)
      if (params.date_to) urlParams.append('date_to', params.date_to)

      const response = await authFetch(`${API_URL}/api/v1/transactions/clear-by-provider?${urlParams.toString()}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        throw new Error(await parseErrorResponse(response, 'Ошибка очистки транзакций провайдера'))
      }

      const result = await response.json()
      const message = result.message || `Удалено транзакций: ${result.deleted_count}`
      success(message)
      setError(message)
      setTimeout(() => setError(''), 5000)

      await loadTransactions()
      await loadStats()
    } catch (err) {
      const errorMessage = extractErrorText(err, 'Ошибка очистки транзакций провайдера')
      showError('Ошибка очистки транзакций провайдера: ' + errorMessage)
      logger.error('Ошибка очистки транзакций провайдера', { error: errorMessage, stack: err?.stack })
    } finally {
      setLoading(false)
    }
  }, [loadTransactions, loadStats, setLoading, setError, success, showError])

  const clearAll = useCallback(async () => {
    try {
      setLoading(true)
      setError('')

      const response = await authFetch(`${API_URL}/api/v1/transactions/clear?confirm=true`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        throw new Error(await parseErrorResponse(response, 'Ошибка очистки базы данных'))
      }

      const result = await response.json()
      const message = `База данных очищена. Удалено транзакций: ${result.deleted_count}`
      success(message)
      setError(message)
      setTimeout(() => setError(''), 5000)

      await loadTransactions()
      await loadStats()
    } catch (err) {
      const errorMessage = extractErrorText(err, 'Ошибка очистки базы данных')
      setError('Ошибка очистки базы данных: ' + errorMessage)
      logger.error('Ошибка очистки базы данных', { error: errorMessage, stack: err?.stack })
    } finally {
      setLoading(false)
    }
  }, [loadTransactions, loadStats, setLoading, setError, success])

  return { downloadExcel, clearByProvider, clearAll }
}

export default useTransactionActions
