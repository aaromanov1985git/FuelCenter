/**
 * Точечный прогон боковой панели: шапка с версией и переключатель темы.
 *
 * Приём тот же, что в qa/audit.mjs: свой статический сервер над dist/, подмена
 * /api/** фикстурами, вход подделан токеном в localStorage. Прод не участвует.
 *
 * Запуск: node qa/_sidebar-shot.mjs <корень репозитория> <куда класть> [метка]
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { join, extname } from 'node:path'

const root = process.argv[2]
const outDir = process.argv[3]
const label = process.argv[4] || 'sidebar'
const dist = join(root, 'dist')

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

const fixtureFor = (url) => {
  if (/\/auth\/me/.test(url)) {
    return { id: 1, username: 'admin', full_name: 'Администратор', role: 'admin', is_superuser: true, is_active: true }
  }
  // Футер с переключателем темы рисуется только при включённой авторизации
  if (/\/v1\/config/.test(url)) return { enable_auth: true }
  if (/\/notifications/.test(url)) return { total: 4, items: [], unread_count: 4 }
  return { items: [], total: 0 }
}

const serve = () =>
  new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const url = decodeURIComponent((req.url || '/').split('?')[0])
      for (const f of [join(dist, url), join(dist, 'index.html')]) {
        try {
          const body = await readFile(f)
          res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' })
          res.end(body)
          return
        } catch { /* следующий */ }
      }
      res.writeHead(404)
      res.end()
    })
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
  })

const MEASURE = () => {
  const box = (el) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }
  }
  const overlap = (a, b) => {
    if (!a || !b) return null
    const dx = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
    const dy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
    return dx > 0 && dy > 0 ? { x: +dx.toFixed(1), y: +dy.toFixed(1) } : null
  }

  const header = document.querySelector('.sidebar-header')
  const title = document.querySelector('.sidebar-logo-title')
  const sub = document.querySelector('.sidebar-logo-sub')
  const toggle = document.querySelector('.sidebar-toggle')

  const themeButtons = Array.from(document.querySelectorAll('.theme-toggle-button')).map((b) => {
    const svg = b.querySelector('.theme-toggle-icon svg')
    const mark = b.querySelector('.theme-toggle-mark')
    const markSvg = b.querySelector('.theme-toggle-mark svg')
    const bb = box(b)
    const sb = box(svg)
    const cs = svg ? getComputedStyle(svg) : null
    return {
      label: b.getAttribute('aria-label'),
      active: b.classList.contains('active'),
      button: bb,
      icon: sb,
      iconStroke: cs ? cs.strokeWidth : null,
      // Влезает ли значок в кнопку с учётом рамки и внутренних полей
      iconFitsX: bb && sb ? +((bb.x + bb.w) - (sb.x + sb.w)).toFixed(1) : null,
      mark: box(mark),
      markSvg: box(markSvg),
      markOverlapsIcon: overlap(box(markSvg), sb),
      overflow: { x: b.scrollWidth - b.clientWidth, y: b.scrollHeight - b.clientHeight },
    }
  })

  return {
    header: box(header),
    headerContentHeight: header ? header.scrollHeight : null,
    title: box(title),
    titleText: title ? title.textContent : null,
    sub: box(sub),
    subText: sub ? sub.textContent : null,
    subTransform: sub ? getComputedStyle(sub).textTransform : null,
    collapseButton: box(toggle),
    // Кнопка сворачивания позиционируется fixed поверх шапки — проверяем наложение
    collapseOverTitle: overlap(box(toggle), box(title)),
    collapseOverSub: overlap(box(toggle), box(sub)),
    themeButtons,
    navGroups: Array.from(document.querySelectorAll('.sidebar-nav-group')).map((g) => ({
      title: (g.querySelector('.sidebar-nav-title') || {}).textContent || '',
      items: Array.from(g.querySelectorAll('.nav-item-label')).map((n) => n.textContent),
    })),
  }
}

const { server, port } = await serve()
const base = `http://127.0.0.1:${port}/`
await mkdir(outDir, { recursive: true })

const browser = await chromium.launch()
const report = {}

const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 3 })
await context.addInitScript(() => {
  localStorage.setItem('auth_token', 'qa-sidebar-token')
  localStorage.setItem('sidebar-collapsed', 'false')
})
await context.route('**/api/**', async (route) => {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureFor(route.request().url())) })
})

const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
await page.goto(base, { waitUntil: 'networkidle' })
await page.waitForSelector('.sidebar', { timeout: 20000 })

for (const theme of ['light', 'dark']) {
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t
    localStorage.setItem('theme', t)
  }, theme)
  await page.waitForTimeout(400)

  report[theme] = await page.evaluate(MEASURE)

  await page.locator('.sidebar').screenshot({ path: join(outDir, `${label}-${theme}.png`) })
  await page.locator('.sidebar-header').screenshot({ path: join(outDir, `${label}-header-${theme}.png`) })
  const toggleEl = page.locator('.theme-toggle').first()
  if (await toggleEl.isVisible().catch(() => false)) {
    await toggleEl.screenshot({ path: join(outDir, `${label}-theme-${theme}.png`) })
  }
}

report.pageErrors = errors
await writeFile(join(outDir, `${label}-report.json`), JSON.stringify(report, null, 2), 'utf-8')

for (const theme of ['light', 'dark']) {
  const r = report[theme]
  console.log(`\n== ${theme} ==`)
  console.log(`  шапка ${r.header.h}px, содержимое ${r.headerContentHeight}px`)
  console.log(`  подпись версии: "${r.subText}" (text-transform: ${r.subTransform})`)
  console.log(`  кнопка сворачивания над заголовком: ${r.collapseOverTitle ? JSON.stringify(r.collapseOverTitle) : 'нет'}`)
  for (const b of r.themeButtons) {
    console.log(`  ${b.active ? '[активна]' : '[обычная]'} ${b.label}`)
    console.log(`     кнопка ${b.button.w}x${b.button.h}, значок ${b.icon ? b.icon.w + 'x' + b.icon.h : 'нет'}, запас справа ${b.iconFitsX}px`)
    console.log(`     галочка ${b.markSvg ? b.markSvg.w + 'x' + b.markSvg.h : 'нет'}, налезает на значок: ${b.markOverlapsIcon ? JSON.stringify(b.markOverlapsIcon) : 'нет'}`)
  }
}

await browser.close()
server.close()
