#!/usr/bin/env node
import { readdir, mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'
import { config } from './visual-diff.config.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const baselineDir = join(__dirname, 'baseline')
const afterDir = join(__dirname, 'after')
const diffsDir = join(__dirname, 'diffs')

const walk = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) files.push(...(await walk(full)))
    else if (e.name.endsWith('.png')) files.push(full)
  }
  return files
}

const loadPng = async (path) => PNG.sync.read(await readFile(path))

const run = async () => {
  if (!existsSync(baselineDir) || !existsSync(afterDir)) {
    console.error('Missing baseline/ or after/ directory. Run: node qa/capture.mjs --baseline (or without --baseline)')
    process.exit(1)
  }

  const afterFiles = await walk(afterDir)
  const report = []
  let failed = 0

  for (const afterPath of afterFiles) {
    const rel = relative(afterDir, afterPath)
    const baselinePath = join(baselineDir, rel)
    if (!existsSync(baselinePath)) {
      report.push({ page: rel, status: 'MISSING_BASELINE', diffRatio: null })
      continue
    }

    const before = await loadPng(baselinePath)
    const after = await loadPng(afterPath)
    if (before.width !== after.width || before.height !== after.height) {
      report.push({ page: rel, status: 'SIZE_MISMATCH', diffRatio: null })
      failed++
      continue
    }

    const diff = new PNG({ width: before.width, height: before.height })
    const mismatched = pixelmatch(
      before.data, after.data, diff.data,
      before.width, before.height,
      { threshold: config.diffThreshold }
    )
    const total = before.width * before.height
    const ratio = mismatched / total

    if (ratio > 0) {
      const diffPath = join(diffsDir, rel)
      await mkdir(dirname(diffPath), { recursive: true })
      await writeFile(diffPath, PNG.sync.write(diff))
    }
    const status = ratio > 0.01 ? 'DIFF' : 'OK'
    if (status === 'DIFF') failed++
    report.push({ page: rel, status, diffRatio: ratio })
  }

  console.log('\nVisual diff report:')
  console.log('-'.repeat(70))
  for (const r of report) {
    const pct = r.diffRatio == null ? '—' : `${(r.diffRatio * 100).toFixed(3)}%`
    console.log(`[${r.status.padEnd(16)}] ${pct.padStart(8)}  ${r.page}`)
  }
  console.log('-'.repeat(70))
  console.log(`${report.length} total, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
