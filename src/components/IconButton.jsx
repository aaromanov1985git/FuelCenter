import React from 'react'
import Tooltip from './Tooltip'
import Icon from './ui/Icon'
import './IconButton.css'

/**
 * Компонент кнопки с иконкой вместо текста
 * @param {string} icon - Тип иконки: 'edit', 'delete', 'add', 'save', 'cancel', 'download', 'refresh', 'clear', 'templates', 'settings', 'copy', 'export'
 * @param {string} variant - Вариант стиля: 'primary', 'success', 'error', 'secondary'
 * @param {function} onClick - Обработчик клика
 * @param {boolean} disabled - Отключена ли кнопка
 * @param {string} title - Подсказка при наведении
 * @param {string} className - Дополнительные CSS классы
 */
const ICON_LABELS_RU = {
  edit: 'Редактировать',
  delete: 'Удалить',
  trash: 'Удалить',
  add: 'Добавить',
  save: 'Сохранить',
  cancel: 'Отменить',
  download: 'Скачать',
  refresh: 'Обновить',
  clear: 'Очистить',
  templates: 'Шаблоны',
  settings: 'Настройки',
  copy: 'Копировать',
  export: 'Экспорт',
  users: 'Пользователи',
  search: 'Поиск',
  view: 'Просмотр',
}

/* Раньше компонент рисовал собственный набор ЗАЛИТЫХ svg 20/24px
   (viewBox 0 0 20 20, fill="currentColor") — второй набор иконок в проекте
   и прямое нарушение дизайн-системы. Теперь это карта имён в общий примитив
   ui/Icon: контурные 16px, наследующие цвет текста. */
const ICON_NAME_MAP = {
  edit: 'edit',
  more: 'more',
  delete: 'trash',
  trash: 'trash',
  add: 'plus',
  save: 'save',
  cancel: 'close',
  clear: 'close',
  download: 'download',
  export: 'upload',
  refresh: 'refresh',
  templates: 'layers',
  settings: 'gear',
  copy: 'copy',
  users: 'users',
  search: 'search',
  view: 'eye',
}

const IconButton = ({
  icon,
  variant = 'primary',
  onClick,
  disabled = false,
  title = '',
  className = '',
  size = 'medium' // 'small', 'medium', 'large'
}) => {

  const button = (
    <button
      className={`icon-button icon-button-${variant} icon-button-${size} ${className}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={title || ICON_LABELS_RU[icon] || 'Действие'}
      type="button"
    >
      <Icon name={ICON_NAME_MAP[icon] || icon} />
    </button>
  )

  // Обертываем в Tooltip, если есть title и кнопка не disabled
  if (title && !disabled) {
    return (
      <Tooltip content={title} position="top" delay={300}>
        {button}
      </Tooltip>
    )
  }

  return button
}

export default IconButton
