import { useEffect, useState } from 'react'
import { logger } from '../utils/logger'

const STORAGE_KEY = 'gsm-theme'
const TRANSITION_MS = 500

const applyTheme = (themeName) => {
  document.documentElement.setAttribute('data-theme', themeName)
}

export const useTheme = (initial = 'dark') => {
  const [theme, setTheme] = useState(initial)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) || initial
    setTheme(saved)
    applyTheme(saved)
  }, [initial])

  const handleThemeChange = (newTheme) => {
    const root = document.documentElement
    root.classList.add('theme-transitioning')

    requestAnimationFrame(() => {
      setTheme(newTheme)
      localStorage.setItem(STORAGE_KEY, newTheme)
      applyTheme(newTheme)
      logger.info('Тема изменена', { theme: newTheme })

      setTimeout(() => {
        root.classList.remove('theme-transitioning')
      }, TRANSITION_MS)
    })
  }

  return { theme, handleThemeChange }
}

export default useTheme
