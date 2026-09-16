import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
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

/* Инлайновый <svg> в компоненте — это второй набор иконок: у него своя сетка
   (в проекте были 20x20, 24x24, 14x14, 14x16) и свой штрих (1.0-2.0px против
   канонических 1.6). Поэтому список файлов, которым инлайновый svg разрешён,
   закрыт: значение — МАКСИМАЛЬНОЕ число svg в файле, причина рядом.
   Всё остальное обязано рисоваться примитивом ui/Icon по имени глифа. */
const SVG_ALLOWED = {
  'ui/Icon/Icon.jsx': 1,               // сам примитив
  'Dashboard.jsx': 1,                  // спарклайн: график из данных, градиент, preserveAspectRatio
  'ProviderAnalysisDashboard.jsx': 1,  // маркер Leaflet: html-строка вне React
  'FuelCardsList.jsx': 1,              // чип платёжной карты: иллюстрация в сетке 16x12
  'TanksPage.jsx': 1,                  // график объёма ёмкости из данных: оси, сетка, динамический path
}

const collectJsx = (dir, acc = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__') collectJsx(full, acc)
    } else if (entry.name.endsWith('.jsx') && !entry.name.includes('.test.')) {
      acc.push(full)
    }
  }
  return acc
}

describe('инлайновые svg не возвращаются', () => {
  const root = path.resolve(__dirname, '..')

  it('ни один компонент не рисует свой svg в обход примитива', () => {
    const offenders = []
    for (const file of collectJsx(root)) {
      // Комментарии снимаем: в самом примитиве <svg> упомянут в пояснении.
      const code = fs.readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*(\/\/|\*).*$/gm, '')
      const count = (code.match(/<svg[\s>]/g) || []).length
      if (count === 0) continue
      const rel = path.relative(root, file).split(path.sep).join('/')
      const allowed = SVG_ALLOWED[rel] ?? 0
      if (count > allowed) offenders.push(`${rel}: ${count} svg, разрешено ${allowed}`)
    }
    // Сообщение перечисляет виновников: добавлять их в SVG_ALLOWED можно только
    // с причиной — это не иконка (график, иллюстрация, разметка вне React).
    expect(offenders, ['рисуют svg в обход <Icon>:', ...offenders].join('; ')).toEqual([])
  })

  it('в проекте один набор иконок: ui/Icons/Icons.jsx удалён', () => {
    // Мёртвый второй набор (21 svg в сетке 14x14 со штрихом 1.4) никто не
    // импортировал, но оставался образцом «как надо» рядом с примитивом.
    expect(fs.existsSync(path.join(root, 'ui/Icons/Icons.jsx'))).toBe(false)
  })
})
