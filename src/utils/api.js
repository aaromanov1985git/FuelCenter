/**
 * Утилита для создания авторизованных запросов к API
 */

// В режиме разработки используем относительные пути для прокси Vite
// В production используем относительные пути (через nginx proxy) или переменную окружения
// Если VITE_API_URL не задан, используем пустую строку для относительных путей
// Это работает как в dev (через vite proxy), так и в production (через nginx proxy)
const API_URL = import.meta.env.VITE_API_URL || ''

// Глобальный обработчик для 401 ошибок (будет установлен из AuthContext)
let globalLogoutHandler = null

/**
 * Установить глобальный обработчик для выхода при 401 ошибке
 * @param {Function} handler - Функция для вызова при 401 ошибке
 */
export const setLogoutHandler = (handler) => {
  globalLogoutHandler = handler
}

/**
 * Получить токен из localStorage
 */
const getToken = () => {
  return localStorage.getItem('auth_token')
}

/**
 * Создать заголовки для запроса с авторизацией
 * @param {Object} additionalHeaders - Дополнительные заголовки
 * @returns {Object} Объект с заголовками
 */
export const getAuthHeaders = (additionalHeaders = {}) => {
  const token = getToken()
  const headers = {
    'Content-Type': 'application/json',
    ...additionalHeaders
  }
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  
  return headers
}

/**
 * Выполнить авторизованный fetch запрос
 * @param {string} url - URL для запроса (может быть полным или относительным)
 * @param {Object} options - Опции для fetch
 * @returns {Promise<Response>} Promise с ответом
 */
export const authFetch = async (url, options = {}) => {
  const token = getToken()
  const headers = {
    ...options.headers,
    'Content-Type': options.headers?.['Content-Type'] || 'application/json'
  }
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  
  // Если это FormData, не устанавливаем Content-Type (браузер установит автоматически с boundary)
  if (options.body instanceof FormData) {
    delete headers['Content-Type']
  }
  
  // Нормализуем URL для работы с прокси Vite в dev режиме
  let normalizedUrl = url
  
  // Если URL уже полный (начинается с http:// или https://), используем как есть
  if (url.startsWith('http://') || url.startsWith('https://')) {
    normalizedUrl = url
  } 
  // Если URL начинается с /api, используем как есть (для прокси Vite)
  else if (url.startsWith('/api')) {
    normalizedUrl = url
  }
  // Если передан URL вида `${API_URL}/api/v1/...` где API_URL может быть пустым
  // В dev режиме API_URL = '', поэтому `${API_URL}/api` = `/api` - это правильно
  else {
    // Убираем возможные undefined/null из начала URL
    normalizedUrl = url.replace(/^(undefined|null)\/?/, '')
    
    // Если API_URL задан и URL не начинается с него, добавляем
    if (API_URL && !normalizedUrl.startsWith(API_URL)) {
      normalizedUrl = `${API_URL}${normalizedUrl.startsWith('/') ? '' : '/'}${normalizedUrl}`
    }
    // Если API_URL пустой и URL не начинается с /, добавляем /
    else if (!API_URL && !normalizedUrl.startsWith('/')) {
      normalizedUrl = `/${normalizedUrl}`
    }
  }
  
  try {
    const response = await fetch(normalizedUrl, {
      ...options,
      headers
    })
    
    // Централизованная обработка ошибок 401 (Unauthorized)
    if (response.status === 401) {
      // Удаляем токен из localStorage
      localStorage.removeItem('auth_token')
      
      // Вызываем глобальный обработчик logout, если он установлен
      if (globalLogoutHandler) {
        globalLogoutHandler()
      }
      
      // Бросаем специальную ошибку, чтобы компоненты могли её обработать
      const error = new Error('Требуется авторизация')
      error.status = 401
      error.isUnauthorized = true
      throw error
    }
    
    return response
  } catch (fetchError) {
    // Обрабатываем ошибки сети (Failed to fetch, CORS и т.д.)
    if (fetchError.name === 'TypeError' && (fetchError.message.includes('Failed to fetch') || fetchError.message.includes('NetworkError'))) {
      const networkError = new Error('Ошибка подключения к серверу. Проверьте, что бэкенд запущен и доступен.')
      networkError.isNetworkError = true
      throw networkError
    }
    // Пробрасываем другие ошибки (включая нашу 401 ошибку)
    throw fetchError
  }
}

/**
 * Получить полный URL для API запроса
 * @param {string} endpoint - Endpoint API
 * @returns {string} Полный URL
 */
export const getApiUrl = (endpoint) => {
  // Убираем начальный слэш, если есть
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint
  return `${API_URL}/${cleanEndpoint}`
}

