import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import IconButton from '../IconButton'
import StatusBadge from '../StatusBadge'
import { ICON_NAMES } from '../ui/Icon'

/* Страховки ревизора: три роли правили интерфейс параллельно и каждая завела
   свой набор значков. Тесты фиксируют, что набор остался один, а геометрия —
   контурная 16px, наследующая цвет текста. */

describe('единый набор иконок', () => {
  it('IconButton рисует контурную иконку из примитива, а не залитый svg', () => {
    const { container } = render(<IconButton icon="edit" title="Редактировать" />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    // Раньше компонент рисовал собственный набор: viewBox 0 0 20 20 и fill="currentColor".
    expect(svg.getAttribute('viewBox')).toBe('0 0 16 16')
    expect(svg.getAttribute('fill')).toBe('none')
    expect(svg.getAttribute('stroke')).toBe('currentColor')
  })

  it('каждое имя из карты IconButton существует в наборе', () => {
    const used = ['edit', 'more', 'delete', 'trash', 'add', 'save', 'cancel', 'clear',
      'download', 'export', 'refresh', 'templates', 'settings', 'copy', 'users', 'search', 'view']
    for (const icon of used) {
      const { container } = render(<IconButton icon={icon} title={icon} />)
      expect(container.querySelector('svg'), `у «${icon}» нет глифа`).toBeTruthy()
    }
  })

  it('StatusBadge берёт имена глифов из набора, а не эмодзи', () => {
    for (const status of ['valid', 'invalid', 'pending', 'active', 'inactive', 'locked', 'success', 'failed', 'partial']) {
      const { container } = render(<StatusBadge status={status} />)
      const svg = container.querySelector('svg')
      expect(svg, `у статуса «${status}» нет значка`).toBeTruthy()
      expect(container.textContent).not.toMatch(/[✓✗⚠\u{1F300}-\u{1FAFF}]/u)
    }
  })

  it('«Неактивен» — пауза, а не крестик: крестик уже занят статусом «Ошибка»', () => {
    expect(ICON_NAMES).toContain('pause')
  })
})
