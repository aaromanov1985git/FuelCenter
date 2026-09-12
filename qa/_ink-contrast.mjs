const hex=h=>{h=h.replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16));};
const lin=c=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);};
const L=rgb=>0.2126*lin(rgb[0])+0.7152*lin(rgb[1])+0.0722*lin(rgb[2]);
const ratio=(a,b)=>{const l1=L(a),l2=L(b);return ((Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05));};
const over=(fg,a,bg)=>fg.map((c,i)=>Math.round(a*c+(1-a)*bg[i]));
const r=(a,b)=>Math.round(ratio(hex(a),typeof b==='string'?hex(b):b)*100)/100;
const rr=(a,b)=>Math.round(ratio(hex(a),b)*100)/100;
const soft=(base,alpha,bg)=>over(hex(base),alpha,hex(bg));

const W='#ffffff', G='#f4f6f9';
const cases=[
 ['green', '#047857', '#10b981', .1],
 ['amber', '#a1520a', '#f59e0b', .1],
 ['red',   '#c81e1e', '#ef4444', .1],
 ['cyan',  '#0f6f8c', '#06b6d4', .1],
];
console.log('=== LIGHT: proposed --*-ink on 4 backgrounds (need 4.5) ===');
for(const [n,ink,base,a] of cases){
  const sW=soft(base,a,W), sG=soft(base,a,G);
  console.log(n.padEnd(6), ink,
    '| white', r(ink,W).toFixed(2),
    '| #f4f6f9', r(ink,G).toFixed(2),
    '| soft/white rgb('+sW+') ', rr(ink,sW).toFixed(2),
    '| soft/bg rgb('+sG+') ', rr(ink,sG).toFixed(2));
}
console.log('\n=== LIGHT: CURRENT token as text (today) ===');
for(const [n,ink,base,a] of cases){
  const sW=soft(base,a,W), sG=soft(base,a,G);
  console.log(n.padEnd(6), base, '| white', r(base,W).toFixed(2), '| #f4f6f9', r(base,G).toFixed(2),
    '| soft/white', rr(base,sW).toFixed(2), '| soft/bg', rr(base,sG).toFixed(2));
}
console.log('\n=== DARK: current token as text = proposed --*-ink dark (need 4.5) ===');
const dsurf=['#11151e','#1a1f2b','#0a0d14'];
const dark=[['green','#22d3a7',.12],['amber','#ffb547',.12],['red','#ff6b6b',.12],['cyan','#4fd1ff',.12]];
for(const [n,tok,a] of dark){
  const out=[n.padEnd(6),tok];
  for(const s of dsurf){ out.push(s+' '+r(tok,s).toFixed(2)); }
  for(const s of dsurf){ const t=soft(tok,a,s); out.push('soft/'+s.slice(1,4)+' '+rr(tok,t).toFixed(2)); }
  console.log(out.join(' | '));
}
console.log('\n=== LIGHT: --green etc as 1px border, need 3:1 (unchanged) ===');
for(const [n,ink,base] of cases) console.log(n.padEnd(6), base, 'white', r(base,W).toFixed(2), '#f4f6f9', r(base,G).toFixed(2));
console.log('\n=== ink as border (if border switched too) ===');
for(const [n,ink] of cases) console.log(n.padEnd(6), ink, 'white', r(ink,W).toFixed(2), '#f4f6f9', r(ink,G).toFixed(2));
console.log('\n=== accent roles ===');
console.log('white on --accent      #7c5cff', r('#ffffff','#7c5cff'));
console.log('white on --accent-solid#6a4aee', r('#ffffff','#6a4aee'));
console.log('white on light accent  #5b46e5', r('#ffffff','#5b46e5'));
console.log('--accent-text #9077ff on surface-2 #1a1f2b', r('#9077ff','#1a1f2b'), 'surface #11151e', r('#9077ff','#11151e'), 'bg #0a0d14', r('#9077ff','#0a0d14'));
console.log('--accent #7c5cff on surface #11151e', r('#7c5cff','#11151e'));
console.log('\n=== --text-1 (target for KPI numbers) ===');
console.log('light #0f1724 on white', r('#0f1724','#ffffff'), '| on #f4f6f9', r('#0f1724','#f4f6f9'));
console.log('dark  #e6e9ef on #11151e', r('#e6e9ef','#11151e'), '| #1a1f2b', r('#e6e9ef','#1a1f2b'), '| #0a0d14', r('#e6e9ef','#0a0d14'));
console.log('\n=== ink-on-bright on solid fills ===');
console.log('light #0f1724 on green #10b981', r('#0f1724','#10b981'), 'amber #f59e0b', r('#0f1724','#f59e0b'), 'red #ef4444', r('#0f1724','#ef4444'), 'cyan #06b6d4', r('#0f1724','#06b6d4'));
console.log('light #0f1724 on ink green #047857', r('#0f1724','#047857'), '  <- why NOT to darken --green itself');
console.log('dark  #0a0d14 on green #22d3a7', r('#0a0d14','#22d3a7'), 'amber #ffb547', r('#0a0d14','#ffb547'), 'red #ff6b6b', r('#0a0d14','#ff6b6b'), 'cyan #4fd1ff', r('#0a0d14','#4fd1ff'));
console.log('\n=== rail as soft tint: visibility of 4px bar against its card surface ===');
for(const [n,ink,base,a] of cases){
  const onSurf = soft(base,a,'#ffffff');
  console.log(n.padEnd(6),'light: rail rgb('+onSurf+') vs surface #ffffff ->', rr('#ffffff',onSurf).toFixed(2));
}
for(const [n,tok,a] of dark){
  const onSurf = soft(tok,a,'#11151e');
  console.log(n.padEnd(6),'dark : rail rgb('+onSurf+') vs surface #11151e ->', rr('#11151e',onSurf).toFixed(2));
}
console.log('\n=== ProviderAnalysis percent label inside green->amber bar ===');
console.log('white on #10b981', r('#ffffff','#10b981'), 'on #f59e0b', r('#ffffff','#f59e0b'));
console.log('--ink-on-bright #0f1724 on #10b981', r('#0f1724','#10b981'), 'on #f59e0b', r('#0f1724','#f59e0b'));
console.log('dark: --ink-on-bright #0a0d14 on #22d3a7', r('#0a0d14','#22d3a7'), 'on #ffb547', r('#0a0d14','#ffb547'));
console.log('--text-1 outside bar: light', r('#0f1724','#ffffff'), 'dark', r('#e6e9ef','#11151e'));
