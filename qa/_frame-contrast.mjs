/* Проверка контраста для правок роли «каркас» (участок: App.css, index.css,
 * TransactionTable.*, ui/Table/*, ui/Card/*, AppSidebar.css, Breadcrumbs.css,
 * AdvancedSearch.css). Значения токенов — из src/styles/tokens.css.
 * Запуск: node qa/_frame-contrast.mjs
 */
const hex = (h) => {
  const s = h.replace('#', '');
  const n = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
};
const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const L = (h) => { const [r, g, b] = hex(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const r2 = (a, b) => ratio(a, b).toFixed(2);

const dark = {
  surface: '#11151e', surface2: '#1a1f2b', bg: '#0a0d14', sidebar: '#0d1119',
  text1: '#e6e9ef', text3: '#808a9e', accent: '#7c5cff', accentText: '#9077ff',
  accentSolid: '#6a4aee', inkOnAccent: '#ffffff', border: '#1f2633', borderStrong: '#2a3243',
};
const light = {
  surface: '#ffffff', surface2: '#f4f6f9', bg: '#f4f6f9', sidebar: '#ffffff',
  text1: '#0f1724', text3: '#646f85', accent: '#5b46e5', accentText: '#5b46e5',
  accentSolid: '#5b46e5', inkOnAccent: '#ffffff', border: '#e8ecf0', borderStrong: '#d1d9e0',
};

for (const [name, t] of [['DARK', dark], ['LIGHT', light]]) {
  console.log(`\n== ${name} ==`);
  console.log(`ID-колонка (12px, порог 4.5): --accent на surface-2 = ${r2(t.accent, t.surface2)} -> --accent-text = ${r2(t.accentText, t.surface2)}`);
  console.log(`Шапка колонок (12px/600, порог 4.5): --text-3 на surface-2 = ${r2(t.text3, t.surface2)} (было --text-1 = ${r2(t.text1, t.surface2)})`);
  console.log(`Логотип ГСМ и счётчик (11.5px, порог 4.5): --sidebar на --accent = ${r2(t.sidebar, t.accent)} -> --ink-on-accent на --accent-solid = ${r2(t.inkOnAccent, t.accentSolid)}`);
  console.log(`Кнопка пагинации :hover (порог 4.5): #fff на --accent = ${r2('#ffffff', t.accent)} -> --ink-on-accent на --accent-solid = ${r2(t.inkOnAccent, t.accentSolid)}`);
  console.log(`Линии (нетекст, справочно): --border на surface = ${r2(t.border, t.surface)}, --border-strong на surface = ${r2(t.borderStrong, t.surface)}, --border-strong на surface-2 = ${r2(t.borderStrong, t.surface2)}`);
}
