import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import Icon, { ICON_NAMES } from './Icon.jsx'

// Набор имён — публичный контракт для остальных страниц: если имя исчезнет,
// вызывающий код получит пустоту вместо иконки, поэтому список зафиксирован тестом.
const REQUIRED = [
  'grid', 'rows', 'truck', 'card', 'chart', 'pin', 'drop', 'box', 'layers', 'building',
  'users', 'clock', 'bell', 'gear', 'upload', 'download', 'filter', 'columns', 'refresh',
  'trash', 'search', 'plus', 'edit', 'close', 'check', 'chevron-down', 'chevron-left',
  'chevron-right', 'eye', 'copy', 'save', 'play', 'alert', 'info', 'file', 'calendar',
  'key', 'link', 'lock',
  // Добавлено ревизором: без этих имён роли подменяли значок «похожим» —
  // «Выйти» получал замок, корень навигации — сетку, «Неактивен» — крестик,
  // а sun/moon приходилось брать из второго, старого набора иконок.
  'chevron-up', 'more', 'sun', 'moon', 'log-out', 'home', 'shield', 'eye-off', 'pause',
]

describe('Icon', () => {
  it('содержит все обязательные имена', () => {
    expect(REQUIRED.filter((n) => !ICON_NAMES.includes(n))).toEqual([])
  })

  it('рисует контурный svg 16px, наследующий цвет текста', () => {
    const { container } = render(<Icon name="trash" />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg.getAttribute('width')).toBe('16')
    expect(svg.getAttribute('height')).toBe('16')
    expect(svg.getAttribute('viewBox')).toBe('0 0 16 16')
    expect(svg.getAttribute('fill')).toBe('none')
    expect(svg.getAttribute('stroke')).toBe('currentColor')
    expect(svg.getAttribute('stroke-width')).toBe('1.6')
    expect(svg.getAttribute('stroke-linecap')).toBe('round')
    expect(svg.getAttribute('stroke-linejoin')).toBe('round')
    expect(svg.getAttribute('aria-hidden')).toBe('true')
  })

  it('каждое имя рисует хотя бы одну геометрическую фигуру', () => {
    for (const name of ICON_NAMES) {
      const { container } = render(<Icon name={name} />)
      const shapes = container.querySelectorAll('svg > path, svg > rect, svg > circle')
      expect(shapes.length, `иконка «${name}» пустая`).toBeGreaterThan(0)
    }
  })

  it('уважает size и className', () => {
    const { container } = render(<Icon name="check" size={20} className="btn-icon" />)
    const svg = container.querySelector('svg')
    expect(svg.getAttribute('width')).toBe('20')
    expect(svg.classList.contains('ui-icon')).toBe(true)
    expect(svg.classList.contains('btn-icon')).toBe(true)
  })

  it('неизвестное имя ничего не рисует и не падает', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { container } = render(<Icon name="нет-такой-иконки" />)
    expect(container.querySelector('svg')).toBeNull()
    warn.mockRestore()
  })
})
