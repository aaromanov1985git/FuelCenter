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
          // variant всегда ghost. При 'primary' кнопка красила значок в
          // --ink-on-accent (белый) под сплошную заливку, а .theme-toggle-button
          // тут же перекрывала фон на --accent-soft — полупрозрачный тон в 8%.
          // Выходил белый значок по почти белому: активную тему было не видно.
          // Вид активной кнопки целиком задаёт CSS, см. ThemeToggle.css.
          <Button
            key={theme.id}
            variant="ghost"
            size="sm"
            onClick={() => onThemeChange(theme.id)}
            title={`${theme.name} тема`}
            aria-label={`Переключить на ${theme.name} тему`}
            aria-pressed={currentTheme === theme.id}
            className={`theme-toggle-button ${currentTheme === theme.id ? 'active' : ''}`}
          >
            {/* Галочки в углу больше нет: 10px значок садился на скругление
                кнопки и налезал на сам символ темы. Состояние и так несут фон,
                рамка и кольцо, а для чтения с экрана — aria-pressed. */}
            <span className="theme-toggle-icon"><Icon name={theme.icon} /></span>
          </Button>
        ))}
      </div>
    </div>
  )
}

export default ThemeToggle
