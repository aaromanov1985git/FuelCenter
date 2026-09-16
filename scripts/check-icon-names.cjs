/* Проверка: каждое имя, переданное в <Icon name="..." />, есть в ICON_PATHS.
   Неизвестное имя рисует пустоту, а предупреждение печатается только в DEV,
   поэтому опечатка в проде видна как отсутствующий значок. */
const fs = require('fs');
const path = require('path');

const iconSrc = fs.readFileSync('src/components/ui/Icon/Icon.jsx', 'utf8');
const body = iconSrc.slice(iconSrc.indexOf('export const ICON_PATHS'), iconSrc.indexOf('export const ICON_NAMES'));
const names = new Set();
for (const m of body.matchAll(/^\s{2}'?([a-z][a-z-]*)'?:/gm)) names.add(m[1]);

function walk(d, out) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name === 'node_modules') continue; walk(p, out); }
    // Тесты пропускаем: они намеренно передают несуществующее имя, чтобы проверить
    // поведение примитива на неизвестном глифе. Сторож следит за интерфейсом, не за ними.
    else if (/\.jsx?$/.test(e.name) && !/\.test\.jsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

let bad = 0;
for (const f of walk('src', [])) {
  const text = fs.readFileSync(f, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((l, i) => {
    for (const m of l.matchAll(/<Icon\s+name=["']([^"']+)["']/g)) {
      if (!names.has(m[1])) { bad++; console.log(`НЕТ ИМЕНИ "${m[1]}"  ${f}:${i + 1}`); }
    }
  });
}
// Строковые имена в конфигурациях (statusConfig, sectionTabs, clearOptions и т.п.)
for (const f of walk('src', [])) {
  const text = fs.readFileSync(f, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((l, i) => {
    const m = l.match(/\bicon:\s*'([a-z][a-z-]*)'/);
    if (m && !names.has(m[1])) { bad++; console.log(`НЕТ ИМЕНИ (config) "${m[1]}"  ${f}:${i + 1}`); }
  });
}
console.log('Известных имён: ' + names.size + '. Неизвестных ссылок: ' + bad);
