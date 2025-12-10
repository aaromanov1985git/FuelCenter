import React, { useState, useCallback } from 'react'
import Toast from './Toast'
import './Toast.css'

/**
 * Контейнер для управления Toast-уведомлениями
 * 
 * Использование:
 * 
 * В App.jsx или корневом компоненте:
 * import { ToastProvider, useToast } from './components/ToastContainer'
 * 
 * function App() {
 *   return (
 *     <ToastProvider>
 *       Ваш контент
 *     </ToastProvider>
 *   )
 * }
 * 
 * В любом компоненте:
 * function MyComponent() {
 *   const { showToast } = useToast()
 *   
 *   const handleSuccess = () => {
 *     showToast('Операция выполнена успешно!', 'success')
 *   }
 *   
 *   const handleError = () => {
 *     showToast('Произошла ошибка', 'error')
 *   }
 * }
 */

let toastIdCounter = 0

const ToastContext = React.createContext(null)

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([])

  const showToast = useCallback((message, type = 'info', duration = 5000, title = null) => {
    const id = ++toastIdCounter
    const newToast = {
      id,
      message,
      type,
      duration,
      title
    }

    setToasts(prev => [...prev, newToast])

    return id
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }, [])

  const success = useCallback((message, duration = 5000) => {
    return showToast(message, 'success', duration)
  }, [showToast])

  const error = useCallback((message, duration = 7000) => {
    // Улучшенная обработка ошибок с разбором типов
    let errorMessage = message
    let errorTitle = null
    
    if (typeof message === 'string') {
      // Проверяем тип ошибки по тексту
      if (message.includes('network') || message.includes('fetch') || message.includes('Failed to fetch')) {
        errorTitle = 'Ошибка сети'
        errorMessage = 'Проблема с подключением к серверу. Проверьте интернет-соединение и убедитесь, что сервер запущен.'
        duration = 10000
      } else if (message.includes('timeout') || message.includes('таймаут')) {
        errorTitle = 'Превышено время ожидания'
        errorMessage = 'Сервер не отвечает в течение заданного времени. Попробуйте повторить запрос или обратитесь к администратору.'
        duration = 8000
      } else if (message.includes('404') || message.includes('Not Found')) {
        errorTitle = 'Ресурс не найден'
        errorMessage = 'Запрашиваемый ресурс не найден на сервере. Возможно, он был удален или перемещен.'
        duration = 7000
      } else if (message.includes('403') || message.includes('Forbidden')) {
        errorTitle = 'Доступ запрещен'
        errorMessage = 'У вас нет прав для выполнения этого действия. Обратитесь к администратору.'
        duration = 8000
      } else if (message.includes('500') || message.includes('Internal Server Error')) {
        errorTitle = 'Ошибка сервера'
        errorMessage = 'Произошла внутренняя ошибка сервера. Администратор уже уведомлен. Попробуйте позже.'
        duration = 8000
      } else if (message.includes('401') || message.includes('Unauthorized')) {
        errorTitle = 'Требуется авторизация'
        errorMessage = 'Ваша сессия истекла. Пожалуйста, обновите страницу и войдите снова.'
        duration = 7000
      } else if (message.includes('Validation') || message.includes('валидац')) {
        errorTitle = 'Ошибка валидации'
        duration = 7000
      } else if (message.includes('размер') || message.includes('size') || message.includes('большой')) {
        errorTitle = 'Превышен размер файла'
        duration = 7000
      }
    }
    
    return showToast(errorMessage, 'error', duration, errorTitle)
  }, [showToast])

  const warning = useCallback((message, duration = 6000) => {
    return showToast(message, 'warning', duration)
  }, [showToast])

  const info = useCallback((message, duration = 5000) => {
    return showToast(message, 'info', duration)
  }, [showToast])

  const value = {
    showToast,
    success,
    error,
    warning,
    info,
    removeToast
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-container" aria-live="polite" aria-atomic="true">
        {toasts.map(toast => (
          <Toast
            key={toast.id}
            id={toast.id}
            message={toast.message}
            type={toast.type}
            duration={toast.duration}
            title={toast.title}
            onClose={removeToast}
          />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => {
  const context = React.useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}

export default ToastProvider

