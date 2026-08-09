/* ═══════════════════════════ AI ═══════════════════════════ */
function aiValueOfRole(pi, role){
  const p=P(pi); let v=role.coins;
  const id=role.id;
  if(id==='prospector'||id==='prospector2') return v+1;
  if(id==='settler'){
    if(p.land.length>=12) return v;
    let best=0;
    for(const t of G.supply.display){
      const cap=(t==='corn')?99:p.buildings.filter(b=>BUILDINGS[b.id].prod===t).reduce((s,b)=>s+BUILDINGS[b.id].slots,0);
      const farms=p.land.filter(l=>l.type===t).length;
      const val=(t==='corn')?0.9:(farms<cap?1.1+GOODS[t].price*0.15:0.4);
      best=Math.max(best,val);
    }
    if(G.supply.quarries>0 && sitesUsed(p)<9) best=Math.max(best,1.3);
    return v+best;
  }
  if(id==='mayor'){
    const share=Math.ceil(G.supply.labor/G.n)+1;
    return v+share*0.65+(emptyCirclesOf(p)>2?0.5:0);
  }
  if(id==='builder'){
    let best=0;
    for(const bid of BORDER) if(canBuild(p,bid,true)) best=Math.max(best,aiBuildScore(p,bid));
    return v+Math.min(best,3.2);
  }
  if(id==='craftsman'){
    const mine=Object.entries(productionOf(p)).reduce((s,[t,c])=>s+c*(GOODS[t].price*0.5+0.8),0);
    let othersMax=0;
    for(const q of G.players) if(q.i!==pi){
      const o=Object.entries(productionOf(q)).reduce((s,[t,c])=>s+c*(GOODS[t].price*0.5+0.8),0);
      othersMax=Math.max(othersMax,o);
    }
    return v+mine-othersMax*0.35;
  }
  if(id==='trader'){
    const opts=sellableTypes(p);
    let best=0; for(const t of opts) best=Math.max(best,saleCoins(p,t,true));
    return v+best*0.8;
  }
  if(id==='captain'){
    let mine=0;
    for(const o of shipOptions(p)) mine=Math.max(mine,o.load);
    if(occB(p,'b_wharf')) mine=Math.max(mine,Math.max(...GTYPES.map(t=>p.goods[t])));
    let othersMax=0;
    for(const q of G.players) if(q.i!==pi){
      let m=0; for(const o of shipOptions(q)) m=Math.max(m,o.load);
      othersMax=Math.max(othersMax,m);
    }
    return v+mine*1.0-othersMax*0.3+(mine>0?1:0);
  }
  return v;
}
function aiBuildScore(p,id){
  const B=BUILDINGS[id];
  const late=G.round>=8||sitesUsed(p)>=8;
  if(B.kind==='prod'){
    const farms=p.land.filter(l=>l.type===B.prod).length;
    const cap=p.buildings.filter(b=>BUILDINGS[b.id].prod===B.prod).reduce((s,b)=>s+BUILDINGS[b.id].slots,0);
    if(farms>cap) return 2.2+GOODS[B.prod].price*0.25;
    return 0.4;
  }
  if(B.kind==='big') return late ? 3.2 : (p.coins>=12?2.2:0.8);
  const table={
    b_smkt:G.round<=4?1.6:1.0, b_hac:G.round<=4?1.3:0.6, b_hut:G.round<=4?1.5:0.6,
    b_swh:0.9, b_hosp:G.round<=5?1.4:0.7, b_off:0.7, b_lmkt:1.6, b_lwh:1.0,
    b_fact:2.6, b_univ:1.6, b_harb:2.9, b_wharf:2.3,
  };
  return table[id]||1;
}
function aiDecide(){
  const pd=G.pending; if(!pd) return;
  const p=P(pd.player);
  if(pd.type==='pickRole'){
    const avail=G.roles.map((r,i)=>({r,i})).filter(x=>x.r.takenBy===null);
    let best=avail[0], bv=-1e9;
    for(const a of avail){
      const v=aiValueOfRole(pd.player,a.r)+Math.random()*0.15;
      if(v>bv){ bv=v; best=a; }
    }
    pickRole(pd.player,best.i); return;
  }
  if(pd.type==='settler'){
    // 대규모 농장
    if(!pd.haciendaUsed && occB(p,'b_hac') && p.land.length<=10 && (G.supply.deck.length||G.supply.discard.length)){
      actSettler('deck'); return;
    }
    if(settlerCanQuarry(pd.player) && sitesUsed(p)<9 && p.land.filter(l=>l.type==='quarry').length<3 && G.round<=8){
      actSettler('quarry'); return;
    }
    let bi=-1,bv=-1;
    G.supply.display.forEach((t,i)=>{
      const cap=(t==='corn')?99:p.buildings.filter(b=>BUILDINGS[b.id].prod===t).reduce((s,b)=>s+BUILDINGS[b.id].slots,0);
      const farms=p.land.filter(l=>l.type===t).length;
      const v=(t==='corn')?1.0:(farms<cap?1.2+GOODS[t].price*0.12:0.35+GOODS[t].price*0.03);
      if(v>bv){bv=v;bi=i;}
    });
    if(bi>=0) actSettler('display',bi);
    else if(settlerCanQuarry(pd.player)) actSettler('quarry');
    else actSettler('skip');
    return;
  }
  if(pd.type==='mayorPlace'){ mayorAutoPlace(p); log(pname(p)+' — 일꾼 배치 완료 (보관 '+p.stored+'개)'); toast(pname(p)+' — 일꾼 배치 완료', 'pboard-'+p.i, false, PCOLOR[p.i]); actMayorDone(); return; }
  if(pd.type==='builder'){
    const isC=(pd.player===G.phase.chooser);
    let best=null,bv=0.85;
    for(const id of BORDER){
      if(!canBuild(p,id,isC)) continue;
      const v=aiBuildScore(p,id)-buildCost(p,id,isC)*0.06;
      if(v>bv){bv=v;best=id;}
    }
    actBuild(best||'skip'); return;
  }
  if(pd.type==='craftBonus'){
    let best=G.phase.bonusOptions[0];
    for(const t of G.phase.bonusOptions) if(GOODS[t].price>GOODS[best].price) best=t;
    actCraftBonus(best); return;
  }
  if(pd.type==='trader'){
    const opts=sellableTypes(p);
    let best=null,bv=0;
    for(const t of opts){ const c=saleCoins(p,t,pd.player===G.phase.chooser); if(c>bv){bv=c;best=t;} }
    actTrade(best||'skip'); return;
  }
  if(pd.type==='captain'){
    let bestIdx=-1,bv=-1;
    pd.opts.forEach((o,i)=>{ if(o.load>bv){bv=o.load;bestIdx=i;} });
    if(pd.wharfOK){
      let wt=null,wv=0;
      for(const t of GTYPES) if(p.goods[t]>wv){wv=p.goods[t];wt=t;}
      if(wv>=bv+2 || bestIdx<0){
        if(pd.mayPass && wv<3){ actCaptain('pass'); return; }
        actCaptain('wharf',wt); return;
      }
    }
    if(bestIdx>=0) actCaptain('ship',bestIdx);
    else actCaptain('pass');
    return;
  }
  if(pd.type==='storage'){
    const cap=pd.cap;
    const types=GTYPES.filter(t=>p.goods[t]>0).sort((a,b)=>{
      const va=p.goods[a]*(GOODS[a].price+0.5), vb=p.goods[b]*(GOODS[b].price+0.5);
      return vb-va;
    });
    const keep=types.slice(0,cap);
    const rest=types.filter(t=>!keep.includes(t)).sort((a,b)=>GOODS[b].price-GOODS[a].price);
    actStorage(keep, rest[0]||null); return;
  }
}
