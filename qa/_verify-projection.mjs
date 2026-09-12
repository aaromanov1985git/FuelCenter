// Проекция результата правок по формулам самого харнеса (qa/audit.mjs):
//   loud fill/text: S > 45 && 25 < L < 70   (I1/I2/I3)
//   G5 «цветная рельса»: width <= 8 && height >= 12 && S > 25 у backgroundColor
const hex=h=>{h=h.replace('#','');return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16));};
const hsl=h=>{const [R,G,B]=hex(h);const mx=Math.max(R,G,B),mn=Math.min(R,G,B);
  const L=(mx+mn)/2/255*100; const S=mx===mn?0:(mx-mn)/(mx+mn>255?510-mx-mn:mx+mn)*100;
  let H=0; if(mx!==mn){ if(mx===R)H=60*(((G-B)/(mx-mn))%6); else if(mx===G)H=60*((B-R)/(mx-mn)+2); else H=60*((R-G)/(mx-mn)+4);} if(H<0)H+=360;
  return {H:Math.round(H),S:Math.round(S*10)/10,L:Math.round(L*10)/10};};
const loud=x=>x.S>45&&x.L>25&&x.L<70;
const bucket=x=>Math.round(x.H/30)*30;

console.log('=== G5: может ли рельса ещё считаться «цветной» (S > 25)? ===');
for(const [n,v] of [['light --border-strong','#d1d9e0'],['dark --border-strong','#2a3243'],
                    ['был light --text-1','#0f1724'],['был light --text-3','#646f85'],
                    ['был light --amber','#f59e0b'],['был dark --amber','#ffb547']]){
  const x=hsl(v);
  console.log(n.padEnd(22), v, 'S'+x.S, 'L'+x.L, x.S>25 ? '-> G5 СЧИТАЕТ цветной' : '-> G5 не считает');
}

console.log('\n=== I2/I3: что остаётся «громким» после правок ===');
const rows=[
 ['--text-1 light (новые KPI-числа)','#0f1724'],
 ['--text-1 dark  (новые KPI-числа)','#e6e9ef'],
 ['--border-strong light (рельса)','#d1d9e0'],
 ['--border-strong dark  (рельса)','#2a3243'],
 ['--green-ink light (бейдж)','#047857'],
 ['--amber-ink light (бейдж)','#a1520a'],
 ['--red-ink   light (бейдж)','#c81e1e'],
 ['--cyan-ink  light (бейдж)','#0f6f8c'],
 ['--accent light (заливка nav)','#5b46e5'],
 ['--accent-solid light','#5b46e5'],
 ['--accent-solid dark','#6a4aee'],
];
for(const [n,v] of rows){ const x=hsl(v); console.log(n.padEnd(34), v, 'H'+String(x.H).padStart(3),'S'+String(x.S).padStart(5),'L'+String(x.L).padStart(5), loud(x)?('ГРОМКИЙ, hue '+bucket(x)):'тихий'); }

console.log('\n=== I3 по страницам: оттенки, остающиеся на первом экране ===');
// источники после правок, по данным прогона (какие цветные узлы реально в кадре)
const pages={
 'vehicles-light':      [['42 бейджа «Требует проверки» .veh-status--amber','#a1520a'],['заливка span.nav-item-count','#5b46e5']],
 'upload-events-light': [['заливка span.nav-item-count','#5b46e5']],
 'cards-light':         [['240 чипов .fc-chip-green','#047857'],['заливка span.nav-item-count','#5b46e5']],
 'fuel-types-light':    [['бейджи .status-badge pending','#a1520a'],['заливка span.nav-item-count','#5b46e5']],
 'gas-stations-light':  [['12 бейджей pending','#a1520a'],['заливка span.nav-item-count','#5b46e5']],
 'organizations-light': [['заливка span.nav-item-count','#5b46e5']],
 'users-light':         [['бейджи active/pending','#a1520a'],['заливка span.nav-item-count','#5b46e5']],
 'dashboard-light':     [['.dash-chip-amber','#a1520a'],['.dash-chip-cyan','#0f6f8c'],['SERIES_COLORS #4fd1ff (Dashboard.jsx, ВНЕ участка)','#4fd1ff'],['заливка span.nav-item-count','#5b46e5']],
};
for(const [p,srcs] of Object.entries(pages)){
  const hs=new Set(); const kept=[];
  for(const [why,v] of srcs){ const x=hsl(v); if(loud(x)){ hs.add(bucket(x)); kept.push(bucket(x)+' <- '+why); } }
  const n=hs.size;
  console.log(p.padEnd(22), 'I3 =', n, n>3?'*** ВСЁ ЕЩЁ СРАБОТАЕТ ***':'ok (порог: срабатывает при >3)');
  for(const k of kept) console.log('   ', k);
}
