import React from 'react'
import { Button } from './ui'
import Icon from './ui/Icon'
import './ThemeToggle.css'

// Единственное место, где раньше смешивались два набора иконок: sun/moon брались
// из старого Icons. Имена добавлены в ICON_PATHS, набор теперь один.
const ThemeToggle = ({ currentTheme, onThemeChange }) => {
  const themes = [
    { id: 'light', name: 'Светлая', icon: 'sun' },
    { id: 'dark', name: 'Темная', icon: 'moon' }
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
            <span className="theme-toggle-icon"><Icon name={theme.icon} /></span>
            {currentTheme === theme.id && (
              <span className="theme-toggle-mark" aria-hidden="true">
                <Icon name="check" size={10} strokeWidth={2.4} />
              </span>
            )}
          </Button>
        ))}
      </div>
    </div>
  )
}

export default ThemeToggle
