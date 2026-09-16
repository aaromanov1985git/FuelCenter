/**
 * Точечный прогон дашборда: график «Динамика потребления».
 *
 * Приём тот же, что в qa/audit.mjs: свой статический сервер над dist/, подмена
 * /api/** фикстурами, вход подделан токеном в localStorage. Прод не участвует.
 *
 * Фикстура повторяет боевую форму: тринадцать месяцев с сентября 2025 по
 * сентябрь 2026 и семь провайдеров в period_providers. Именно этот разрез
 * (kind: 'provider') в qa/audit.mjs не подавался вовсе — фикстура там без
 * period_providers, поэтому рисовался простой график, и ни перепутанный
 * порядок месяцев, ни обрезка справа в прогон не попадали.
 *
 * Запуск: node qa/_dashboard-shot.mjs <корень> <куда класть> [метка]
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { join, extname } from 'node:path'

const root = process.argv[2]
const outDir = process.argv[3]
const label = process.argv[4] || 'dash'
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

const PROVIDERS = ['ГПН', 'КАЗС', 'МАЗС', 'ППР УТТ', 'РН-Карт', 'РП-газпром', 'ЭЛЛИА']

// Сентябрь 2025 … сентябрь 2026 — тринадцать точек, как на боевом экране.
// Ключи в формате MM.YYYY: обычный .sort() по ним ставит «09.2025» между
// «08.2026» и «09.2026», что и видно на снимке «до».
const MONTHS = [
  '09.2025', '10.2025', '11.2025', '12.2025',
  '01.2026', '02.2026', '03.2026', '04.2026', '05.2026', '06.2026',
  '07.2026', '08.2026', '09.2026',
]

const periodProviders = {}
MONTHS.forEach((m, i) => {
  periodProviders[m] = {}
  PROVIDERS.forEach((name, j) => {
    // Первые месяцы заметно ниже — чтобы неверный порядок бросался в глаза
    const scale = i < 4 ? 0.18 : 1
    periodProviders[m][name] = {
      quantity: Math.round((90000 - j * 9000 + i * 2500) * scale),
      count: Math.round((900 - j * 90 + i * 25) * scale),
    }
  })
})

const periodData = MONTHS.map((m, i) => ({
  period: m,
  quantity: Object.values(periodProviders[m]).reduce((s, d) => s + d.quantity, 0),
  count: Object.values(periodProviders[m]).reduce((s, d) => s + d.count, 0),
}))

const leaders = (n, prefix) =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    card_number: `1100018800004${String(80 + i).padStart(2, '0')}`,
    vehicle: i % 3 === 0 ? 'Не указано' : `Нефтебаза, заво...`,
    quantity: 216282 - i * 18000,
    count: 79 - i * 5,
    name: `${prefix} ${i + 1}`,
  }))

const fixtureFor = (url) => {
  if (/\/auth\/me/.test(url)) {
    return { id: 1, username: 'admin', full_name: 'Администратор', role: 'admin', is_superuser: true, is_active: true }
  }
  if (/\/v1\/config/.test(url)) return { enable_auth: true }
  if (/\/dashboard\/auto-load-stats/.test(url)) {
    return {
      period_hours: 24, has_errors: false, total_transactions: 73, total_liters: 4418.12,
      transactions_with_errors: 0, enabled_templates: 1, last_run: '2026-09-14T02:00:00',
      providers: [{ name: 'МАЗС', transactions_count: 73, liters: 4418.12, status: 'success' }],
      total: 0, items: [],
    }
  }
  if (/\/dashboard\/stats/.test(url)) {
    return {
      total_transactions: 63643,
      total_amount: 0,
      total_volume: 5464000,
      period_data: periodData,
      period_providers: periodProviders,
      // Поле именно provider_name — так отдаёт backend/app/routers/dashboard.py.
      // С «name» легенда падает на a.provider_name.localeCompare(...), и весь
      // дашборд уходит в ErrorBoundary.
      providers: PROVIDERS.map((name, i) => ({
        provider_id: i + 1,
        provider_name: name,
        quantity: [2973660, 290448, 949012, 361193, 75948, 1787640, 1997200][i],
        count: 9000 - i * 700,
      })),
      leaders_by_quantity: leaders(10, 'Карта'),
      leaders_by_count: leaders(10, 'Карта'),
      products: ['ДТ', 'АИ-92', 'АИ-95'].map((name, i) => ({ name, quantity: 1800000 - i * 300000, count: 20000 - i * 3000 })),
    }
  }
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
  const bars = document.querySelector('.dash-chart-bars')
  if (!bars) return { error: 'график не найден' }
  const wrappers = Array.from(bars.querySelectorAll('.dash-chart-bar-wrapper'))
  const br = bars.getBoundingClientRect()

  // Пропорциональность: высота столбца должна отвечать его значению.
  // Значение берём из подписи под столбцом («511 тыс. л»).
  const barMetrics = wrappers.map((w) => {
    const el = w.querySelector('.dash-chart-bar-stacked, .dash-chart-bar-simple')
    const metaStrong = w.querySelector('.dash-chart-meta-strong')
    const declared = el ? parseFloat((el.style.height || '0').replace('px', '')) : 0
    const actual = el ? +el.getBoundingClientRect().height.toFixed(1) : 0
    const value = metaStrong ? parseFloat(metaStrong.textContent.replace(/\s/g, '').replace(',', '.')) : null
    return { declared, actual, squeezed: +(declared - actual).toFixed(1), value }
  })
  const ratios = barMetrics.filter((b) => b.value).map((b) => +(b.actual / b.value).toFixed(3))

  const labels = wrappers.map((w) => {
    const l = w.querySelector('.dash-chart-label')
    const r = w.getBoundingClientRect()
    return {
      text: l ? l.textContent.trim() : '',
      x: +r.x.toFixed(1),
      w: +r.width.toFixed(1),
      // Столбец целиком за правым краем области — его не видно и не докрутить
      cutOff: +(r.x + r.width - (br.x + br.width)).toFixed(1),
      labelClipped: l ? l.scrollWidth - l.clientWidth > 1 : null,
    }
  })

  return {
    barMetrics,
    // Если столбцы пропорциональны, отношение высоты к значению одинаково
    ratioSpread: ratios.length ? +(Math.max(...ratios) - Math.min(...ratios)).toFixed(3) : null,
    squeezedBars: barMetrics.filter((b) => b.squeezed > 1).length,
    barsBox: { w: +br.width.toFixed(1), h: +br.height.toFixed(1) },
    scrollWidth: bars.scrollWidth,
    clientWidth: bars.clientWidth,
    overflowX: bars.scrollWidth - bars.clientWidth,
    // Вертикальной прокрутки быть не должно: иначе элемент перехватит колесо
    overflowY: bars.scrollHeight - bars.clientHeight,
    overflowStyle: getComputedStyle(bars).overflowX,
    barCount: wrappers.length,
    order: labels.map((l) => l.text),
    barsFullyOutside: labels.filter((l) => l.cutOff > 0).length,
    labelsClipped: labels.filter((l) => l.labelClipped).length,
    widthPerBar: wrappers.length ? +(br.width / wrappers.length).toFixed(1) : null,
    labels,
  }
}

const { server, port } = await serve()
const base = `http://127.0.0.1:${port}/`
await mkdir(outDir, { recursive: true })

const browser = await chromium.launch()
const report = {}

for (const vp of [{ name: '1920', width: 1920, height: 1100 }, { name: '1440', width: 1440, height: 1000 }]) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2 })
  await context.addInitScript(() => {
    localStorage.setItem('auth_token', 'qa-dash-token')
    localStorage.setItem('sidebar-collapsed', 'false')
  })
  await context.route('**/api/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureFor(route.request().url())) })
  })

  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 300)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 400)) })
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  if (process.env.DASH_DEBUG) {
    console.log('--- консоль ---', errors)
    console.log('--- тело ---', (await page.locator('body').innerText().catch(() => '')).slice(0, 600))
    console.log('--- классы ---', await page.evaluate(() => Array.from(document.querySelectorAll('#root > *, #root > * > *')).map(e => e.className).slice(0, 12)))
  }
  await page.waitForSelector('.sidebar', { timeout: 20000 })
  const navBtn = page.locator('.nav-item', { hasText: 'Дашборд' }).first()
  if (await navBtn.isVisible().catch(() => false)) await navBtn.click().catch(() => {})
  await page.waitForSelector('.dash-chart-bars', { timeout: 20000 })
  await page.waitForTimeout(700)

  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t
      localStorage.setItem('theme', t)
    }, theme)
    await page.waitForTimeout(300)

    report[`${vp.name}-${theme}`] = await page.evaluate(MEASURE)
    const card = page.locator('.dash-chart-bars').first().locator('xpath=ancestor::*[contains(@class,"dash-card")][1]')
    if (await card.count()) {
      await card.screenshot({ path: join(outDir, `${label}-chart-${vp.name}-${theme}.png`) }).catch(() => {})
    }
    await page.screenshot({ path: join(outDir, `${label}-${vp.name}-${theme}.png`) })
  }
  report[`${vp.name}-errors`] = errors
  await context.close()
}

await writeFile(join(outDir, `${label}-report.json`), JSON.stringify(report, null, 2), 'utf-8')

for (const [key, r] of Object.entries(report)) {
  if (!r || !r.order) continue
  console.log(`\n== ${key} ==`)
  console.log(`  область ${r.barsBox.w}px, содержимое ${r.scrollWidth}px, вылет ${r.overflowX}px (overflow-x: ${r.overflowStyle})`)
  console.log(`  столбцов ${r.barCount}, на столбец ${r.widthPerBar}px, целиком за краем: ${r.barsFullyOutside}, подписей режется: ${r.labelsClipped}`)
  console.log(`  сжато вёрсткой столбцов: ${r.squeezedBars}, разброс «высота/значение»: ${r.ratioSpread}, вертикальный вылет: ${r.overflowY}px`)
  console.log(`  порядок: ${r.order.join(' | ')}`)
}

await browser.close()
server.close()
