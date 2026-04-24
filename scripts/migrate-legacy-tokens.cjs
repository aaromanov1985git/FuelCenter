/* Pass 3 migration — remaining legacy token refs discovered by check-undefined-tokens.cjs.
 * Maps to canonical design-system tokens from src/styles/tokens.css.
 */
const fs = require('fs');
const path = require('path');

const ROOTS = ['src'];
const EXTS = new Set(['.css', '.jsx', '.js']);
const SKIP = new Set([path.normalize('src/styles/tokens.css')]);

// Map: old --var → either "--new-var" (reference) or { literal: "value" } (inline).
const MAP = {
  '--bg-color':        '--bg',
  '--bg-primary':      '--bg',
  '--bg-secondary':    '--surface-2',
  '--bg-tertiary':     '--surface-2',
  '--border-color':    '--border',
  '--border-radius':   '--radius-medium',
  '--card-background': '--surface',
  '--card-bg':         '--surface',
  '--error-color':     '--red',
  '--font-size-md':    { literal: '14px' },
  '--padding-block':   { literal: '8px' },
  '--padding-input':   { literal: '10px 12px' },
  '--primary-active':  '--accent',
  '--primary-color':   '--accent',
  '--primary-hover':   '--accent',
  '--radius-full':     { literal: '9999px' },
  '--radius-input':    '--radius-small',
  '--radius-lg':       '--radius-large',
  '--radius-md':       '--radius-medium',
  '--radius-sm':       '--radius-small',
  '--spacing-xs':      '--spacing-tiny',
  '--success-dark':    '--green',
  '--success-light':   '--green-soft',
  '--text-color':      '--text-1',
  '--text-primary':    '--text-1',
  '--text-secondary':  '--text-2',
};

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (EXTS.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

const keys = Object.keys(MAP).sort((a, b) => b.length - a.length);

let totalReplacements = 0;
const filesChanged = new Set();

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const rel = path.relative('.', file);
    if (SKIP.has(path.normalize(rel))) continue;

    const src = fs.readFileSync(file, 'utf8');
    let out = src;
    let fileCount = 0;

    for (const oldVar of keys) {
      const target = MAP[oldVar];
      // Match var(--old-var) with optional fallback, not touching names that start with this prefix
      const varPattern = new RegExp(
        `var\\(\\s*${oldVar.replace(/[-]/g, '\\-')}(?![a-zA-Z0-9_-])\\s*(?:,\\s*[^)]*)?\\s*\\)`,
        'g'
      );

      out = out.replace(varPattern, (m) => {
        fileCount++;
        return typeof target === 'string' ? `var(${target})` : target.literal;
      });
    }

    if (fileCount > 0) {
      fs.writeFileSync(file, out, 'utf8');
      filesChanged.add(rel);
      totalReplacements += fileCount;
      console.log(`  ${rel}: ${fileCount}`);
    }
  }
}

console.log(`\nFiles changed: ${filesChanged.size}`);
console.log(`Total replacements: ${totalReplacements}`);
