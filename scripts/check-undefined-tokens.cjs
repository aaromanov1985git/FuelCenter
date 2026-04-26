/* Sanity check: find var(--x) references in src whose --x is not defined anywhere.
 * Ignores well-known external tokens (leaflet, etc.) via DENYLIST_PREFIXES.
 */
const fs = require('fs');
const path = require('path');

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

const defined = new Set();
const used = new Map(); // var name -> [file:line]

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const src = fs.readFileSync(file, 'utf8');
    // definitions
    for (const m of src.matchAll(/(?:^|\s|\{|;)(--[a-zA-Z0-9_-]+)\s*:/g)) {
      defined.add(m[1]);
    }
    // uses
    const lines = src.split('\n');
    lines.forEach((line, i) => {
      for (const m of line.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)(?:\s*,[^)]*)?\s*\)/g)) {
        const name = m[1];
        if (!used.has(name)) used.set(name, []);
        used.get(name).push(`${file}:${i + 1}`);
      }
    });
  }
}

const undefinedVars = new Set();
for (const name of used.keys()) {
  if (!defined.has(name)) undefinedVars.add(name);
}

const sorted = [...undefinedVars].sort();
console.log(`Defined vars: ${defined.size}`);
console.log(`Used vars: ${used.size}`);
console.log(`Undefined vars: ${sorted.length}`);
for (const name of sorted) {
  const usages = used.get(name);
  console.log(`  ${name}  (${usages.length} uses) e.g. ${usages[0]}`);
}
