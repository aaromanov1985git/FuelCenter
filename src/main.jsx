import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ToastProvider } from './components/ToastContainer'
import { AuthProvider } from './contexts/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'
import './styles/tokens.css'
import './index.css'
import './styles/animations.css'
import './styles/utilities.css'
import './styles/responsive.css'

// Применяем сохраненную тему сразу при загрузке страницы (до рендеринга React)
// чтобы избежать мигания при переключении темы
const rawTheme = localStorage.getItem('gsm-theme')
const savedTheme = (rawTheme === 'light') ? 'light' : 'dark'
if (rawTheme !== savedTheme) localStorage.setItem('gsm-theme', savedTheme)
const root = document.documentElement
root.setAttribute('data-theme', savedTheme)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>
)

