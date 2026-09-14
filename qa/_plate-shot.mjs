/**
 * Точечный снимок колонки госномера на странице ТС.
 * Повторяет приём qa/audit.mjs: свой статический сервер над dist/, подмена
 * /api/** фикстурами, вход подделан токеном в localStorage. Прод не участвует.
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { join, extname } from 'node:path'

const root = process.argv[2]
const outDir = process.argv[3]
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

const PLATES = ['8689УН86', 'В331КМ186', 'К178РМ186', 'Н328УХ86', 'К914ТН186', '9485УХ86', '']

const vehicles = {
  total: 42,
  items: Array.from({ length: 42 }, (_, i) => ({
    id: i + 1,
    name: `ТС ${i + 1}`,
    code: `ТС-${100 + i}`,
    garage_number: `${4100 + i}`,
    license_plate: PLATES[i % PLATES.length],
    is_active: i % 5 !== 0,
    created_at: '2026-09-01T10:00:00',
    updated_at: '2026-09-10T10:00:00',
  })),
}

const fixtureFor = (url) => {
  if (/\/auth\/me/.test(url)) {
    return { id: 1, username: 'admin', full_name: 'Администратор', role: 'admin', is_superuser: true, is_active: true }
  }
  if (/\/vehicles/.test(url)) return vehicles
  if (/\/organizations/.test(url)) return { total: 2, items: [{ id: 1, name: 'ООО УТТ' }, { id: 2, name: 'ООО ДНС' }] }
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

const { server, port } = await serve()
const base = `http://127.0.0.1:${port}/`
await mkdir(outDir, { recursive: true })

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 3 })
await context.addInitScript(() => {
  localStorage.setItem('auth_token', 'qa-plate-token')
  localStorage.setItem('sidebar-collapsed', 'false')
})
await context.route('**/api/**', async (route) => {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureFor(route.request().url())) })
})

const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
await page.goto(base, { waitUntil: 'networkidle' })
await page.waitForSelector('.sidebar, aside', { timeout: 20000 })

const report = {}
for (const theme of ['light', 'dark']) {
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t
    localStorage.setItem('theme', t)
  }, theme)
  const btn = page.locator('.nav-item', { hasText: 'Транспорт' }).first()
  if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => {})
  await page.waitForTimeout(900)
  await page.waitForSelector('.veh-plate', { timeout: 20000 })

  // Замеры: влезает ли текст в рамку и не режется ли он
  report[theme] = await page.evaluate(() => {
    const out = []
    for (const el of Array.from(document.querySelectorAll('.veh-plate')).slice(0, 8)) {
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      const main = el.querySelector('.veh-plate__main')
      const region = el.querySelector('.veh-plate__region')
      const flag = el.querySelector('.veh-plate__flag')
      const code = el.querySelector('.veh-plate__flag-code')
      const inside = (child) => {
        if (!child) return null
        const cr = child.getBoundingClientRect()
        return {
          overflowRight: +(cr.right - r.right).toFixed(2),
          overflowBottom: +(cr.bottom - r.bottom).toFixed(2),
          overflowTop: +(r.top - cr.top).toFixed(2),
        }
      }
      out.push({
        text: el.textContent.replace(/RUS/, ' |RUS'),
        font: cs.fontFamily.split(',')[0].replace(/"/g, ''),
        box: { w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
        mainPadLeft: main ? getComputedStyle(main).paddingLeft : null,
        scrollOverflowX: el.scrollWidth - el.clientWidth,
        scrollOverflowY: el.scrollHeight - el.clientHeight,
        main: inside(main),
        region: inside(region),
        flag: inside(flag),
        code: inside(code),
      })
    }
    return out
  })

  // Сортировка по убыванию поднимает кириллические серии — среди них
  // трёхзначные регионы, самый широкий вариант знака.
  await page.locator('th', { hasText: 'Госномер' }).first().click().catch(() => {})
  await page.waitForTimeout(500)
  const plate = page.locator('.veh-plate:not(.veh-plate--empty)').first()
  await plate.screenshot({ path: join(outDir, `plate-${theme}.png`) })
  const table = page.locator('table').first()
  await table.screenshot({ path: join(outDir, `table-${theme}.png`) }).catch(() => {})
}

report.pageErrors = errors
report.fontLoaded = await page.evaluate(() => document.fonts.check('800 13px "Roboto Condensed"'))
await writeFile(join(outDir, 'plate-report.json'), JSON.stringify(report, null, 2), 'utf-8')
console.log(JSON.stringify(report, null, 2))

await browser.close()
server.close()
