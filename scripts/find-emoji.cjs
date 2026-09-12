const fs = require('fs');
const path = require('path');
const reg = /[←-⇿⌀-⏿■-➿⬀-⯿️✓✔✗✘]|[\uD83C-\uD83E][\uDC00-\uDFFF]/g;
function walk(d, out) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name === 'node_modules') continue; walk(p, out); }
    else if (/\.(jsx?|css)$/.test(e.name)) out.push(p);
  }
  return out;
}
const files = walk('src', []);
let n = 0;
for (const f of files) {
  if (/__tests__/.test(f) || /\.test\./.test(f) || /[\\/]test[\\/]/.test(f)) continue;
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  lines.forEach((l, i) => {
    const m = l.match(reg);
    if (m) { n += m.length; console.log(f + ':' + (i + 1) + ': [' + m.join(' ') + ']  ' + l.trim().slice(0, 160)); }
  });
}
console.log('TOTAL GLYPHS: ' + n);
