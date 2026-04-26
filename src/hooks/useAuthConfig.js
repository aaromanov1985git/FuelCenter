import { useEffect, useState } from 'react'
import { authFetch } from '../utils/api'
import { logger } from '../utils/logger'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')
const REQUEST_TIMEOUT_MS = 3000
const FALLBACK_TIMEOUT_MS = 10000

export const useAuthConfig = (authLoading) => {
  const [authEnabled, setAuthEnabled] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)

  useEffect(() => {
    let abortController = null
    let timeoutId = null

    const fallbackTimeout = setTimeout(() => {
      logger.warn('Таймаут проверки аутентификации - продолжаем работу')
      setCheckingAuth(false)
      setAuthEnabled(false)
    }, FALLBACK_TIMEOUT_MS)

    const checkAuthSettings = async () => {
      if (abortController) abortController.abort()
      abortController = new AbortController()
      timeoutId = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT_MS)

      try {
        const configUrl = API_URL ? `${API_URL}/api/v1/config` : '/api/v1/config'
        const response = await authFetch(configUrl, {
          method: 'GET',
          signal: abortController.signal,
        })
        if (response.ok) {
          const config = await response.json()
          setAuthEnabled(config.enable_auth === true)
        } else {
          logger.warn('Не удалось получить настройки аутентификации', { status: response.status })
          setAuthEnabled(false)
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          logger.warn('Не удалось проверить настройки аутентификации', { error: error.message })
        }
        setAuthEnabled(false)
      } finally {
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null }
        clearTimeout(fallbackTimeout)
        setCheckingAuth(false)
      }
    }

    if (!authLoading) checkAuthSettings()

    return () => {
      clearTimeout(fallbackTimeout)
      if (abortController) abortController.abort()
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [authLoading])

  return { authEnabled, checkingAuth }
}

export default useAuthConfig
