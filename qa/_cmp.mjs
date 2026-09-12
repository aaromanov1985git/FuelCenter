import { readdir, readFile } from 'node:fs/promises'
const A = 'C:/Users/aaromanov/AppData/Local/Temp/gsm-base/qa/report/data'
const B = 'C:/curWork/GSM/.claude/worktrees/migrate-10-35-1-55/qa/report/data'
const load = async (dir) => {
  const out = {}
  for (const f of await readdir(dir)) {
    if (!f.endsWith('.json')) continue
    out[f.replace('.json', '')] = JSON.parse(await readFile(dir + '/' + f, 'utf8'))
  }
  return out
}
const before = await load(A)
const after = await load(B)
const keys = Object.keys(after).sort()
const mode = process.argv[2] || 'info'
if (mode === 'info') {
  console.log('slice\tH1b\tH1a\tsh%b\tsh%a\tH2b\tH2a\tupB\tupA\tB1b\tB1a\tB4b\tB4a\tC1b\tC1a')
  for (const k of keys) {
    const b = before[k], a = after[k]
    if (!b) { console.log(k + '\tMISSING BASE'); continue }
    const g = (d, r, fn, dflt = '-') => { const x = (d.findings[r] || [])[0]; return x ? fn(x) : dflt }
    console.log([k,
      g(b, 'H1', x => x.chromeHeightAboveData), g(a, 'H1', x => x.chromeHeightAboveData),
      g(b, 'H1', x => x.sharePercent), g(a, 'H1', x => x.sharePercent),
      g(b, 'H2', x => x.firstRowTop), g(a, 'H2', x => x.firstRowTop),
      g(b, 'G8', x => x.uppercaseNodes), g(a, 'G8', x => x.uppercaseNodes),
      (b.counts.B1 || 0), (a.counts.B1 || 0),
      (b.counts.B4 || 0), (a.counts.B4 || 0),
      (b.counts.C1 || 0), (a.counts.C1 || 0),
    ].join('\t'))
  }
}
if (mode === 'rule') {
  const rule = process.argv[3]
  console.log('slice\tbefore\tafter\tdelta')
  let tb = 0, ta = 0
  for (const k of keys) {
    const nb = (before[k]?.counts[rule] || 0), na = (after[k]?.counts[rule] || 0)
    tb += nb; ta += na
    if (nb !== na) console.log([k, nb, na, na - nb].join('\t'))
  }
  console.log('TOTAL\t' + tb + '\t' + ta + '\t' + (ta - tb))
}
if (mode === 'dump') {
  const rule = process.argv[3], which = process.argv[4] === 'before' ? before : after
  const acc = {}
  for (const k of keys) for (const it of (which[k]?.findings[rule] || [])) {
    const s = JSON.stringify(it)
    acc[s] = acc[s] || { n: 0, sl: new Set() }
    acc[s].n++
    acc[s].sl.add(k)
  }
  Object.entries(acc).sort((x, y) => y[1].n - x[1].n).forEach(([s, v]) =>
    console.log(v.n + '\t' + [...new Set([...v.sl].map(z => z.replace(/-(dark|light)-\d+$/, '')))].join(',') + '\t' + s))
}
if (mode === 'diffsig') {
  const rule = process.argv[3]
  const sig = (which) => {
    const acc = {}
    for (const k of keys) for (const it of (which[k]?.findings[rule] || [])) {
      const s = JSON.stringify(it)
      acc[s] = (acc[s] || 0) + 1
    }
    return acc
  }
  const sb = sig(before), sa = sig(after)
  const all = new Set([...Object.keys(sb), ...Object.keys(sa)])
  const rows = [...all].map(s => ({ s, b: sb[s] || 0, a: sa[s] || 0 })).filter(r => r.a !== r.b)
  rows.sort((x, y) => (y.a - y.b) - (x.a - x.b))
  for (const r of rows) console.log(`${r.b}\t->\t${r.a}\t(${r.a - r.b >= 0 ? '+' : ''}${r.a - r.b})\t${r.s}`)
}
