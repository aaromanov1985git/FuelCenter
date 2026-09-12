#!/usr/bin/env node
/** Зонд: что реально отрисовалось при подмене API. */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dist = join(__dirname, '..', 'dist')
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' }

const serve = () => new Promise((resolve) => {
  const s = createServer(async (req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0])
    for (const f of [join(dist, url), join(dist, 'index.html')]) {
      try {
        const b = await readFile(f)
        res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' })
        res.end(b); return
      } catch { /* next */ }
    }
    res.writeHead(404); res.end()
  })
  s.listen(0, '127.0.0.1', () => resolve({ s, port: s.address().port }))
})

const { s, port } = await serve()
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.addInitScript(() => localStorage.setItem('auth_token', 'qa-audit-token'))
const seen = []
await ctx.route('**/api/**', async (route) => {
  seen.push(route.request().method() + ' ' + route.request().url().replace(/^https?:\/\/[^/]+/, ''))
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 1, username: 'admin', role: 'admin', is_superuser: true, is_active: true, items: [], total: 0 }) })
})
const page = await ctx.newPage()
const logs = []
page.on('console', (m) => logs.push(`${m.type()}: ${m.text().slice(0, 200)}`))
page.on('pageerror', (e) => logs.push(`pageerror: ${String(e).slice(0, 300)}`))
await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
await page.screenshot({ path: join(__dirname, 'probe.png'), fullPage: true })
const info = await page.evaluate(() => ({
  title: document.title,
  rootChildren: document.getElementById('root')?.children.length ?? -1,
  hasSidebar: !!document.querySelector('.sidebar, aside'),
  hasLoginForm: !!document.querySelector('form'),
  bodyText: (document.body.innerText || '').slice(0, 500),
  classes: Array.from(document.querySelectorAll('#root > *')).map((n) => n.className).slice(0, 6),
}))
console.log('--- info ---'); console.log(JSON.stringify(info, null, 2))
console.log('--- api calls ---'); console.log(seen.slice(0, 15).join('\n'))
console.log('--- console ---'); console.log(logs.slice(0, 15).join('\n'))
await browser.close(); s.close()
