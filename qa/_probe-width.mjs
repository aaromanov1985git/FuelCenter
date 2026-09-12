#!/usr/bin/env node
/**
 * Точечный замер ширины таблиц на 1024 при ЗАВЕДОМО развёрнутом сайдбаре.
 * В qa/audit.mjs состояние сайдбара на 1024 между прогонами не стабильно
 * (clientWidth обёртки гуляет 742 <-> 918), поэтому B4/D3/C2/G4 там шумят.
 * Здесь сайдбар приводится к одному состоянию и печатаются ширины колонок.
 *
 * Запуск: node qa/_probe-width.mjs
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dist = join(__dirname, '..', 'dist')
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

const named = (n, prefix) =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `${prefix} ${i + 1}`,
    code: `${prefix.slice(0, 3).toUpperCase()}-${100 + i}`,
    is_active: i % 5 !== 0,
    created_at: '2026-09-01T10:00:00',
    updated_at: '2026-09-10T10:00:00',
  }))
const FUELS = ['ДТ', 'АИ-92', 'АИ-95', 'АИ-98', 'Газ']
const FIXTURES = [
  [/\/auth\/me/, { id: 1, username: 'admin', full_name: 'Администратор', role: 'admin', is_superuser: true, is_active: true }],
  [/\/vehicles/, { total: 42, items: named(42, 'ТС') }],
  [/\/gas-stations/, { total: 102, items: named(40, 'АЗС') }],
  [/\/fuel-types/, { total: 9, items: FUELS.map((name, i) => ({ id: i + 1, original_name: name, normalized_name: name, is_active: true })) }],
  [/\/users/, { total: 4, items: [{ id: 1, username: 'admin', full_name: 'Администратор', role: 'admin', is_active: true }, ...named(3, 'Пользователь')] }],
  [/\/upload-events/, { total: 31, items: named(31, 'Загрузка') }],
  [/\/notifications/, { total: 4, items: named(4, 'Уведомление'), unread_count: 4 }],
]
const fixtureFor = (url) => {
  for (const [re, body] of FIXTURES) if (re.test(url)) return body
  return { items: [], total: 0 }
}

const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0])
  for (const f of [join(dist, url), join(dist, 'index.html')]) {
    try {
      const b = await readFile(f)
      res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' })
      res.end(b)
      return
    } catch {
      /* следующий */
    }
  }
  res.writeHead(404)
  res.end()
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}`

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } })
await ctx.addInitScript(() => {
  localStorage.setItem('auth_token', 'qa-audit-token')
  localStorage.setItem('sidebar-collapsed', 'false')
})
await ctx.route('**/api/**', async (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureFor(route.request().url())) })
)
const page = await ctx.newPage()
await page.goto(base, { waitUntil: 'networkidle' })
await page.waitForSelector('.sidebar, aside')
await page.evaluate(() => {
  document.documentElement.dataset.theme = 'dark'
  localStorage.setItem('theme', 'dark')
})

for (const label of ['События загрузок', 'АЗС', 'Пользователи', 'Транспорт', 'Виды топлива']) {
  const btn = page.locator('.nav-item', { hasText: label }).first()
  if (await btn.isVisible().catch(() => false)) {
    await btn.click().catch(() => {})
    await page.waitForTimeout(900)
  }
  const out = await page.evaluate(() => {
    const t = document.querySelector('table')
    if (!t) return null
    const w = t.parentElement
    const td = t.querySelector('tbody tr td')
    const cs = td ? getComputedStyle(td) : null
    const rows = Array.from(t.querySelectorAll('tbody tr')).slice(0, 20).map((r) => Math.round(r.getBoundingClientRect().height))
    rows.sort((a, b) => a - b)
    const sb = document.querySelector('.sidebar, aside')
    return {
      sidebarW: sb ? Math.round(sb.getBoundingClientRect().width) : 0,
      tableCls: t.className.slice(0, 40),
      wrapCls: (w.className || '').slice(0, 40),
      tableW: t.scrollWidth,
      wrapW: w.clientWidth,
      tdPadding: cs ? cs.padding : null,
      tdLineHeight: cs ? cs.lineHeight : null,
      cols: Array.from(t.querySelectorAll('thead th')).map((h) => Math.round(h.getBoundingClientRect().width)),
      medRow: rows[Math.floor(rows.length / 2)],
    }
  })
  console.log(label, JSON.stringify(out))
}

await browser.close()
server.close()
