/**
 * Точечный прогон страницы АЗС: снимки и замеры читаемости таблицы.
 *
 * Приём тот же, что в qa/audit.mjs: свой статический сервер над dist/, подмена
 * /api/** фикстурами, вход подделан токеном в localStorage. Прод не участвует.
 *
 * Фикстура намеренно повторяет форму боевых данных: длинные наименования с
 * юрлицом и ИНН, у единиц — развёрнутый адрес на всю строку, у большинства
 * регион, населённый пункт и координаты пустые. На ровных выдуманных строках
 * («АЗС 1», «АЗС 2») эта страница выглядит прилично и дефект не виден.
 *
 * Запуск: node qa/_azs-shot.mjs <корень репозитория> <куда класть> [метка]
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { join, extname } from 'node:path'

const root = process.argv[2]
const outDir = process.argv[3]
const label = process.argv[4] || 'azs'
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

const PROVIDERS = [
  { id: 1, name: 'ППР УТТ' },
  { id: 2, name: 'ЭЛЛИА' },
  { id: 3, name: 'РП-газпром' },
]

// Строки-образцы сняты с боевого экрана: длинные юрлица, редкие развёрнутые
// адреса, пустые регион/пункт/координаты, единичные ошибки валидации.
const SAMPLES = [
  {
    original_name: 'Сибирь Нефть Сервис ООО (ХМАО)', provider_id: 1, azs_number: 'Сибирь Нефть Сервис ООО (ХМАО)',
    location: 'Р404, 750км, ХМАО, Нефтеюганский район, п. Сингапай, ул. Энтузиастов, строение 1, АЗС №2, Сингапай',
    is_validated: 'valid',
  },
  {
    original_name: 'ТАИФ-НК АЗС ООО ИНН 1639028805', provider_id: 1, azs_number: '1639028805',
    location: 'Респ. Татарстан, м.р-н Алексеевский, п.г.т Алексеевское , ул. Чистопольская, 1И, АЗС №419, Алексеевское',
    is_validated: 'valid',
  },
  {
    original_name: 'Доркомплект ООО ИНН 8603110135', provider_id: 1, azs_number: '8603110135',
    location: 'АЗС 40 (посёлок Пионерный), Томская обл., Каргасокский р-н, Пионерный',
    is_validated: 'pending',
  },
  { original_name: 'АЗС Коммунистический', provider_id: 2, azs_number: 'АЗС Коммунистический', is_validated: 'valid' },
  { original_name: 'Нефтебаза, завоз', provider_id: 2, azs_number: 'Нефтебаза, завоз', is_validated: 'pending' },
  { original_name: 'АЗС Ленинградская', provider_id: 2, azs_number: 'АЗС Ленинградская', is_validated: 'valid' },
  { original_name: 'АЗС Сергино', provider_id: 2, azs_number: 'АЗС Сергино', is_validated: 'valid' },
  { original_name: 'АЗС Ем-Ёга', provider_id: 2, azs_number: 'АЗС Ем-Ёга', is_validated: 'valid' },
  { original_name: 'АЗС Городская', provider_id: 2, azs_number: 'АЗС Городская', is_validated: 'valid' },
  { original_name: 'АЗС Талинка', provider_id: 2, azs_number: 'АЗС Талинка', is_validated: 'pending' },
  { original_name: 'АЗС 37 км', provider_id: 2, azs_number: '37', is_validated: 'valid' },
  { original_name: 'АЗС ДНС-4', provider_id: 2, azs_number: '4', is_validated: 'valid' },
  { original_name: 'АЗС Каменное', provider_id: 2, azs_number: 'АЗС Каменное', is_validated: 'valid' },
  { original_name: 'АЗС Южная', provider_id: 2, azs_number: 'АЗС Южная', is_validated: 'valid' },
  {
    original_name: 'контроллер КАЗС08 Аи-92 (сломан)', provider_id: 3, azs_number: '08', is_validated: 'invalid',
    validation_errors: 'Не удалось определить населённый пункт по наименованию; координаты отсутствуют',
  },
  { original_name: 'контроллер КАЗС05', provider_id: 3, azs_number: '05', is_validated: 'pending' },
  {
    original_name: 'АЗС №12 Сургутнефтегаз', provider_id: 1, azs_number: '12',
    location: 'ХМАО-Югра, г. Сургут, ул. Промышленная, 15', region: 'ХМАО-Югра', settlement: 'Сургут',
    latitude: 61.254, longitude: 73.396, is_validated: 'valid',
  },
]

const stations = Array.from({ length: 50 }, (_, i) => {
  const s = SAMPLES[i % SAMPLES.length]
  return {
    id: i + 1,
    name: s.name || s.original_name,
    region: null,
    settlement: null,
    latitude: null,
    longitude: null,
    validation_errors: '',
    ...s,
    // Номера делаем различимыми, чтобы строки не сливались
    original_name: i < SAMPLES.length ? s.original_name : `${s.original_name} #${i}`,
  }
})

const fixtureFor = (url) => {
  if (/\/auth\/me/.test(url)) {
    return { id: 1, username: 'admin', full_name: 'Администратор', role: 'admin', is_superuser: true, is_active: true }
  }
  if (/\/gas-stations\/stats|\/gas-stations\/statistics/.test(url)) {
    return { total: 103, valid: 75, pending: 26, invalid: 2 }
  }
  if (/\/gas-stations/.test(url)) return { total: 103, items: stations }
  if (/\/providers/.test(url)) {
    return { total: PROVIDERS.length, items: PROVIDERS.map((p) => ({ ...p, code: p.name, is_active: true })) }
  }
  if (/\/dashboard\/errors-warnings/.test(url)) return { total: 2, items: [] }
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

// Замеры читаемости: вылезает ли таблица за свою область, какие колонки
// пустые, сколько места съедает каждая, режется ли текст без многоточия.
const MEASURE = () => {
  const table = document.querySelector('table')
  if (!table) return { error: 'таблица не найдена' }
  const scroller = table.closest('[class*="scroll"], [style*="overflow"]') || table.parentElement
  const heads = Array.from(table.querySelectorAll('thead th'))
  const rows = Array.from(table.querySelectorAll('tbody tr'))

  const columns = heads.map((th, i) => {
    const cells = rows.map((r) => r.children[i]).filter(Boolean)
    const texts = cells.map((c) => (c.textContent || '').trim())
    const empty = texts.filter((t) => t === '-' || t === '—' || t === '').length
    const headText = (th.textContent || '').trim()
    const headClipped = th.scrollWidth - th.clientWidth > 1
    const clippedCells = cells.filter((c) => c.scrollWidth - c.clientWidth > 1).length
    return {
      header: headText,
      width: Math.round(th.getBoundingClientRect().width),
      emptyShare: cells.length ? +(empty / cells.length).toFixed(2) : null,
      headerClipped: headClipped,
      clippedCells,
      longestText: texts.reduce((a, b) => (b.length > a.length ? b : a), ''),
    }
  })

  return {
    tableWidth: Math.round(table.getBoundingClientRect().width),
    scrollerWidth: scroller ? Math.round(scroller.clientWidth) : null,
    horizontalOverflow: scroller ? scroller.scrollWidth - scroller.clientWidth : null,
    rowCount: rows.length,
    rowHeights: [...new Set(rows.map((r) => Math.round(r.getBoundingClientRect().height)))].sort((a, b) => a - b),
    columns,
  }
}

const { server, port } = await serve()
const base = `http://127.0.0.1:${port}/`
await mkdir(outDir, { recursive: true })

const browser = await chromium.launch()
const report = {}

for (const vp of [{ name: '1440', width: 1440, height: 950 }, { name: '1280', width: 1280, height: 900 }]) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2 })
  await context.addInitScript(() => {
    localStorage.setItem('auth_token', 'qa-azs-token')
    localStorage.setItem('sidebar-collapsed', 'false')
    // Настройки колонок из прошлых запусков не должны влиять на замер
    localStorage.removeItem('gasStationsColumnSettings')
    localStorage.setItem('gasStationsView', 'list')  // 'list' — это табличный вид, 'cards' — плитки
  })
  await context.route('**/api/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureFor(route.request().url())) })
  })

  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.waitForSelector('.sidebar, aside', { timeout: 20000 })

  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t
      localStorage.setItem('theme', t)
    }, theme)
    const btn = page.locator('.nav-item', { hasText: 'АЗС' }).first()
    if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => {})
    await page.waitForTimeout(1000)
    await page.waitForSelector('table', { timeout: 20000 }).catch(() => {})

    report[`${vp.name}-${theme}`] = await page.evaluate(MEASURE)
    await page.screenshot({ path: join(outDir, `${label}-${vp.name}-${theme}.png`) })

    // Скрытые по умолчанию колонки обязаны возвращаться через «Настроить поля»
    if (vp.name === '1440' && theme === 'light') {
      const before = report[`${vp.name}-${theme}`].columns.length
      await page.locator('button', { hasText: 'Настроить поля' }).first().click()
      await page.waitForTimeout(400)
      const listed = await page.locator('.column-settings-item-label').count()
      await page.screenshot({ path: join(outDir, `${label}-column-settings.png`) })
      // Включаем «Ошибки» — она скрыта по умолчанию
      const errorsRow = page.locator('li', { hasText: 'Ошибки' }).first()
      await errorsRow.locator('input[type="checkbox"]').click().catch(() => {})
      await page.locator('button', { hasText: 'Применить' }).first().click().catch(() => {})
      await page.waitForTimeout(500)
      const after = (await page.evaluate(MEASURE)).columns.length
      report.columnSettings = { пунктовВСписке: listed, колонокДо: before, колонокПосле: after }
    }
  }
  report[`${vp.name}-errors`] = errors
  await context.close()
}

await writeFile(join(outDir, `${label}-report.json`), JSON.stringify(report, null, 2), 'utf-8')

// Короткая сводка в консоль — по ней и принимаются решения
for (const [key, r] of Object.entries(report)) {
  if (!r || !r.columns) continue
  console.log(`\n== ${key} ==`)
  console.log(`  таблица ${r.tableWidth}px в области ${r.scrollerWidth}px, вылет вправо ${r.horizontalOverflow}px`)
  console.log(`  высоты строк: ${r.rowHeights.join(', ')}`)
  for (const c of r.columns) {
    const flags = [
      c.headerClipped ? 'ЗАГОЛОВОК РЕЖЕТСЯ' : '',
      c.clippedCells ? `ячеек режется: ${c.clippedCells}` : '',
      c.emptyShare >= 0.9 ? `пустых ${Math.round(c.emptyShare * 100)}%` : '',
    ].filter(Boolean).join('; ')
    console.log(`  ${String(c.width).padStart(4)}px  ${c.header.padEnd(24)} ${flags}`)
  }
}

await browser.close()
server.close()
