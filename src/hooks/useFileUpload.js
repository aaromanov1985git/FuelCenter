import { useCallback, useState } from 'react'
import { useToast } from '../components/ToastContainer'
import { logger } from '../utils/logger'
import { authFetch } from '../utils/api'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')
const PROCESSING_TIMEOUT = 10 * 60 * 1000
export const MAX_FILE_SIZE = 50 * 1024 * 1024

const extractErrorText = (err) => {
  if (err instanceof Error) return err.message || 'Ошибка загрузки файла'
  if (typeof err === 'string') return err
  if (err && typeof err === 'object') {
    return err.detail || err.message || err.error || JSON.stringify(err)
  }
  return 'Неизвестная ошибка'
}

const validateFile = (file) => {
  if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
    return { valid: false, error: 'Поддерживаются только файлы Excel (.xlsx, .xls)' }
  }
  if (file.size > MAX_FILE_SIZE) {
    const fileSizeMB = (file.size / 1024 / 1024).toFixed(2)
    const maxSizeMB = (MAX_FILE_SIZE / 1024 / 1024).toFixed(0)
    return {
      valid: false,
      error: `Размер файла (${fileSizeMB}MB) превышает максимально допустимый (${maxSizeMB}MB)`,
    }
  }
  return { valid: true }
}

export const useFileUpload = ({ onUploaded, setLoading, setError, logout }) => {
  const { success, error: showError, info } = useToast()

  const [fileName, setFileName] = useState('')
  const [fileMatchInfo, setFileMatchInfo] = useState(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStatus, setUploadStatus] = useState(null)
  const [uploadedBytes, setUploadedBytes] = useState(0)
  const [totalBytes, setTotalBytes] = useState(0)
  const [processedItems, setProcessedItems] = useState(0)
  const [totalItems, setTotalItems] = useState(0)
  const [dragActive, setDragActive] = useState(false)
  const [previewFile, setPreviewFile] = useState(null)
  const [showTemplateSelectModal, setShowTemplateSelectModal] = useState(false)
  const [templateSelectData, setTemplateSelectData] = useState(null)

  const resetUploadState = useCallback(() => {
    setUploadStatus(null)
    setUploadProgress(0)
    setUploadedBytes(0)
    setTotalBytes(0)
    setProcessedItems(0)
    setTotalItems(0)
  }, [])

  const checkFileMatch = useCallback(async (file) => {
    try {
      const formData = new FormData()
      formData.append('file', file)
      const response = await authFetch(`${API_URL}/api/v1/transactions/check-match`, {
        method: 'POST',
        body: formData,
      })
      if (response.ok) {
        const matchData = await response.json()
        setFileMatchInfo(matchData.match_info)
        const requiresSelection = matchData.require_template_selection === true
        logger.info('Проверка соответствия файла завершена', {
          matchInfo: matchData.match_info,
          requiresSelection,
          availableTemplates: matchData.available_templates?.length || 0,
        })
        return { requiresSelection, matchData }
      }
    } catch (err) {
      logger.warn('Ошибка проверки соответствия файла', { error: err.message })
    }
    return { requiresSelection: false, matchData: null }
  }, [])

  const handleFileWithTemplate = useCallback(async (file, providerId, templateId) => {
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
      const formData = new FormData()
      formData.append('file', file)
      const xhr = new XMLHttpRequest()
      let timeoutId = null

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          setUploadProgress((e.loaded / e.total) * 100)
          setUploadedBytes(e.loaded)
          setTotalBytes(e.total)
        }
      })

      xhr.addEventListener('load', async () => {
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null }
        if (xhr.status >= 200 && xhr.status < 300) {
          setUploadStatus('processing')
          setUploadProgress(100)
          try {
            const contentType = xhr.getResponseHeader('content-type')
            if (!contentType || !contentType.includes('application/json')) {
              throw new Error('Неожиданный формат ответа от сервера')
            }
            const result = JSON.parse(xhr.responseText)
            if (result.require_template_selection) {
              throw new Error('Ошибка: требуется выбор шаблона')
            }
            if (typeof result.transactions_created === 'undefined') {
              throw new Error('Некорректный ответ от сервера')
            }
            setProcessedItems(result.transactions_created || 0)
            setTotalItems((result.transactions_created || 0) + (result.transactions_skipped || 0))
            await onUploaded?.()

            let message = `✅ Файл успешно загружен. Обработано ${result.transactions_created} транзакций`
            if (result.transactions_skipped > 0) {
              message += `. Пропущено дубликатов: ${result.transactions_skipped}`
            }
            if (result.validation_warnings && result.validation_warnings.length > 0) {
              success(message)
              info(`⚠️ Предупреждения валидации: ${result.validation_warnings.join(', ')}`, 10000)
            } else {
              success(message)
            }
            logger.info('Файл успешно загружен с выбранным шаблоном', {
              filename: file.name, created: result.transactions_created, providerId, templateId,
            })
          } catch (parseError) {
            throw new Error('Ошибка парсинга ответа сервера')
          } finally {
            resetUploadState()
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
          } catch {}
          if (xhr.status === 401) {
            localStorage.removeItem('auth_token')
            logout()
            resetUploadState()
            setLoading(false)
            return
          }
          setError(errorMessage)
          showError(errorMessage)
          resetUploadState()
          setLoading(false)
        }
      })

      xhr.addEventListener('error', () => {
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null }
        const networkError = 'Ошибка сети при загрузке файла'
        setError(networkError)
        showError(networkError)
        resetUploadState()
        setLoading(false)
      })

      xhr.addEventListener('timeout', () => {
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null }
        const timeoutError = 'Превышено время ожидания обработки файла'
        setError(timeoutError)
        showError(timeoutError)
        resetUploadState()
        setLoading(false)
      })

      timeoutId = setTimeout(() => {
        if (xhr.readyState !== XMLHttpRequest.DONE) {
          xhr.abort()
          const timeoutError = 'Превышено время ожидания обработки файла'
          setError(timeoutError)
          showError(timeoutError)
          resetUploadState()
          setLoading(false)
        }
      }, PROCESSING_TIMEOUT)

      let uploadUrl
      if (API_URL) {
        uploadUrl = new URL(`${API_URL}/api/v1/transactions/upload`)
        uploadUrl.searchParams.append('provider_id', providerId.toString())
        uploadUrl.searchParams.append('template_id', templateId.toString())
        uploadUrl = uploadUrl.toString()
      } else {
        const params = new URLSearchParams({
          provider_id: providerId.toString(),
          template_id: templateId.toString(),
        })
        uploadUrl = `/api/v1/transactions/upload?${params.toString()}`
      }

      xhr.open('POST', uploadUrl)
      xhr.timeout = PROCESSING_TIMEOUT
      const token = localStorage.getItem('auth_token')
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      xhr.send(formData)
    } catch (err) {
      const errorMessage = 'Ошибка загрузки файла: ' + extractErrorText(err)
      setError(errorMessage)
      showError(errorMessage)
      resetUploadState()
      setLoading(false)
    }
  }, [onUploaded, setLoading, setError, logout, success, showError, info, resetUploadState])

  const handleFile = useCallback(async (file) => {
    if (!file) return

    const validation = validateFile(file)
    if (!validation.valid) {
      setError(validation.error)
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
      const formData = new FormData()
      formData.append('file', file)
      const xhr = new XMLHttpRequest()
      let timeoutId = null

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          setUploadProgress((e.loaded / e.total) * 100)
          setUploadedBytes(e.loaded)
          setTotalBytes(e.total)
        }
      })

      xhr.addEventListener('load', async () => {
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null }
        if (xhr.status >= 200 && xhr.status < 300) {
          setUploadStatus('processing')
          setUploadProgress(100)
          try {
            const contentType = xhr.getResponseHeader('content-type')
            if (!contentType || !contentType.includes('application/json')) {
              const responseText = xhr.responseText.substring(0, 200)
              throw new Error(`Неожиданный формат ответа от сервера: ${responseText}`)
            }
            const result = JSON.parse(xhr.responseText)

            if (result.require_template_selection) {
              setTemplateSelectData({
                file,
                availableTemplates: result.available_templates || [],
                detectedProviderId: result.detected_provider_id,
                detectedTemplateId: result.detected_template_id,
                matchInfo: result.match_info,
              })
              setShowTemplateSelectModal(true)
              resetUploadState()
              setLoading(false)
              logger.info('Требуется выбор шаблона', {
                filename: file.name,
                availableTemplates: result.available_templates?.length || 0,
              })
              return
            }

            if (typeof result.transactions_created === 'undefined') {
              throw new Error('Некорректный ответ от сервера: отсутствует информация о созданных транзакциях')
            }
            if (result.match_info) setFileMatchInfo(result.match_info)

            setProcessedItems(result.transactions_created || 0)
            setTotalItems((result.transactions_created || 0) + (result.transactions_skipped || 0))
            await onUploaded?.()

            let message = `✅ Файл успешно загружен. Обработано ${result.transactions_created} транзакций`
            if (result.transactions_skipped > 0) {
              message += `. Пропущено дубликатов: ${result.transactions_skipped}`
            }
            if (result.validation_warnings && result.validation_warnings.length > 0) {
              success(message)
              info(`⚠️ Предупреждения валидации: ${result.validation_warnings.join(', ')}`, 10000)
              setError(message)
              setTimeout(() => setError(''), 15000)
            } else {
              success(message)
              setError(message)
              setTimeout(() => setError(''), 10000)
            }
            logger.info('Файл успешно загружен', { filename: file.name, created: result.transactions_created })
          } catch (parseError) {
            throw new Error('Ошибка парсинга ответа сервера')
          } finally {
            resetUploadState()
            setLoading(false)
          }
        } else {
          let errorMessage = 'Ошибка загрузки файла'
          try {
            const contentType = xhr.getResponseHeader('content-type')
            if (contentType && contentType.includes('application/json')) {
              const errorData = JSON.parse(xhr.responseText)
              errorMessage = errorData.detail || errorData.message || errorMessage
            } else {
              const errorText = xhr.responseText.substring(0, 500)
              errorMessage = `Ошибка ${xhr.status}: ${xhr.statusText}. ${errorText}`
            }
          } catch {
            errorMessage = `Ошибка ${xhr.status}: ${xhr.statusText}`
          }
          if (xhr.status === 401) {
            localStorage.removeItem('auth_token')
            logout()
            resetUploadState()
            setLoading(false)
            return
          }
          setError(errorMessage)
          resetUploadState()
          setLoading(false)
          throw new Error(errorMessage)
        }
      })

      xhr.addEventListener('error', () => {
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null }
        const networkError = 'Ошибка сети при загрузке файла. Проверьте подключение к серверу и убедитесь, что backend запущен.'
        setError(networkError)
        resetUploadState()
        setLoading(false)
        logger.error('Ошибка сети при загрузке файла', { filename: file.name })
      })

      xhr.addEventListener('abort', () => {
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null }
        if (xhr.status === 0) {
          setError('Загрузка файла прервана')
          resetUploadState()
          setLoading(false)
        }
      })

      xhr.addEventListener('timeout', () => {
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null }
        setError('Превышено время ожидания обработки файла. Файл может быть слишком большим.')
        resetUploadState()
        setLoading(false)
      })

      timeoutId = setTimeout(() => {
        if (xhr.readyState !== XMLHttpRequest.DONE) {
          xhr.abort()
          const timeoutError = 'Превышено время ожидания обработки файла (10 минут). Файл может быть слишком большим или обработка занимает слишком много времени.'
          setError(timeoutError)
          resetUploadState()
          setLoading(false)
          setTimeout(() => setError(''), 30000)
        }
      }, PROCESSING_TIMEOUT)

      const uploadUrl = API_URL
        ? new URL(`${API_URL}/api/v1/transactions/upload`).toString()
        : '/api/v1/transactions/upload'
      xhr.open('POST', uploadUrl)
      xhr.timeout = PROCESSING_TIMEOUT
      const token = localStorage.getItem('auth_token')
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      xhr.send(formData)
    } catch (err) {
      const errorText = extractErrorText(err)
      const errorMessage = 'Ошибка загрузки файла: ' + errorText
      setError(errorMessage)
      resetUploadState()
      setLoading(false)
      if (errorText.includes('таймаут') || errorText.includes('timeout')) {
        setTimeout(() => setError(''), 30000)
      }
    }
  }, [onUploaded, setLoading, setError, logout, success, info, showError, resetUploadState])

  const handleDrag = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true)
    else if (e.type === 'dragleave') setDragActive(false)
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0]
      const validation = validateFile(file)
      if (!validation.valid) {
        showError(validation.error)
        return
      }
      setPreviewFile(file)
    }
  }, [showError])

  const handleFileInput = useCallback((e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      const validation = validateFile(file)
      if (!validation.valid) {
        showError(validation.error)
        e.target.value = ''
        return
      }
      setPreviewFile(file)
    }
  }, [showError])

  const handleFileConfirm = useCallback(async (templateData) => {
    if (!previewFile) return
    setLoading(true)
    try {
      if (templateData && templateData.provider_id && templateData.template_id) {
        setPreviewFile(null)
        await handleFileWithTemplate(previewFile, templateData.provider_id, templateData.template_id)
      } else {
        setPreviewFile(null)
        await handleFile(previewFile)
      }
    } catch (err) {
      setLoading(false)
      const errorText = extractErrorText(err)
      showError('Ошибка загрузки файла: ' + errorText)
      logger.error('Ошибка загрузки файла', { error: errorText, originalError: err })
    }
  }, [previewFile, setLoading, handleFileWithTemplate, handleFile, showError])

  const handleFileCancel = useCallback(() => {
    setPreviewFile(null)
    const fileInput = document.getElementById('file-upload-input')
    if (fileInput) fileInput.value = ''
  }, [])

  return {
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
  }
}

export default useFileUpload
