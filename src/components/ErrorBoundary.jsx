import React from 'react'
import './ErrorBoundary.css'

/**
 * ErrorBoundary компонент для перехвата ошибок React
 * Предотвращает полный краш приложения при ошибках в компонентах
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    // Обновляем состояние для отображения fallback UI
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    // Логируем ошибку для отладки
    console.error('ErrorBoundary поймал ошибку:', error, errorInfo)
    
    // Можно отправить ошибку в сервис логирования
    if (window.logger) {
      window.logger.error('Ошибка в React компоненте', {
        error: error.toString(),
        errorInfo: errorInfo.componentStack,
        errorStack: error.stack
      })
    }

    this.setState({
      error,
      errorInfo
    })
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
    // Перезагружаем страницу для полного сброса состояния
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      // Fallback UI
      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <h1 className="error-boundary-title">Что-то пошло не так</h1>
            <p className="error-boundary-message">
              Произошла непредвиденная ошибка. Пожалуйста, попробуйте перезагрузить страницу.
            </p>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="error-boundary-details">
                <summary>Детали ошибки (только для разработки)</summary>
                <pre className="error-boundary-stack">
                  {this.state.error.toString()}
                  {this.state.errorInfo && this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
            <div className="error-boundary-actions">
              <button 
                onClick={this.handleReset}
                className="error-boundary-button"
              >
                Перезагрузить страницу
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
