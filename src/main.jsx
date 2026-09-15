import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import PublicShareView from './components/PublicShareView'
import { ToastProvider } from './components/ToastContainer'
import { AuthProvider } from './contexts/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'

// Шрифты подключаются локально из node_modules (@fontsource), а не с Google Fonts:
// прод-контур GSM живёт во внутренней сети без доступа наружу.
// Файлы весов включают все субсеты пакета, включая cyrillic и cyrillic-ext.
import '@fontsource/golos-text/400.css'
import '@fontsource/golos-text/500.css'
import '@fontsource/golos-text/600.css'
import '@fontsource/golos-text/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'

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
        <BrowserRouter>
          <Routes>
            <Route path="/share/:token" element={<PublicShareView />} />
            <Route
              path="/*"
              element={
                <AuthProvider>
                  <App />
                </AuthProvider>
              }
            />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>
)

