/* Pass 2: map straggler --color-* aliases not in tokens.css backward-compat block.
 * Keeps --color-fuel-* and --color-chart-* untouched (domain tokens, not aliases).
 */
const fs = require('fs');
const path = require('path');

const MAP = {
  '--color-text-on-primary': '#fff',
  '--color-primary-dark': '--accent',
  '--color-info-dark': '--cyan',
  '--color-danger': '--red',
  '--color-text': '--text-1',
};

const KEYS = Object.keys(MAP).sort((a, b) => b.length - a.length);

const ROOTS = ['src'];
const EXTS = new Set(['.css', '.jsx', '.js']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (EXTS.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

let filesChanged = 0;
let totalReplacements = 0;
const report = [];

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const src = fs.readFileSync(file, 'utf8');
    let out = src;
    let fileCount = 0;
    for (const k of KEYS) {
      const pattern = new RegExp(k.replace(/[-]/g, '\\-') + '(?![a-zA-Z0-9_-])', 'g');
      const val = MAP[k];
      // If value is a custom-property name, wrap as var(--x); if literal color (#fff), replace var(--old) -> value.
      if (val.startsWith('--')) {
        out = out.replace(pattern, (m) => { fileCount++; return val; });
      } else {
        // Replace "var(--color-text-on-primary)" -> "#fff" to avoid leaving orphan var().
        const varPattern = new RegExp('var\\(\\s*' + k.replace(/[-]/g, '\\-') + '\\s*\\)', 'g');
        out = out.replace(varPattern, (m) => { fileCount++; return val; });
      }
    }
    if (fileCount > 0 && out !== src) {
      fs.writeFileSync(file, out);
      filesChanged++;
      totalReplacements += fileCount;
      report.push(`${path.normalize(file)}: ${fileCount}`);
    }
  }
}

report.sort((a, b) => {
  const na = parseInt(a.split(': ').pop(), 10);
  const nb = parseInt(b.split(': ').pop(), 10);
  return nb - na;
});

console.log(`Files changed: ${filesChanged}`);
console.log(`Total replacements: ${totalReplacements}`);
for (const line of report) console.log(line);
