#!/usr/bin/env node
/**
 * Измерительный прогон интерфейса по регламенту проверки.
 *
 * Поднимает собранное приложение из dist/ своим статическим сервером, подменяет
 * все ответы /api/** фикстурами (прод не трогаем, пароли не нужны), проходит
 * страницы из qa/visual-diff.config.mjs в двух темах и на двух ширинах и
 * складывает в qa/report/:
 *   shots/<page>-<theme>-<width>.png       снимок первого экрана
 *   shots/<page>-<theme>-<width>-full.png  снимок страницы целиком
 *   data/<page>-<theme>-<width>.json       замеры по правилам регламента
 *   summary.json                           сводка: сколько находок по каждому правилу
 *
 * Запуск: node qa/audit.mjs
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises'
import { dirname, join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from './visual-diff.config.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const dist = join(root, 'dist')
const outDir = join(__dirname, 'report')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
}

// ── статический сервер над dist с откатом на index.html ──────────────────────
const serve = () =>
  new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const url = decodeURIComponent((req.url || '/').split('?')[0])
      const tryFiles = [join(dist, url), join(dist, 'index.html')]
      for (const f of tryFiles) {
        try {
          const body = await readFile(f)
          res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' })
          res.end(body)
          return
        } catch {
          /* пробуем следующий */
        }
      }
      res.writeHead(404)
      res.end()
    })
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
  })

// ── фикстуры ────────────────────────────────────────────────────────────────
const PROVIDERS = [
  'РП-газпром', 'КАЗС', 'ППР УТТ', 'МАЗС', 'РН-Карт', 'Эллия АТС', 'ГПН', 'ЭЛЛИА',
]
const FUELS = ['ДТ', 'АИ-92', 'АИ-95', 'АИ-98', 'Газ']

const txRows = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: 621824 - i,
    transaction_date: `2026-09-${String(12 - (i % 11)).padStart(2, '0')}T${String(8 + (i % 10)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}:00`,
    card_number: i % 3 === 0 ? `110001880000${4000 + i}` : `78260101207${10000 + i}`,
    provider_name: PROVIDERS[i % PROVIDERS.length],
    vehicle_display_name: i % 4 === 0 ? `А ${100 + i} ВС 72` : '',
    gas_station_name: i % 2 === 0 ? `АЗС ДНС-${1 + (i % 9)}` : `010539_PPCN6X${i % 10}E`,
    product: FUELS[i % FUELS.length],
    operation_type: 'Покупка',
    quantity: (20 + ((i * 13) % 180)).toFixed(2),
    currency: 'RUB',
    exchange_rate: '1.0000',
    vehicle_has_errors: i % 17 === 0,
  }))

const named = (n, prefix) =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `${prefix} ${i + 1}`,
    code: `${prefix.slice(0, 3).toUpperCase()}-${100 + i}`,
    is_active: i % 5 !== 0,
    created_at: '2026-09-01T10:00:00',
    updated_at: '2026-09-10T10:00:00',
  }))

const FIXTURES = [
  [/\/auth\/me/, { id: 1, username: 'admin', full_name: 'Администратор', role: 'admin', is_superuser: true, is_active: true }],
  [/\/transactions\/stats\/summary/, { total_transactions: 85249, total_quantity: 7315020.5, total_amount: 0, fuel_types_count: 9, providers_count: 8, last_upload: '2026-09-12T18:48:00' }],
  [/\/transactions/, { total: 85249, items: txRows(100) }],
  [/\/providers/, { total: 8, items: PROVIDERS.map((name, i) => ({ id: i + 1, name, code: name, is_active: true, templates_count: i === 0 ? 1 : 0 })) }],
  [/\/templates/, { total: 1, items: [{ id: 2, name: 'РП Газпром', provider_id: 1, connection_type: 'file', is_active: true, auto_load_enabled: false, field_mapping: {}, created_at: '2026-09-01T10:00:00' }] }],
  [/\/vehicles/, { total: 42, items: named(42, 'ТС') }],
  [/\/fuel-cards/, { total: 709, items: named(60, 'Карта') }],
  [/\/gas-stations/, { total: 102, items: named(40, 'АЗС') }],
  [/\/fuel-types/, { total: 9, items: FUELS.map((name, i) => ({ id: i + 1, original_name: name, normalized_name: name, is_active: true })) }],
  [/\/organizations/, { total: 12, items: named(12, 'ООО') }],
  [/\/users/, { total: 4, items: [{ id: 1, username: 'admin', full_name: 'Администратор', role: 'admin', is_active: true }, ...named(3, 'Пользователь')] }],
  [/\/upload-events/, { total: 31, items: named(31, 'Загрузка') }],
  [/\/notifications/, { total: 4, items: named(4, 'Уведомление'), unread_count: 4 }],
  [/\/dashboard\/stats/, {
    total_transactions: 85249, total_amount: 41230500.25, total_volume: 7315020.5,
    period_data: Array.from({ length: 12 }, (_, i) => ({ period: `${String(i + 1).padStart(2, '0')}.2026`, quantity: 400000 + i * 31000, count: 5000 + i * 420 })),
    providers: PROVIDERS.map((name, i) => ({ name, quantity: 900000 - i * 90000, count: 11000 - i * 900 })),
    leaders_by_quantity: named(10, 'Карта').map((r, i) => ({ ...r, card_number: `1100018800${4000 + i}`, vehicle: `А ${100 + i} ВС`, quantity: 9000 - i * 700, count: 120 - i * 8 })),
    leaders_by_count: named(10, 'Карта').map((r, i) => ({ ...r, card_number: `1100018800${5000 + i}`, vehicle: `В ${200 + i} КМ`, quantity: 8000 - i * 600, count: 140 - i * 9 })),
    products: FUELS.map((name, i) => ({ name, quantity: 1800000 - i * 300000, count: 20000 - i * 3000 })),
  }],
  [/\/dashboard\/auto-load-stats/, { total_transactions: 1240, total_liters: 96500.5, transactions_with_errors: 3, enabled_templates: 2, last_run: '2026-09-12T02:00:00', total: 0, items: [] }],
  [/\/anomalies/, { total: 0, items: [] }],
  [/\/settings|\/system-settings|\/email/, { items: [], total: 0, settings: {} }],
]

const fixtureFor = (url) => {
  for (const [re, body] of FIXTURES) if (re.test(url)) return body
  return { items: [], total: 0 }
}

// ── замеры в странице ───────────────────────────────────────────────────────
const MEASURE = () => {
  const SCALE = new Set([0, 1, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 80])
  const px = (v) => Math.round(parseFloat(v) || 0)
  const short = (el) => {
    if (!el || el === document.body) return 'body'
    const id = el.id ? `#${el.id}` : ''
    const cls = (el.className && typeof el.className === 'string')
      ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
      : ''
    return `${el.tagName.toLowerCase()}${id}${cls}`
  }
  const visible = (el) => {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false
    const r = el.getBoundingClientRect()
    return r.width > 1 && r.height > 1
  }
  const nodes = Array.from(document.querySelectorAll('body *')).filter(visible)

  const lum = (c) => {
    const m = c.match(/[\d.]+/g)
    if (!m) return null
    const [r, g, b, a] = m.map(Number)
    if (a !== undefined && a < 0.95) return null
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const effBg = (el) => {
    let n = el
    while (n && n !== document.documentElement) {
      const bg = getComputedStyle(n).backgroundColor
      const l = lum(bg)
      if (l !== null) return bg
      n = n.parentElement
    }
    return getComputedStyle(document.body).backgroundColor
  }
  const contrast = (fg, bg) => {
    const a = lum(fg), b = lum(bg)
    if (a === null || b === null) return null
    const hi = Math.max(a, b), lo = Math.min(a, b)
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100
  }
  const isPanel = (el) => {
    const cs = getComputedStyle(el)
    return px(cs.borderTopWidth) > 0 && px(cs.borderRadius) > 0 && lum(cs.backgroundColor) !== null
  }
  const interactive = (el) =>
    el.matches('button, a, input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])')
  const inOverlay = (el) => !!el.closest('.modal, .modal-overlay, [role="dialog"], .dropdown, .context-menu, .tooltip, .sheet, .toast, .toast-container')

  const F = {}
  const add = (code, item) => { (F[code] = F[code] || []).push(item) }

  // ── A. отступы и ритм ────────────────────────────────────────────────
  for (const el of nodes) {
    const cs = getComputedStyle(el)
    for (const prop of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginBottom', 'rowGap', 'columnGap']) {
      const v = px(cs[prop])
      if (v > 0 && !SCALE.has(v)) add('A1', { sel: short(el), prop, value: v })
    }
  }
  for (const el of nodes) {
    const kids = Array.from(el.children).filter(visible)
    if (kids.length < 3) continue
    const cs = getComputedStyle(el)
    if (cs.display !== 'flex' && cs.display !== 'block' && cs.display !== 'grid') continue
    const gaps = []
    for (let i = 1; i < kids.length; i++) {
      const a = kids[i - 1].getBoundingClientRect(), b = kids[i].getBoundingClientRect()
      if (b.top >= a.bottom - 1) gaps.push(Math.round(b.top - a.bottom))
    }
    const uniq = [...new Set(gaps)]
    if (gaps.length >= 2 && uniq.length > 1) add('A2', { sel: short(el), gaps: uniq.slice(0, 6) })
  }
  for (const el of nodes) {
    const cs = getComputedStyle(el)
    if (px(cs.paddingTop) === 0 && px(cs.paddingBottom) === 0) continue
    const kids = Array.from(el.children).filter(visible)
    if (!kids.length) continue
    const mt = px(getComputedStyle(kids[0]).marginTop)
    const mb = px(getComputedStyle(kids[kids.length - 1]).marginBottom)
    if (mt > 0 || mb > 0) add('A3', { sel: short(el), firstChildMarginTop: mt, lastChildMarginBottom: mb })
  }
  for (const tr of document.querySelectorAll('tbody tr')) {
    if (!visible(tr)) continue
    const h = Math.round(tr.getBoundingClientRect().height)
    const td = tr.querySelector('td')
    const fs = td ? px(getComputedStyle(td).fontSize) : null
    if (h && (h < 32 || h > 44)) add('A4', { sel: short(tr.closest('table')), rowHeight: h, cellFontSize: fs })
    break
  }
  const main = document.querySelector('.container, .main-content, main')
  if (main) {
    const r = main.getBoundingClientRect()
    add('A5', { sel: short(main), left: Math.round(r.left), right: Math.round(window.innerWidth - r.right) })
  }

  // ── B. колонки и таблицы ─────────────────────────────────────────────
  for (const table of document.querySelectorAll('table')) {
    if (!visible(table)) continue
    const tsel = short(table)
    for (const th of table.querySelectorAll('thead th')) {
      if (!visible(th)) continue
      const cs = getComputedStyle(th)
      const lh = px(cs.lineHeight) || px(cs.fontSize) * 1.2
      const h = th.getBoundingClientRect().height - px(cs.paddingTop) - px(cs.paddingBottom)
      if (lh && h > lh * 1.6) add('B1', { table: tsel, th: (th.textContent || '').trim().slice(0, 28), inner: Math.round(h), lineHeight: lh })
    }
    const cells = Array.from(table.querySelectorAll('th, td')).filter(visible)
    for (const c of cells) {
      if (c.scrollWidth > c.clientWidth + 1) {
        const cs = getComputedStyle(c)
        add('B2', { table: tsel, cell: (c.textContent || '').trim().slice(0, 28), scrollWidth: c.scrollWidth, clientWidth: c.clientWidth, textOverflow: cs.textOverflow, title: !!c.title })
      }
    }
    const heads = Array.from(table.querySelectorAll('thead th'))
    const firstRow = table.querySelector('tbody tr')
    if (firstRow) {
      Array.from(firstRow.children).forEach((td, i) => {
        const txt = (td.textContent || '').trim()
        const numeric = /^[\d\s.,-]+$/.test(txt) && /\d/.test(txt)
        const cs = getComputedStyle(td)
        const hs = heads[i] ? getComputedStyle(heads[i]).textAlign : null
        if (numeric && (cs.textAlign !== 'right' || !cs.fontVariantNumeric.includes('tabular')))
          add('B3', { table: tsel, col: (heads[i]?.textContent || '').trim().slice(0, 24), align: cs.textAlign, headAlign: hs, tabular: cs.fontVariantNumeric, sample: txt.slice(0, 14) })
      })
    }
    const wrap = table.parentElement
    if (wrap) {
      const ws = getComputedStyle(wrap)
      if (table.scrollWidth > wrap.clientWidth + 1)
        add('B4', { table: tsel, tableWidth: table.scrollWidth, wrapWidth: wrap.clientWidth, overflowX: ws.overflowX })
    }
    const fc = table.querySelector('tbody tr td:first-child')
    if (fc) {
      const cs = getComputedStyle(fc)
      if (cs.position === 'sticky' && lum(cs.backgroundColor) === null)
        add('B6', { table: tsel, background: cs.backgroundColor })
    }
  }

  // ── C. поверхности ───────────────────────────────────────────────────
  for (const el of nodes) {
    if (!isPanel(el)) continue
    const inner = Array.from(el.querySelectorAll('*')).filter((n) => visible(n) && isPanel(n))
    if (inner.length) add('C1', { outer: short(el), inner: inner.slice(0, 3).map(short) })
  }
  for (const el of nodes) {
    const cs = getComputedStyle(el)
    if (cs.boxShadow && cs.boxShadow !== 'none' && !inOverlay(el) && !interactive(el))
      add('C2', { sel: short(el), shadow: cs.boxShadow.slice(0, 48) })
  }
  for (const h1 of document.querySelectorAll('h1')) {
    if (!visible(h1)) continue
    let n = h1.parentElement, hit = null
    while (n && n !== document.body) { if (isPanel(n)) { hit = short(n); break } n = n.parentElement }
    if (hit) add('C3', { h1: (h1.textContent || '').trim().slice(0, 30), panel: hit })
  }

  // ── D. типографика ───────────────────────────────────────────────────
  const golos = document.fonts.check('14px "Golos Text"')
  const plex = document.fonts.check('14px "IBM Plex Mono"')
  const sizes = new Set()
  for (const el of nodes) {
    if (!el.textContent || !el.textContent.trim()) continue
    const cs = getComputedStyle(el)
    sizes.add(px(cs.fontSize))
    const fam = cs.fontFamily.toLowerCase()
    if (fam.includes('mono') || fam.includes('plex')) {
      const inTable = el.closest('td, th')
      if (!inTable) add('D2', { sel: short(el), family: cs.fontFamily.slice(0, 40), text: el.textContent.trim().slice(0, 24) })
    }
    if (interactive(el) && px(cs.fontSize) > 0 && px(cs.fontSize) < 12)
      add('D4', { sel: short(el), fontSize: px(cs.fontSize) })
  }
  add('D1', { golosLoaded: golos, plexLoaded: plex, bodyFamily: getComputedStyle(document.body).fontFamily.slice(0, 60) })
  add('D3', { distinctFontSizes: [...sizes].sort((a, b) => a - b) })

  // ── E. цвет и контраст ───────────────────────────────────────────────
  for (const el of nodes) {
    const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim().length > 1)
    if (!own) continue
    const cs = getComputedStyle(el)
    const bg = effBg(el)
    const ratio = contrast(cs.color, bg)
    if (ratio === null) continue
    const size = px(cs.fontSize)
    const bold = parseInt(cs.fontWeight, 10) >= 600
    const large = size >= 24 || (size >= 19 && bold)
    const need = large ? 3 : 4.5
    if (ratio < need)
      add('E2', { sel: short(el), ratio, need, fontSize: size, color: cs.color, bg, text: (el.textContent || '').trim().slice(0, 24) })
  }

  // ── F. состояния и интерактив ────────────────────────────────────────
  for (const el of nodes) {
    if (!interactive(el)) continue
    const r = el.getBoundingClientRect()
    if (r.width < 32 || r.height < 32)
      add('F2', { sel: short(el), w: Math.round(r.width), h: Math.round(r.height), text: (el.textContent || '').trim().slice(0, 20) })
    const cs = getComputedStyle(el)
    if (cs.outlineStyle === 'none' && px(cs.outlineWidth) === 0) add('F1', { sel: short(el), note: 'outline снят, проверить :focus-visible' })
  }

  // ── G. признаки безличного оформления ────────────────────────────────
  for (const el of nodes) {
    const cs = getComputedStyle(el)
    const bi = cs.backgroundImage
    if (bi && bi.includes('gradient')) {
      const stops = bi.match(/rgba?\([^)]*\)/g) || []
      const uniq = [...new Set(stops)]
      if (stops.length >= 2 && uniq.length === 1) add('G2', { sel: short(el), gradient: bi.slice(0, 60), stops: uniq })
    }
    const four = px(cs.borderTopWidth) > 0 && px(cs.borderRadius) > 0 && lum(cs.backgroundColor) !== null && cs.boxShadow !== 'none'
    if (four && !inOverlay(el)) add('G4', { sel: short(el) })
    if (/^h[1-6]$/i.test(el.tagName) && cs.textAlign === 'center') add('G7', { sel: short(el), align: 'center' })
    if (cs.textShadow && cs.textShadow !== 'none') add('G7', { sel: short(el), textShadow: cs.textShadow.slice(0, 40) })
    if (!interactive(el) && !inOverlay(el)) {
      if (cs.transitionDuration && cs.transitionDuration !== '0s' && cs.transitionProperty !== 'none')
        add('G10', { sel: short(el), transition: `${cs.transitionProperty.slice(0, 24)} ${cs.transitionDuration}` })
    }
  }
  const upper = nodes.filter((el) => getComputedStyle(el).textTransform === 'uppercase' && el.textContent && el.textContent.trim())
  add('G8', { uppercaseNodes: upper.length, totalTextNodes: nodes.filter((n) => n.textContent && n.textContent.trim()).length, samples: upper.slice(0, 6).map((n) => (n.textContent || '').trim().slice(0, 18)) })

  // ── H. сценарные ─────────────────────────────────────────────────────
  const firstRow = document.querySelector('tbody tr')
  if (firstRow) {
    const t = Math.round(firstRow.getBoundingClientRect().top)
    add('H2', { firstRowTop: t, viewportHeight: window.innerHeight, visibleWithoutScroll: t < window.innerHeight })
  }
  const dataEl = document.querySelector('table, .list, .cards-grid')
  if (dataEl) {
    const t = Math.max(0, Math.round(dataEl.getBoundingClientRect().top))
    add('H1', { chromeHeightAboveData: t, viewportHeight: window.innerHeight, sharePercent: Math.round((t / window.innerHeight) * 100) })
  }

  return { findings: F, counts: Object.fromEntries(Object.entries(F).map(([k, v]) => [k, v.length])) }
}

// ── прогон ──────────────────────────────────────────────────────────────────
const run = async () => {
  await rm(outDir, { recursive: true, force: true })
  await mkdir(join(outDir, 'shots'), { recursive: true })
  await mkdir(join(outDir, 'data'), { recursive: true })

  const { server, port } = await serve()
  const base = `http://127.0.0.1:${port}`
  const browser = await chromium.launch()
  const summary = []

  for (const viewport of config.viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } })
    await context.addInitScript(() => {
      localStorage.setItem('auth_token', 'qa-audit-token')
      localStorage.setItem('sidebar-collapsed', 'false')
    })
    await context.route('**/api/**', async (route) => {
      const url = route.request().url()
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureFor(url)) })
    })
    const page = await context.newPage()
    const consoleErrors = []
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)) })
    page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 160)}`))

    await page.goto(base, { waitUntil: 'networkidle' })
    await page.waitForSelector('.sidebar, aside', { timeout: 20000 })

    for (const theme of config.themes) {
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t
        localStorage.setItem('theme', t)
      }, theme)
      await page.waitForTimeout(200)

      for (const { tab, label } of config.pages) {
        const key = `${tab}-${theme}-${viewport.name}`
        const btn = page.locator('.nav-item', { hasText: label }).first()
        if (await btn.isVisible().catch(() => false)) {
          await btn.click().catch(() => {})
          await page.waitForTimeout(config.waitAfterNavigate)
        }
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.waitForTimeout(120)

        await page.screenshot({ path: join(outDir, 'shots', `${key}.png`) })
        await page.screenshot({ path: join(outDir, 'shots', `${key}-full.png`), fullPage: true })

        const before = consoleErrors.length
        const measured = await page.evaluate(MEASURE)

        // B5: липкая шапка — прокручиваем контейнер таблицы и сверяем позицию
        const sticky = await page.evaluate(() => {
          const table = document.querySelector('table')
          if (!table) return null
          const th = table.querySelector('thead th')
          if (!th) return null
          let box = table.parentElement
          while (box && box !== document.body) {
            const cs = getComputedStyle(box)
            if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && box.scrollHeight > box.clientHeight + 4) break
            box = box.parentElement
          }
          const t0 = Math.round(th.getBoundingClientRect().top)
          if (!box || box === document.body) {
            window.scrollBy(0, 300)
            const t1 = Math.round(th.getBoundingClientRect().top)
            window.scrollTo(0, 0)
            return { container: 'page', before: t0, after: t1, sticks: Math.abs(t1 - t0) < 4 }
          }
          box.scrollTop = 300
          const t1 = Math.round(th.getBoundingClientRect().top)
          box.scrollTop = 0
          return { container: box.className || box.tagName, before: t0, after: t1, sticks: Math.abs(t1 - t0) < 4 }
        })
        if (sticky) measured.findings.B5 = [sticky]

        const record = {
          page: tab, label, theme, width: viewport.width,
          consoleErrors: consoleErrors.slice(before),
          ...measured,
        }
        await writeFile(join(outDir, 'data', `${key}.json`), JSON.stringify(record, null, 2), 'utf8')
        summary.push({ key, page: tab, theme, width: viewport.width, counts: measured.counts, sticky, consoleErrors: record.consoleErrors.length })
        process.stdout.write(`ok ${key}\n`)
      }
    }
    await context.close()
  }

  await browser.close()
  server.close()

  const byRule = {}
  for (const s of summary) for (const [k, v] of Object.entries(s.counts)) byRule[k] = (byRule[k] || 0) + v
  await writeFile(join(outDir, 'summary.json'), JSON.stringify({ byRule, runs: summary }, null, 2), 'utf8')
  process.stdout.write(`\nвсего прогонов: ${summary.length}\nпо правилам: ${JSON.stringify(byRule)}\n`)
}

run().catch((e) => { console.error(e); process.exit(1) })
