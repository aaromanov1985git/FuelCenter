import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { logger } from '../utils/logger'
import { authFetch, setLogoutHandler, resetLogoutFlag } from '../utils/api'

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.MODE === 'development' ? '' : 'http://localhost:8000')

const AuthContext = createContext(null)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  // Больше не храним токен в state/localStorage - используем httpOnly cookies
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  // Загрузка информации о пользователе при инициализации
  // Используем cookie + localStorage fallback
  useEffect(() => {
    const loadUser = async () => {
      const savedToken = localStorage.getItem('auth_token')
      
      try {
        const response = await fetch(`${API_URL}/api/v1/auth/me`, {
          credentials: 'include', // Пробуем cookie
          headers: {
            'Content-Type': 'application/json',
            // Добавляем токен из localStorage как fallback
            ...(savedToken ? { 'Authorization': `Bearer ${savedToken}` } : {})
          }
        })
        
        if (response.ok) {
          const userData = await response.json()
          resetLogoutFlag()
          setUser(userData)
          setIsAuthenticated(true)
        } else {
          // Токен невалидный - очищаем localStorage
          localStorage.removeItem('auth_token')
          setUser(null)
          setIsAuthenticated(false)
        }
      } catch (error) {
        logger.error('Ошибка при загрузке пользователя', { error: error.message })
        localStorage.removeItem('auth_token')
        setUser(null)
        setIsAuthenticated(false)
      }
      setLoading(false)
    }

    loadUser()
  }, [])

  const login = useCallback(async (username, password) => {
    try {
      // Используем secure login endpoint, который устанавливает httpOnly cookie
      const loginUrl = API_URL ? `${API_URL}/api/v1/auth/login-secure` : '/api/v1/auth/login-secure'
      const response = await fetch(loginUrl, {
        method: 'POST',
        credentials: 'include', // Важно: включаем cookies
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Неверное имя пользователя или пароль' }))
        throw new Error(errorData.detail || 'Ошибка входа')
      }

      // Secure endpoint устанавливает cookie И возвращает токен в body
      const loginData = await response.json()
      
      // Сохраняем токен в localStorage как fallback (для случаев когда cookie не работает)
      if (loginData.access_token && loginData.access_token !== 'httponly_cookie') {
        localStorage.setItem('auth_token', loginData.access_token)
      }

      // Загружаем данные пользователя
      const meUrl = API_URL ? `${API_URL}/api/v1/auth/me` : '/api/v1/auth/me'
      const userResponse = await fetch(meUrl, {
        credentials: 'include',
        headers: { 
          'Content-Type': 'application/json',
          // Добавляем токен в header как fallback
          ...(loginData.access_token && loginData.access_token !== 'httponly_cookie' 
            ? { 'Authorization': `Bearer ${loginData.access_token}` } 
            : {})
        }
      })

      if (userResponse.ok) {
        const userData = await userResponse.json()
        // Сбрасываем флаг logout перед установкой isAuthenticated
        resetLogoutFlag()
        setUser(userData)
        setIsAuthenticated(true)
      } else {
        throw new Error('Не удалось загрузить данные пользователя')
      }

      logger.info('Успешный вход', { username })
      return { success: true }
    } catch (error) {
      logger.error('Ошибка входа', { error: error.message })
      return { success: false, error: error.message }
    }
  }, [])

  const register = useCallback(async (username, email, password, role = 'user') => {
    try {
      if (!isAuthenticated) {
        throw new Error('Требуется авторизация для регистрации')
      }

      const response = await fetch(`${API_URL}/api/v1/auth/register`, {
        method: 'POST',
        credentials: 'include', // Важно: включаем cookies
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, email, password, role })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Ошибка регистрации' }))
        throw new Error(errorData.detail || 'Ошибка регистрации')
      }

      const newUserData = await response.json()
      logger.info('Пользователь зарегистрирован', { username: newUserData.username })
      return { success: true, user: newUserData }
    } catch (error) {
      logger.error('Ошибка регистрации', { error: error.message })
      return { success: false, error: error.message }
    }
  }, [isAuthenticated])

  const logout = useCallback(async () => {
    // Вызываем API endpoint для logout - сервер очистит cookie
    try {
      const logoutUrl = API_URL ? `${API_URL}/api/v1/auth/logout` : '/api/v1/auth/logout'
      await fetch(logoutUrl, {
        method: 'POST',
        credentials: 'include', // Важно: включаем cookies
        headers: {
          'Content-Type': 'application/json'
        }
      }).catch(err => {
        // Игнорируем ошибки при вызове logout API
        logger.warn('Ошибка при вызове logout API', { error: err.message })
      })
    } catch (error) {
      // Игнорируем ошибки, чтобы не блокировать выход
      logger.warn('Ошибка при вызове logout API', { error: error.message })
    }
    
    // Очищаем локальное состояние и localStorage
    localStorage.removeItem('auth_token')
    setUser(null)
    setIsAuthenticated(false)
    logger.info('Выход из системы')
  }, [])

  // Устанавливаем глобальный обработчик для автоматического выхода при 401 ошибке
  useEffect(() => {
    setLogoutHandler(() => {
      logout()
      logger.warn('Автоматический выход из-за истечения токена авторизации')
    })
    
    // Очищаем обработчик при размонтировании
    return () => {
      setLogoutHandler(null)
    }
  }, [logout])

  const value = {
    user,
    loading,
    login,
    register,
    logout,
    isAuthenticated,
    // Для обратной совместимости - deprecated, будет удалено
    token: isAuthenticated ? 'cookie-based-auth' : null
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
