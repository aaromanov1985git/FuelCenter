const hex=h=>{h=h.replace('#','');return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16));};
const lin=c=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);};
const L_=rgb=>0.2126*lin(rgb[0])+0.7152*lin(rgb[1])+0.0722*lin(rgb[2]);
const ratio=(a,b)=>{const l1=L_(a),l2=L_(b);return ((Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05));};
const over=(fg,a,bg)=>fg.map((c,i)=>Math.round(a*c+(1-a)*bg[i]));
const r=(a,b)=>Math.round(ratio(hex(a),typeof b==='string'?hex(b):b)*100)/100;
const rr=(a,b)=>Math.round(ratio(hex(a),b)*100)/100;
const soft=(base,alpha,bg)=>over(hex(base),alpha,hex(bg));
const hsl2rgb=(rgb)=>{const mx=Math.max(...rgb),mn=Math.min(...rgb);const L=(mx+mn)/2/255*100;const S=mx===mn?0:(mx-mn)/(mx+mn>255?510-mx-mn:mx+mn)*100;return [Math.round(S),Math.round(L)];};

console.log('=== reference line weights of this system (what "a visible line" costs here) ===');
console.log('light --border        #e8ecf0 on --surface #ffffff ->', r('#e8ecf0','#ffffff'));
console.log('light --border-strong #d1d9e0 on --surface #ffffff ->', r('#d1d9e0','#ffffff'));
console.log('dark  --border        #1f2633 on --surface #11151e ->', r('#1f2633','#11151e'));
console.log('dark  --border-strong #2a3243 on --surface #11151e ->', r('#2a3243','#11151e'));
console.log('light --text-3 #646f85 on #ffffff  (rail on neutral tiles today) ->', r('#646f85','#ffffff'));
console.log('light --text-1 #0f1724 on #ffffff  (rail on fc/veh neutral today) ->', r('#0f1724','#ffffff'));

const bases={green:['#10b981','#22d3a7'],amber:['#f59e0b','#ffb547'],red:['#ef4444','#ff6b6b'],cyan:['#06b6d4','#4fd1ff'],accent:['#5b46e5','#7c5cff']};
console.log('\n=== rail as tint: alpha sweep (contrast vs card --surface, + S/L of result) ===');
for(const a of [0.10,0.12,0.20,0.30,0.35,0.45]){
  const outL=[], outD=[];
  for(const [n,[lb,db]] of Object.entries(bases)){
    const tl=soft(lb,a,'#ffffff'), td=soft(db,a,'#11151e');
    outL.push(n+' '+rr('#ffffff',tl).toFixed(2)+'(S'+hsl2rgb(tl)[0]+'/L'+hsl2rgb(tl)[1]+')');
    outD.push(n+' '+rr('#11151e',td).toFixed(2)+'(S'+hsl2rgb(td)[0]+'/L'+hsl2rgb(td)[1]+')');
  }
  console.log('a='+a.toFixed(2)+' LIGHT '+outL.join(' '));
  console.log('        DARK  '+outD.join(' '));
}
console.log('\n=== rail kept SOLID only on the error tile (4px non-text mark, 3:1) ===');
console.log('light --red #ef4444 on #ffffff', r('#ef4444','#ffffff'), '| on #f4f6f9', r('#ef4444','#f4f6f9'));
console.log('dark  --red #ff6b6b on #11151e', r('#ff6b6b','#11151e'), '| on #1a1f2b', r('#ff6b6b','#1a1f2b'));
console.log('light --amber #f59e0b on #ffffff', r('#f59e0b','#ffffff'), '| dark #ffb547 on #11151e', r('#ffb547','#11151e'));

console.log('\n=== does the audit still call the proposed inks "loud"? (S>45 && 25<L<70) ===');
const hsl2=(h)=>{const [R,G2,B]=hex(h);const mx=Math.max(R,G2,B),mn=Math.min(R,G2,B);const L=(mx+mn)/2/255*100;const S=mx===mn?0:(mx-mn)/(mx+mn>255?510-mx-mn:mx+mn)*100;let H=0;if(mx!==mn){if(mx===R)H=60*(((G2-B)/(mx-mn))%6);else if(mx===G2)H=60*((B-R)/(mx-mn)+2);else H=60*((R-G2)/(mx-mn)+4);}if(H<0)H+=360;return {H:Math.round(H),S:Math.round(S),L:Math.round(L*10)/10};};
for(const [n,ink] of [['green-ink','#047857'],['amber-ink','#a1520a'],['red-ink','#c81e1e'],['cyan-ink','#0f6f8c'],['accent light','#5b46e5'],['green now','#10b981'],['amber now','#f59e0b'],['red now','#ef4444'],['cyan now','#06b6d4']]){
  const x=hsl2(ink); console.log(n.padEnd(13), ink, 'H'+String(x.H).padStart(3), 'S'+String(x.S).padStart(3), 'L'+x.L, (x.S>45&&x.L>25&&x.L<70)?'-> loud, hue bucket '+Math.round(x.H/30)*30:'-> OUT of loud window');
}
console.log('\n=== darker green ink candidates (to drop hue 150 out AND keep 4.5) ===');
for(const g of ['#047857','#036b4e','#0a6e4f','#05714f']){
  const x=hsl2(g); console.log(g,'L'+x.L,'S'+x.S,'| white',r(g,'#ffffff'),'| #f4f6f9',r(g,'#f4f6f9'),'| soft/bg',rr(g,soft('#10b981',.1,'#f4f6f9')));
}
