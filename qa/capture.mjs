#!/usr/bin/env node
import { chromium } from 'playwright'
import { mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from './visual-diff.config.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = process.argv.includes('--baseline')
  ? join(__dirname, 'baseline')
  : join(__dirname, 'after')

const login = async (page) => {
  await page.goto(config.baseUrl)
  const loginForm = page.locator('form').first()
  if (await loginForm.isVisible({ timeout: 5000 }).catch(() => false)) {
    await page.getByLabel(/логин|username/i).fill(config.auth.username)
    await page.getByLabel(/парол|password/i).fill(config.auth.password)
    await page.getByRole('button', { name: /войти|login/i }).click()
    await page.waitForSelector('.sidebar, aside', { timeout: 10000 })
  }
}

const setTheme = async (page, theme) => {
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t
    localStorage.setItem('theme', t)
  }, theme)
  await page.waitForTimeout(200)
}

const openTab = async (page, label) => {
  const btn = page.locator('.nav-item', { hasText: label }).first()
  if (await btn.isVisible().catch(() => false)) {
    await btn.click()
    await page.waitForTimeout(config.waitAfterNavigate)
  }
}

const run = async () => {
  await rm(outDir, { recursive: true, force: true })

  const browser = await chromium.launch()
  for (const viewport of config.viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
    })
    const page = await context.newPage()
    await login(page)

    for (const theme of config.themes) {
      await setTheme(page, theme)

      for (const { tab, label } of config.pages) {
        const dir = join(outDir, tab)
        await mkdir(dir, { recursive: true })
        await openTab(page, label)
        const file = join(dir, `${theme}-${viewport.name}.png`)
        await page.screenshot({ path: file, fullPage: true })
        process.stdout.write(`✓ ${tab} ${theme} ${viewport.name}\n`)
      }
    }
    await context.close()
  }
  await browser.close()
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
