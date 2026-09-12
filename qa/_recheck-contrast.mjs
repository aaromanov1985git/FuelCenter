#!/usr/bin/env node
/**
 * Независимая сверка чисел из отчётов двух ролей: значения токенов читаются из
 * src/styles/tokens.css, контраст считается по WCAG 2.x (относительная яркость
 * sRGB), полупрозрачные подложки сводятся на указанный фон.
 *
 * Запуск: node qa/_recheck-contrast.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const css = readFileSync(join(root, 'src/styles/tokens.css'), 'utf8')

// две темы: первый блок — тёмная (:root), второй — светлая
const blocks = css.split(/\n/)
const themes = { dark: {}, light: {} }
let cur = 'dark'
for (const line of blocks) {
  if (/data-theme="light"|prefers-color-scheme:\s*light/.test(line)) cur = 'light'
  if (/data-theme="dark"/.test(line)) cur = 'dark'
  const m = line.match(/^\s*(--[a-z0-9-]+):\s*([^;]+);/i)
  if (m) themes[cur][m[1]] = m[2].trim()
}

const parse = (v) => {
  v = v.trim()
  let m = v.match(/^#([0-9a-f]{6})$/i)
  if (m) { const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255, 1] }
  m = v.match(/^#([0-9a-f]{3})$/i)
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16)).concat(1)
  m = v.match(/^rgba?\(([^)]+)\)$/i)
  if (m) { const p = m[1].split(',').map((x) => parseFloat(x)); return [p[0], p[1], p[2], p[3] === undefined ? 1 : p[3]] }
  return null
}
const over = (fg, bg) => fg.slice(0, 3).map((c, i) => c * fg[3] + bg[i] * (1 - fg[3])).concat(1)
const lum = (c) => {
  const f = c.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100 }

const R = (theme, fgTok, bgTok, need) => {
  const T = themes[theme]
  const get = (t) => parse(t.startsWith('--') ? T[t] : t)
  const bgRaw = get(bgTok)
  if (!bgRaw) return `${bgTok}: нет значения`
  const base = parse(T['--surface'])
  const bg = bgRaw[3] < 1 ? over(bgRaw, base) : bgRaw
  const fgRaw = get(fgTok)
  if (!fgRaw) return `${fgTok}: нет значения`
  const fg = fgRaw[3] < 1 ? over(fgRaw, bg) : fgRaw
  const r = ratio(fg, bg)
  return `${r}${need ? (r >= need ? ' >=' : ' ПРОВАЛ <') + need : ''}`
}

const say = (title, rows) => {
  console.log('\n' + title)
  for (const [label, ...rest] of rows) console.log('  ' + String(label).padEnd(46) + rest.join('   '))
}

say('Шапка таблицы (каркас, №12): --text-3 на --surface-2, порог 4.5', [
  ['тёмная', R('dark', '--text-3', '--surface-2', 4.5)],
  ['светлая', R('light', '--text-3', '--surface-2', 4.5)],
])

say('Роли акцента (каркас, №4/№7)', [
  ['dark  --accent на --surface-2 (было)', R('dark', '--accent', '--surface-2', 4.5)],
  ['dark  --accent-text на --surface-2 (стало)', R('dark', '--accent-text', '--surface-2', 4.5)],
  ['dark  --accent на --surface', R('dark', '--accent', '--surface', 4.5)],
  ['dark  --accent-text на --surface', R('dark', '--accent-text', '--surface', 4.5)],
  ['dark  #ffffff на --accent (было)', R('dark', '#ffffff', '--accent', 4.5)],
  ['dark  --ink-on-accent на --accent-solid (стало)', R('dark', '--ink-on-accent', '--accent-solid', 4.5)],
  ['light #ffffff на --accent (было)', R('light', '#ffffff', '--accent', 4.5)],
  ['light --ink-on-accent на --accent-solid (стало)', R('light', '--ink-on-accent', '--accent-solid', 4.5)],
  ['light --accent-text на --surface', R('light', '--accent-text', '--surface', 4.5)],
])

say('Семейство --*-ink (цвет): светлая тема, порог 4.5 для мелкого текста', [
  ['--green  на --surface (было)', R('light', '--green', '--surface', 4.5)],
  ['--green-ink на --surface (стало)', R('light', '--green-ink', '--surface', 4.5)],
  ['--green-ink на --surface-2', R('light', '--green-ink', '--surface-2', 4.5)],
  ['--green-ink на --green-soft', R('light', '--green-ink', '--green-soft', 4.5)],
  ['--amber  на --surface (было)', R('light', '--amber', '--surface', 4.5)],
  ['--amber-ink на --surface (стало)', R('light', '--amber-ink', '--surface', 4.5)],
  ['--amber-ink на --surface-2', R('light', '--amber-ink', '--surface-2', 4.5)],
  ['--amber-ink на --amber-soft', R('light', '--amber-ink', '--amber-soft', 4.5)],
  ['--red   на --surface (было)', R('light', '--red', '--surface', 4.5)],
  ['--red-ink на --surface (стало)', R('light', '--red-ink', '--surface', 4.5)],
  ['--red-ink на --red-soft', R('light', '--red-ink', '--red-soft', 4.5)],
  ['--cyan  на --surface (было)', R('light', '--cyan', '--surface', 4.5)],
  ['--cyan-ink на --surface (стало)', R('light', '--cyan-ink', '--surface', 4.5)],
  ['--cyan-ink на --cyan-soft', R('light', '--cyan-ink', '--cyan-soft', 4.5)],
])

say('Тёмная тема: --*-ink == --* (заявлено «не меняется»)', [
  ['--green-ink на --surface', R('dark', '--green-ink', '--surface', 4.5), '| --green:', R('dark', '--green', '--surface')],
  ['--amber-ink на --surface', R('dark', '--amber-ink', '--surface', 4.5), '| --amber:', R('dark', '--amber', '--surface')],
  ['--red-ink на --surface', R('dark', '--red-ink', '--surface', 4.5), '| --red:', R('dark', '--red', '--surface')],
  ['--cyan-ink на --surface', R('dark', '--cyan-ink', '--surface', 4.5), '| --cyan:', R('dark', '--cyan', '--surface')],
])

say('Подпись на сплошной заливке (цвет, 6 неизмеренных провалов)', [
  ['light --surface на --green (было)', R('light', '--surface', '--green', 4.5)],
  ['light --ink-on-bright на --green (стало)', R('light', '--ink-on-bright', '--green', 4.5)],
  ['light --surface на --red (было)', R('light', '--surface', '--red', 4.5)],
  ['light --ink-on-bright на --red (стало)', R('light', '--ink-on-bright', '--red', 4.5)],
])

say('Нетекстовые линии (порог 3:1 к соседней поверхности)', [
  ['dark  --border на --surface', R('dark', '--border', '--surface')],
  ['dark  --border-strong на --surface', R('dark', '--border-strong', '--surface')],
  ['light --border на --surface', R('light', '--border', '--surface')],
  ['light --border-strong на --surface', R('light', '--border-strong', '--surface')],
  ['light --green на --surface (рамка бейджа)', R('light', '--green', '--surface', 3)],
  ['light --amber на --surface (рамка бейджа)', R('light', '--amber', '--surface', 3)],
  ['light --cyan на --surface (рамка чипа)', R('light', '--cyan', '--surface', 3)],
  ['light --red на --surface (рамка бейджа)', R('light', '--red', '--surface', 3)],
])

say('Крупные числа: --text-1 (I2)', [
  ['light --text-1 на --surface', R('light', '--text-1', '--surface', 3)],
  ['dark  --text-1 на --surface', R('dark', '--text-1', '--surface', 3)],
])

say('Незакрытые находки E2 (остаток 450)', [
  ['light --red на --surface (.error-highlight, нужно 4.5)', R('light', '--red', '--surface', 4.5)],
  ['light --red-ink на --surface (предлагаемый фикс)', R('light', '--red-ink', '--surface', 4.5)],
  ['dark  --red на --surface (.error-highlight)', R('dark', '--red', '--surface', 4.5)],
])
