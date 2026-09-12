import React, { useState } from 'react'
import IconButton from './IconButton'
import ContextMenu from './ContextMenu'
import './TemplateRowActions.css'

/**
 * Действия над шаблоном в строке таблицы.
 *
 * Раньше в ячейку клались три равновеликие кнопки разных цветов в контейнере
 * с flexWrap. Его min-content равен ширине одной кнопки, поэтому кнопки
 * складывались в столбик и растягивали строку примерно до 112px вместо 44,
 * а vertical-align: middle остальных ячеек уводил их текст к середине —
 * это и выглядело как съехавшая вёрстка.
 *
 * Теперь видимым остаётся одно частое действие, остальные уходят в меню,
 * поэтому ширина ячейки постоянна и не зависит от типа подключения.
 *
 * @param {object} template - Строка шаблона
 * @param {function} onEdit - Открыть редактор
 * @param {function} onDelete - Удалить шаблон
 * @param {function} onLoad - Загрузить данные (только для firebird/api/web)
 */
const TemplateRowActions = ({ template, onEdit, onDelete, onLoad }) => {
  const [menu, setMenu] = useState({ isOpen: false, x: 0, y: 0 })

  const loadLabel = {
    firebird: 'Загрузить из Firebird',
    api: 'Загрузить через API',
    web: 'Загрузить через XML API'
  }[template.connection_type]

  const items = [
    ...(loadLabel ? [{ label: loadLabel, onClick: () => onLoad(template) }] : []),
    { divider: true },
    { label: 'Удалить шаблон', onClick: () => onDelete(template.id) }
  ]

  const openMenu = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setMenu({ isOpen: true, x: rect.right, y: rect.bottom + 4 })
  }

  return (
    <div className="template-row-actions">
      <IconButton
        icon="edit"
        variant="secondary"
        size="small"
        title="Редактировать шаблон"
        onClick={() => onEdit(template)}
      />
      <IconButton
        icon="more"
        variant="secondary"
        size="small"
        title="Другие действия"
        onClick={openMenu}
      />
      <ContextMenu
        isOpen={menu.isOpen}
        x={menu.x}
        y={menu.y}
        items={items}
        onClose={() => setMenu((m) => ({ ...m, isOpen: false }))}
      />
    </div>
  )
}

export default TemplateRowActions
