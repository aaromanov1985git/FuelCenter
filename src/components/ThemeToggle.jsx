import React from 'react'
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
          <button
            key={theme.id}
            className={`theme-toggle-button ${currentTheme === theme.id ? 'active' : ''}`}
            onClick={() => onThemeChange(theme.id)}
            title={`${theme.name} тема`}
            aria-label={`Переключить на ${theme.name} тему`}
            aria-pressed={currentTheme === theme.id}
          >
            <span className="theme-toggle-icon">{theme.icon}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default ThemeToggle
