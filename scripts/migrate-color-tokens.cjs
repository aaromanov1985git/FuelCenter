/* One-shot migration: --color-* aliases -> new tokens (tokens.css).
 * Mapping mirrors the "BACKWARD COMPATIBILITY ALIASES" block in src/styles/tokens.css.
 * Run: node scripts/migrate-color-tokens.cjs
 */
const fs = require('fs');
const path = require('path');

const MAP = {
  '--color-primary-hover': '--accent',
  '--color-primary-light': '--accent-soft',
  '--color-primary': '--accent',
  '--color-bg-primary': '--bg',
  '--color-bg-secondary': '--surface-2',
  '--color-bg-card': '--surface',
  '--color-bg-input': '--surface-2',
  '--color-bg-hover': '--surface-2',
  '--color-bg': '--bg',
  '--color-text-primary': '--text-1',
  '--color-text-secondary': '--text-2',
  '--color-text-tertiary': '--text-3',
  '--color-border-light': '--border-strong',
  '--color-border': '--border',
  '--color-success-light': '--green-soft',
  '--color-success-dark': '--green',
  '--color-success': '--green',
  '--color-warning-light': '--amber-soft',
  '--color-warning-dark': '--amber',
  '--color-warning': '--amber',
  '--color-error-light': '--red-soft',
  '--color-error-dark': '--red',
  '--color-error': '--red',
  '--color-info-light': '--cyan-soft',
  '--color-info': '--cyan',
};

// Order matters: longer/prefixed keys first so '--color-primary-light' replaces before '--color-primary'.
const KEYS = Object.keys(MAP).sort((a, b) => b.length - a.length);

const ROOTS = ['src'];
const EXTS = new Set(['.css', '.jsx', '.js']);
const SKIP_FILES = new Set([
  path.normalize('src/styles/tokens.css'), // backward-compat block defines aliases; handled separately
]);

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
    const rel = path.normalize(file);
    if (SKIP_FILES.has(rel)) continue;
    const src = fs.readFileSync(file, 'utf8');
    let out = src;
    let fileCount = 0;
    for (const k of KEYS) {
      // Replace only full token names, not substrings (e.g. don't touch --color-bg-card-rgb).
      // Match key followed by a non-identifier char (end or [^a-zA-Z0-9_-]).
      const pattern = new RegExp(k.replace(/[-]/g, '\\-') + '(?![a-zA-Z0-9_-])', 'g');
      const replaced = out.replace(pattern, (m) => { fileCount++; return MAP[k]; });
      out = replaced;
    }
    if (fileCount > 0 && out !== src) {
      fs.writeFileSync(file, out);
      filesChanged++;
      totalReplacements += fileCount;
      report.push(`${rel}: ${fileCount}`);
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
console.log('---');
for (const line of report) console.log(line);
