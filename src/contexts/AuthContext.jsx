import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { logger } from '../utils/logger'
import { authFetch } from '../utils/api'

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
  const [token, setToken] = useState(() => {
    return localStorage.getItem('auth_token') || null
  })
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Загрузка информации о пользователе при инициализации
  useEffect(() => {
    const loadUser = async () => {
      if (token) {
        try {
          const response = await fetch(`${API_URL}/api/v1/auth/me`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          })
          
          if (response.ok) {
            const userData = await response.json()
            setUser(userData)
          } else {
            // Токен невалидный, удаляем его
            localStorage.removeItem('auth_token')
            setToken(null)
            setUser(null)
          }
        } catch (error) {
          logger.error('Ошибка при загрузке пользователя', { error: error.message })
          localStorage.removeItem('auth_token')
          setToken(null)
          setUser(null)
        }
      }
      setLoading(false)
    }

    loadUser()
  }, [token])

  const login = useCallback(async (username, password) => {
    try {
      // Для логина не используем authFetch, так как токена еще нет
      const loginUrl = API_URL ? `${API_URL}/api/v1/auth/login-json` : '/api/v1/auth/login-json'
      const response = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Неверное имя пользователя или пароль' }))
        throw new Error(errorData.detail || 'Ошибка входа')
      }

      const data = await response.json()
      const newToken = data.access_token

      localStorage.setItem('auth_token', newToken)
      setToken(newToken)

      // Загружаем информацию о пользователе
      const meUrl = API_URL ? `${API_URL}/api/v1/auth/me` : '/api/v1/auth/me'
      const userResponse = await authFetch(meUrl, {
        headers: {
          'Authorization': `Bearer ${newToken}`
        }
      })

      if (userResponse.ok) {
        const userData = await userResponse.json()
        setUser(userData)
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
      if (!token) {
        throw new Error('Требуется авторизация для регистрации')
      }

      const response = await fetch(`${API_URL}/api/v1/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ username, email, password, role })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Ошибка регистрации' }))
        throw new Error(errorData.detail || 'Ошибка регистрации')
      }

      const userData = await response.json()
      logger.info('Пользователь зарегистрирован', { username: userData.username })
      return { success: true, user: userData }
    } catch (error) {
      logger.error('Ошибка регистрации', { error: error.message })
      return { success: false, error: error.message }
    }
  }, [token])

  const logout = useCallback(() => {
    localStorage.removeItem('auth_token')
    setToken(null)
    setUser(null)
    logger.info('Выход из системы')
  }, [])

  const value = {
    token,
    user,
    loading,
    login,
    register,
    logout,
    isAuthenticated: !!token && !!user
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

