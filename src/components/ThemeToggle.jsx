import React from 'react'
import { Button } from './ui'
import './ThemeToggle.css'

const ThemeToggle = ({ currentTheme, onThemeChange }) => {
  const themes = [
    { id: 'light', name: 'Светлая', icon: '☀️' },
    { id: 'midnight', name: 'Темная', icon: '🌙' }
  ]

  return (
    <div className="theme-toggle">
      <div className="theme-toggle-buttons">
        {themes.map((theme) => (
          <Button
            key={theme.id}
            variant={currentTheme === theme.id ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => onThemeChange(theme.id)}
            title={`${theme.name} тема`}
            aria-label={`Переключить на ${theme.name} тему`}
            aria-pressed={currentTheme === theme.id}
            className={`theme-toggle-button ${currentTheme === theme.id ? 'active' : ''}`}
          >
            <span className="theme-toggle-icon">{theme.icon}</span>
          </Button>
        ))}
      </div>
    </div>
  )
}

export default ThemeToggle
