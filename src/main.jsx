import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ToastProvider } from './components/ToastContainer'
import { AuthProvider } from './contexts/AuthContext'
import './index.css'

// Применяем сохраненную тему сразу при загрузке страницы (до рендеринга React)
// чтобы избежать мигания при переключении темы
const savedTheme = localStorage.getItem('app-theme') || 'light'
const root = document.documentElement
if (savedTheme !== 'light') {
  root.setAttribute('data-theme', savedTheme)
} else {
  root.removeAttribute('data-theme')
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ToastProvider>
  </React.StrictMode>
)

