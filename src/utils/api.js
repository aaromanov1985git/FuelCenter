/**
 * Утилита для создания авторизованных запросов к API
 */

// В режиме разработки используем относительные пути для прокси Vite
// В production используем полный URL или переменную окружения
const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

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
  
  return fetch(normalizedUrl, {
    ...options,
    headers
  })
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

