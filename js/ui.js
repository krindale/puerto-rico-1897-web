/* ── UI 헬퍼 (사람 전용) ── */
function uiToggleLand(pi,li){
  const p=P(pi); const l=p.land[li];
  if(l.w>0){ l.w=0; p.stored++; }
  else if(p.stored>0){ l.w=1; p.stored--; }
  render();
}
function uiToggleBld(pi,id){
  const p=P(pi); const b=p.buildings.find(b=>b.id===id);
  const B=BUILDINGS[id];
  if(p.stored>0 && b.w<B.slots){ b.w++; p.stored--; }
  else if(b.w>0){ p.stored+=b.w; b.w=0; }
  render();
}
function uiMayorAuto(pi){ mayorAutoPlace(P(pi)); render(); }
function uiMayorDone(pi){
  const p=P(pi);
  if(p.stored>0 && emptyCirclesOf(p)>0){
    alert('빈 원형 칸이 있으면 일꾼을 반드시 배치해야 합니다.');
    return;
  }
  log(pname(p)+' — 일꾼 배치 완료 (보관 '+p.stored+'개)'); toast(pname(p)+' — 일꾼 배치 완료', 'pboard-'+p.i, false, PCOLOR[p.i]);
  actMayorDone();
}
function uiStoreType(t){
  const cap=G.pending.cap;
  const sel=storeSel();
  const i=sel.types.indexOf(t);
  if(i>=0) sel.types.splice(i,1);
  else if(sel.types.length<cap) sel.types.push(t);
  render();
}
function uiStoreSingle(t){ const sel=storeSel(); sel.single=(sel.single===t)?null:t; render(); }
function uiStoreDone(){ const sel=storeSel(); actStorage(sel.types, sel.single); }
