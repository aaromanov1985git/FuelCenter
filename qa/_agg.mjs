import { readdir, readFile } from 'node:fs/promises'
const dir = new URL('./report/data/', import.meta.url)
const files = (await readdir(dir)).filter(f => f.endsWith('.json'))
const acc = {}
const codes = process.argv[2] ? process.argv[2].split(',') : ['G2', 'G4', 'G7', 'G10', 'G8']
for (const f of files) {
  const j = JSON.parse(await readFile(new URL(f, dir), 'utf8'))
  const key = f.replace('.json', '')
  for (const code of codes) {
    const items = j.findings[code] || []
    for (const it of items) {
      let sig
      if (code === 'G2') sig = it.sel + ' || ' + it.gradient
      else if (code === 'G4') sig = it.sel
      else if (code === 'G7') sig = it.sel + ' || ' + (it.align || '') + (it.textShadow || '')
      else if (code === 'G10') sig = it.sel + ' || ' + it.transition
      else sig = JSON.stringify(it)
      const k = code + ' :: ' + sig
      acc[k] = acc[k] || { count: 0, slices: new Set() }
      acc[k].count++
      acc[k].slices.add(key)
    }
  }
}
const rows = Object.entries(acc).map(([k, v]) => ({
  k, n: v.count, slices: v.slices.size,
  pages: [...new Set([...v.slices].map((s) => s.replace(/-(dark|light)-\d+$/, '')))],
}))
rows.sort((a, b) => a.k.split(' :: ')[0].localeCompare(b.k.split(' :: ')[0]) || b.n - a.n)
for (const r of rows) console.log(`${r.n}\t${r.slices}sl\t${r.pages.length}pg[${r.pages.slice(0, 6).join(',')}]\t${r.k}`)
console.log('distinct signatures: ' + rows.length)
