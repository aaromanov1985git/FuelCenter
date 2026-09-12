/* Проверка, что полосы липкой шапки и липкой колонки реально нарисованы
   (пиксели), а не просто объявлены. Читаем сгенерированные слои ::before/::after
   и положение ячеек. */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' }
const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0])
  for (const f of [join(dist, url), join(dist, 'index.html')]) {
    try {
      const body = await readFile(f)
      res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' })
      res.end(body)
      return
    } catch { /* next */ }
  }
  res.writeHead(404)
  res.end()
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}`

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } })
await ctx.addInitScript(() => {
  localStorage.setItem('auth_token', 'qa-probe')
  localStorage.setItem('sidebar-collapsed', 'false')
})
await ctx.route('**/api/**', async (route) => {
  const u = route.request().url()
  let body = { items: [], total: 0 }
  if (/\/auth\/me/.test(u)) {
    body = { id: 1, username: 'admin', full_name: 'Администратор', role: 'admin', is_superuser: true, is_active: true }
  } else if (/\/users/.test(u)) {
    const items = Array.from({ length: 40 }, (_, i) => ({
      id: i + 1, username: `user${i}`, full_name: `Пользователь ${i}`, email: `u${i}@example.com`,
      role: i % 3 === 0 ? 'admin' : 'user', is_active: true, created_at: '2026-01-01T00:00:00',
    }))
    body = { total: items.length, items }
  }
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
})
const page = await ctx.newPage()
await page.goto(base, { waitUntil: 'networkidle' })
await page.waitForSelector('.sidebar, aside', { timeout: 20000 })
const btn = page.locator('.nav-item', { hasText: 'Пользователи' }).first()
if (await btn.isVisible().catch(() => false)) await btn.click()
await page.waitForTimeout(1200)

const out = await page.evaluate(() => {
  const th = document.querySelector('.ui-table-sticky .ui-table-header-cell')
  const stickyTd = document.querySelector('.ui-table-cell-sticky-right')
  const wrap = document.querySelector('.ui-table-wrapper-sticky')
  const g = (el, pseudo) => {
    if (!el) return null
    const cs = getComputedStyle(el, pseudo)
    return { content: cs.content, position: cs.position, h: cs.height, w: cs.width, bg: cs.backgroundColor, shadow: cs.boxShadow }
  }
  return {
    headerCell: th ? { pos: getComputedStyle(th).position, shadow: getComputedStyle(th).boxShadow, bg: getComputedStyle(th).backgroundColor } : null,
    headerLine: g(th, '::before'),
    stickyCell: stickyTd ? { pos: getComputedStyle(stickyTd).position, shadow: getComputedStyle(stickyTd).boxShadow, bg: getComputedStyle(stickyTd).backgroundColor, right: getComputedStyle(stickyTd).right } : null,
    stickyLine: g(stickyTd, '::after'),
    wrapper: wrap ? { maxH: getComputedStyle(wrap).maxHeight, overflow: getComputedStyle(wrap).overflow, h: Math.round(wrap.getBoundingClientRect().height), scrollH: wrap.scrollHeight } : null,
  }
})
console.log(JSON.stringify(out, null, 2))

// проверка липкости на деле: прокрутить контейнер и сравнить положение шапки
const stick = await page.evaluate(async () => {
  const wrap = document.querySelector('.ui-table-wrapper-sticky')
  const th = document.querySelector('.ui-table-sticky .ui-table-header-cell')
  const td = document.querySelector('.ui-table-cell-sticky-right')
  if (!wrap || !th) return null
  const before = { th: th.getBoundingClientRect().top, td: td ? td.getBoundingClientRect().right : null }
  wrap.scrollTop = 200
  wrap.scrollLeft = 400
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  const after = { th: th.getBoundingClientRect().top, td: td ? td.getBoundingClientRect().right : null }
  return { before, after, scrolled: { top: wrap.scrollTop, left: wrap.scrollLeft }, wrapTop: wrap.getBoundingClientRect().top, wrapRight: wrap.getBoundingClientRect().right }
})
console.log('STICK', JSON.stringify(stick))

await browser.close()
server.close()
