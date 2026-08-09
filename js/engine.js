/* ═══════════════════════════ 라운드 / 역할 선택 ═══════════════════════════ */
function startRound(){
  toast('<b>라운드 '+G.round+'</b> 시작 — 주지사 <b>'+esc(P(G.governor).name)+'</b>', null, true);
  G.roles.forEach(r=>r.takenBy=null);
  G.chooserQueue=[];
  if(G.n===2){
    for(let k=0;k<3;k++){ G.chooserQueue.push(G.governor, (G.governor+1)%2); }
  } else {
    G.chooserQueue=order(G.governor);
  }
  G.chooserIdx=0;
  log('<span class="r">라운드 '+G.round+'</span> — 주지사: '+pname(P(G.governor)));
  nextChooser();
}

function nextChooser(){
  if(G.chooserIdx>=G.chooserQueue.length){ endRound(); return; }
  const pi=G.chooserQueue[G.chooserIdx];
  G.pending={type:'pickRole', player:pi};
  schedule();
}

function pickRole(pi, roleIdx){
  const r=G.roles[roleIdx]; const p=P(pi);
  r.takenBy=pi;
  if(r.coins>0){ p.coins+=r.coins; log(pname(p)+' — 타일 위 '+r.coins+'주화 획득'); r.coins=0; }
  log(pname(p)+'이(가) <b>'+ROLES[r.id].nm+'</b> 역할을 선택했습니다.');
  roleSplash(r.id, p);
  G.chooserIdx++;
  startPhase(r.id, pi);
}

function endRound(){
  G.roles.forEach(r=>{ if(r.takenBy===null) r.coins++; });
  // 게임 종료 체크
  if(G.endReasons.length){ finishGame(); return; }
  G.governor=(G.governor+1)%G.n;
  G.round++;
  startRound();
}

/* ═══════════════════════════ 단계 공통 흐름 ═══════════════════════════ */
/* phase state: G.phase = {id, chooser, queue:[pi...], qi, ...phase별 필드} */

/* ── 단계 마무리 일시정지 ──
   각 단계의 마지막 행동이 처리된 직후 1초(PHASE_END_HOLD, app.js) 멈췄다가 실제 마무리(결과 보고·
   다음 차례)로 넘어간다 — 마지막 행동이 화면에 잠깐 머물러야 무슨 일이 있었는지 보인다.
   pending이므로 직렬화되고, 새로고침해도 schedule()이 타이머를 다시 걸어 이어진다. */
function phasePause(id){ G.pending={type:'phaseEnd', id}; schedule(); }
function actPhaseEnd(){
  if(!G || !G.pending || G.pending.type!=='phaseEnd') return;  // 그새 새 게임을 시작한 경우
  const id=G.pending.id; G.pending=null;
  if(id==='settler') settlerFinish();
  else if(id==='mayor') mayorFinish();
  else if(id==='builder') builderFinish();
  else if(id==='craft') craftFinish();
  else if(id==='trader') traderFinish();
  else if(id==='captain') captainFinish();
}
function startPhase(roleId, chooser){
  // hist: 이번 단계에 누가 무엇을 했는지 — 중앙 액션 패널의 "이번 단계 진행" 표시용 (직렬화 가능)
  const base={id:roleId, chooser, queue:order(chooser), qi:0, hist:[]};
  if(roleId==='prospector'||roleId==='prospector2'){
    P(chooser).coins++; log(pname(P(chooser))+' — 탐험가 혜택으로 1주화 획득');
    G.phase=null; nextChooser(); return;
  }
  if(roleId==='settler'){ G.phase={...base}; settlerNext(); return; }
  if(roleId==='mayor'){ mayorStart(base); return; }
  if(roleId==='builder'){ G.phase={...base}; builderNext(); return; }
  if(roleId==='craftsman'){ craftsmanRun(base); return; }
  if(roleId==='trader'){ G.phase={...base}; traderNext(); return; }
  if(roleId==='captain'){ G.phase={...base, passes:0, cur:chooser, firstShip:{}, wharfUsed:{}, anyAction:true}; captainNext(); return; }
}

/* ── 개척자 ── */
function settlerNext(){
  const F=G.phase;
  if(F.qi>=F.queue.length){ phasePause('settler'); return; }
  const pi=F.queue[F.qi]; const p=P(pi);
  if(p.land.length>=12){ log(pname(p)+' — 토지 칸이 가득 차 개척을 생략합니다.'); toast(pname(p)+' — 개척 생략 (토지 가득)', 'pboard-'+p.i, false, PCOLOR[p.i]); F.qi++; settlerNext(); return; }
  G.pending={type:'settler', player:pi, haciendaUsed:false, took:false};
  schedule();
}
function settlerFinish(){
  refillDisplay();
  log('개척 단계 종료 — 남은 농장을 버리고 새로 '+G.supply.display.length+'개를 공개했습니다.');
  G.phase=null; nextChooser();
}
function settlerCanQuarry(pi){
  const F=G.phase; const p=P(pi);
  return G.supply.quarries>0 && (F.chooser===pi || occB(p,'b_hut'));
}
function settlerPlace(p, type, fromDeck){
  p.land.push({type, w:0});
  // 개척도 건설과 같은 규칙 — 사람 행동에도 타일 팝 이펙트를 주고, 잠깐 보여준 뒤 보드를 다음 차례로 넘긴다
  if(p.ai) markFx(p.i, 'land-'+p.i+'-'+(p.land.length-1));
  else markFxThenFollow(p.i, 'land-'+p.i+'-'+(p.land.length-1));
  toast(imgTag('농장',PLANT_NM[type],'ticon')+'<span>'+pname(p)+' — <b>'+PLANT_NM[type]+'</b> 개척</span>', '#card-plants', false, PCOLOR[p.i]);
  // 병원: 더미(대규모 농장)로 가져온 타일에는 적용 안 됨
  if(!fromDeck && occB(p,'b_hosp')){
    if(takeWorkerSupplyFirst()){ p.land[p.land.length-1].w=1; log(pname(p)+' — 병원 기능으로 일꾼 1개를 새 타일에 배치'); }
  }
}
function phaseHist(entry){ const F=G.phase; if(F) (F.hist||(F.hist=[])).push(entry); }
function actSettler(action, arg){
  const pd=G.pending; const p=P(pd.player);
  if(action==='deck'){ // 대규모 농장
    const S=G.supply;
    if(!S.deck.length && S.discard.length) S.deck=shuffle(S.discard.splice(0));
    if(S.deck.length){
      const t=S.deck.pop(); settlerPlace(p,t,true); pd.haciendaUsed=true;
      phaseHist({pi:p.i, kind:'deck', t});
      log(pname(p)+' — 대규모 농장 기능으로 더미에서 <b>'+PLANT_NM[t]+'</b> 농장을 배치');
    } else pd.haciendaUsed=true;
    if(p.land.length>=12){ finishSettlerTurn(); return; }
    schedule(); return;
  }
  if(action==='display'){
    const t=G.supply.display.splice(arg,1)[0];
    settlerPlace(p,t,false);
    phaseHist({pi:p.i, kind:'farm', t});
    log(pname(p)+' — <b>'+PLANT_NM[t]+'</b> 농장을 개척');
    finishSettlerTurn(); return;
  }
  if(action==='quarry'){
    G.supply.quarries--; settlerPlace(p,'quarry',false);
    phaseHist({pi:p.i, kind:'quarry'});
    log(pname(p)+' — <b>채석장</b>을 개척');
    finishSettlerTurn(); return;
  }
  if(action==='skip'){ phaseHist({pi:p.i, kind:'skip'}); log(pname(p)+' — 개척을 생략'); toast(pname(p)+' — 개척 생략', 'pboard-'+p.i, false, PCOLOR[p.i]); finishSettlerTurn(); return; }
}
function finishSettlerTurn(){ G.pending=null; G.phase.qi++; settlerNext(); }

/* ── 모집관 ── */
function mayorStart(base){
  const chooser=base.chooser, p=P(chooser);
  if(G.supply.workers>0){ G.supply.workers--; p.stored++; log(pname(p)+' — 모집관 혜택으로 공급처에서 일꾼 1개'); }
  // 인력 시장 분배
  let idx=0; const o=order(chooser); const got={};
  while(G.supply.labor>0){
    const pi=o[idx%G.n]; G.supply.labor--; P(pi).stored++;
    got[pi]=(got[pi]||0)+1; idx++;
  }
  const parts=o.filter(pi=>got[pi]).map(pi=>P(pi).name+' '+got[pi]+'개');
  if(parts.length) log('인력 시장 분배 — '+parts.join(', '));
  G.phase={...base, placed:[]};
  mayorNextPlace();
}
function emptyCirclesOf(p){
  let c=0;
  for(const b of p.buildings) c+=BUILDINGS[b.id].slots-b.w;
  for(const l of p.land) c+=1-l.w;
  return c;
}
function emptyBuildingCircles(){
  let c=0;
  for(const p of G.players) for(const b of p.buildings) c+=BUILDINGS[b.id].slots-b.w;
  return c;
}
function mayorNextPlace(){
  const F=G.phase;
  if(F.qi>=F.queue.length){ mayorEnd(); return; }
  const pi=F.queue[F.qi];
  G.pending={type:'mayorPlace', player:pi};
  uiSel=null;
  schedule();
}
function totalWorkersOf(p){
  let c=p.stored;
  for(const b of p.buildings) c+=b.w;
  for(const l of p.land) c+=l.w;
  return c;
}
function mayorAutoPlace(p){
  // 전체 회수 후 그리디 배치 — 이펙트는 배치 전과 달라진 자리에만
  const beforeLand=p.land.map(l=>l.w);
  const beforeBld={}; p.buildings.forEach(b=>beforeBld[b.id]=b.w);
  let pool=totalWorkersOf(p);
  p.stored=0; p.buildings.forEach(b=>b.w=0); p.land.forEach(l=>l.w=0);
  const late = G.round>=8 || sitesUsed(p)>=9;
  const score=[];
  // 농장+공장 짝 점수
  const cap={}; // 공장 슬롯 잠재
  for(const t of GTYPES) cap[t] = (t==='corn') ? 99 : p.buildings.filter(b=>BUILDINGS[b.id].prod===t).reduce((s,b)=>s+BUILDINGS[b.id].slots,0);
  for(const t of GTYPES){
    const farms=p.land.filter(l=>l.type===t);
    const pairs=Math.min(farms.length, cap[t]);
    for(let k=0;k<farms.length;k++){
      const v = (k<pairs) ? 3+GOODS[t].price*0.6 : 0.2;
      score.push({v, apply:()=>{farms[k].w=1;}});
    }
  }
  for(const b of p.buildings){
    const B=BUILDINGS[b.id];
    if(B.kind==='prod'){
      const farms=p.land.filter(l=>l.type===B.prod).length;
      for(let s=0;s<B.slots;s++){
        const v = (s<farms) ? 3+GOODS[B.prod].price*0.6+0.1 : 0.2;
        score.push({v, apply:()=>{b.w++;}});
      }
    } else {
      const val={b_hut:1.6,b_hac:1.4,b_hosp:1.5,b_smkt:1.8,b_lmkt:2.0,b_swh:1.2,b_lwh:1.3,b_fact:2.6,b_univ:1.7,b_harb:2.8,b_wharf:2.4,b_off:0.9,
        b_hall:late?3.5:1.0,b_cust:late?3.5:1.0,b_fort:late?3.5:1.0,b_fire:late?3.5:1.0,b_resi:late?3.5:1.0}[b.id]||1;
      score.push({v:val, apply:()=>{b.w++;}});
    }
  }
  // 채석장
  const quarries=p.land.filter(l=>l.type==='quarry');
  quarries.forEach((q,k)=>score.push({v:2.2-k*0.15, apply:()=>{q.w=1;}}));
  score.sort((a,b)=>b.v-a.v);
  for(const s of score){ if(pool<=0) break; s.apply(); pool--; }
  p.stored=pool;
  if(p.ai){
    const keys=[];
    p.land.forEach((l,i)=>{ if(l.w>0 && !beforeLand[i]) keys.push('wkl-'+p.i+'-'+i); });
    p.buildings.forEach(b=>{ for(let s=(beforeBld[b.id]||0); s<b.w; s++) keys.push('wkb-'+p.i+'-'+b.id+'-'+s); });
    // 새로 놓인 자리가 있으면 팝 이펙트, 없어도(재배치 결과가 이전과 같아도) 보드는 항상 이 플레이어로 전환한다 —
    // 안 그러면 배치할 새 일꾼이 없는 봇 차례는 화면에 아무 변화 없이 통째로 스킵된 것처럼 보인다.
    markFxKeys(p.i, keys);
  }
}
/* 사람용 [자동 배치]도 봇과 같은 전체 회수 후 재배치(mayorAutoPlace)를 쓴다.
   빈 칸만 채우는 방식은 지난 라운드에 놓인 일꾼을 못 옮겨서, 농장↔공장 짝이 어긋난 채
   (예: 설탕 공장엔 일꾼이 있는데 설탕 농장이 빈) 결과를 만들었다 — 규칙상 재배치는 자유다. */

function actMayorDone(){
  const p=P(G.pending.player);
  G.pending=null; G.phase.qi++; mayorNextPlace();
}
function mayorEnd(){ phasePause('mayor'); }
function mayorFinish(){
  const need=Math.max(emptyBuildingCircles(), G.n);
  const put=Math.min(need,G.supply.workers);
  G.supply.workers-=put;
  G.supply.labor+=put;
  log('모집 단계 종료 — 인력 시장에 일꾼 '+put+'개 보충 (필요 '+need+'개)');
  if(put<need && !G.endReasons.includes('workers')){
    G.endReasons.push('workers');
    log('⚠️ 일꾼이 부족합니다 — 이번 라운드가 끝나면 게임이 종료됩니다.');
  }
  G.phase=null; nextChooser();
}

/* ── 건축가 ── */
function quarryDiscount(p,id){
  const occQ=p.land.filter(l=>l.type==='quarry'&&l.w>0).length;
  return Math.min(occQ, BUILDINGS[id].zone);
}
function buildCost(p,id,isChooser){
  let c=BUILDINGS[id].cost - quarryDiscount(p,id) - (isChooser?1:0);
  return Math.max(0,c);
}
function canBuild(p,id,isChooser){
  const B=BUILDINGS[id];
  if(G.supply.stock[id]<=0) return false;
  if(hasB(p,id)) return false;
  if(sitesUsed(p)+(B.size||1)>12) return false;
  return p.coins>=buildCost(p,id,isChooser);
}
/* 못 짓는 이유를 사람에게 보여주기 위한 것. 판정 순서는 canBuild와 같아야 한다. */
function buildBlockReason(p,id,isChooser){
  const B=BUILDINGS[id];
  if(G.supply.stock[id]<=0) return '품절';
  if(hasB(p,id)) return '이미 보유';
  if(sitesUsed(p)+(B.size||1)>12) return B.size===2?'부지 2칸 부족':'부지 없음';
  const short=buildCost(p,id,isChooser)-p.coins;
  if(short>0) return '주화 '+short+' 부족';
  return '';
}
function builderNext(){
  const F=G.phase;
  if(F.qi>=F.queue.length){ phasePause('builder'); return; }
  const pi=F.queue[F.qi];
  const p=P(pi), isC=(pi===F.chooser);
  const any=BORDER.some(id=>canBuild(p,id,isC));
  if(!any){ log(pname(p)+' — 건설할 수 있는 건물이 없어 생략합니다.'); F.qi++; builderNext(); return; }
  G.pending={type:'builder', player:pi};
  schedule();
}
function builderFinish(){ G.phase=null; nextChooser(); }
function actBuild(id){
  const pd=G.pending; const p=P(pd.player); const isC=(pd.player===G.phase.chooser);
  if(id==='skip'){ log(pname(p)+' — 건설을 생략'); toast(pname(p)+' — 건설 생략', 'pboard-'+p.i, false, PCOLOR[p.i]); G.pending=null; G.phase.qi++; builderNext(); return; }
  const cost=buildCost(p,id,isC);
  p.coins-=cost; G.supply.stock[id]--;
  const b={id,w:0}; p.buildings.push(b);
  // 사람이 지어도 이펙트를 준다 — 건설 중엔 보관소 팝업이 보드를 가리고 있어서,
  // 팝업이 닫힌 뒤 내 보드에서 새 건물이 팝되는 게 보여야 "지어졌다"가 보인다.
  // 사람은 잠깐 보여준 뒤 보드를 자동 모드로 되돌려 다음 차례에게 넘긴다.
  if(p.ai) markFx(pd.player, 'bld-'+pd.player+'-'+id);
  else markFxThenFollow(pd.player, 'bld-'+pd.player+'-'+id);
  log(pname(p)+' — <b>'+BUILDINGS[id].nm+'</b> 건설 ('+cost+'주화)');
  toast(imgTag('건물',BUILDINGS[id].nm,'ticon')+'<span>'+pname(p)+' — <b>'+BUILDINGS[id].nm+'</b> 건설 ('+cost+'주화)</span>', '[data-pi="'+pd.player+'"]', false, PCOLOR[p.i]);
  if(occB(p,'b_univ')){
    if(takeWorkerSupplyFirst()){ b.w=1; log(pname(p)+' — 학교 기능으로 일꾼 1개를 새 건물에 배치'); }
  }
  if(sitesUsed(p)>=12 && !G.endReasons.includes('sites')){
    G.endReasons.push('sites');
    log('⚠️ '+pname(p)+'의 건설 부지 12칸이 모두 찼습니다 — 이번 라운드가 끝나면 게임이 종료됩니다.');
  }
  G.pending=null; G.phase.qi++; builderNext();
}

/* ── 생산자 ── */
function productionOf(p){
  const out={};
  for(const t of GTYPES){
    let amt;
    const farms=p.land.filter(l=>l.type===t&&l.w>0).length;
    if(t==='corn') amt=farms;
    else{
      const cap=p.buildings.filter(b=>BUILDINGS[b.id].prod===t).reduce((s,b)=>s+b.w,0);
      amt=Math.min(farms,cap);
    }
    if(amt>0) out[t]=amt;
  }
  return out;
}
function craftsmanRun(base){
  const producedBy={}; const factBonus={};
  for(const pi of base.queue){
    const p=P(pi); const want=productionOf(p); const got={};
    for(const t of GTYPES){
      if(!want[t]) continue;
      const real=Math.min(want[t],G.supply.goods[t]);
      if(real>0){ G.supply.goods[t]-=real; p.goods[t]+=real; got[t]=real; }
    }
    producedBy[pi]=got;
    const kinds=Object.keys(got);
    if(kinds.length){
      log(pname(p)+' — 생산: '+kinds.map(t=>PLANT_NM[t]+' '+got[t]).join(', '));
      if(occB(p,'b_fact')&&kinds.length>=2){
        const bonus=[0,0,1,2,3,5][kinds.length];
        p.coins+=bonus; factBonus[pi]=bonus; log(pname(p)+' — 공업소 보너스 +'+bonus+'주화');
      }
    } else log(pname(p)+' — 생산할 수 있는 상품이 없습니다.');
  }
  // 전원 생산 요약 — 누가 무엇을 얼마나 생산했는지 한 장으로 (개별 토스트 대신)
  const prodRows=base.queue.map(pi=>({pi, got:producedBy[pi]||{}, fact:factBonus[pi]||0}));
  const mine=producedBy[base.chooser];
  const avail=Object.keys(mine||{}).filter(t=>G.supply.goods[t]>0);
  if(avail.length){
    G.phase={...base, bonusOptions:avail, prod:prodRows};
    G.pending={type:'craftBonus', player:base.chooser};
    schedule();   // 결과 보고는 혜택 선택까지 끝난 뒤(actCraftBonus)에 띄운다
  } else {
    G.phase={...base, prod:prodRows};
    phasePause('craft');
  }
}
function actCraftBonus(t){
  const p=P(G.pending.player);
  G.supply.goods[t]--; p.goods[t]++;
  log(pname(p)+' — 생산자 혜택으로 <b>'+PLANT_NM[t]+'</b> 1개 추가');
  G.phase.bonusTaken=t; G.phase.bonusPi=p.i;   // craftFinish의 결과 보고에 쓴다
  G.pending=null;
  phasePause('craft');
}
function craftFinish(){
  const F=G.phase, rows=(F&&F.prod)||[], t=F&&F.bonusTaken;
  G.phase=null;
  const html='<div class="ap-msg">모두 생산을 마쳤습니다. 결과를 확인하세요.</div>'
    +craftStageHtml(rows, t?{turnPi:F.bonusPi, extra:'<div class="ap-prow"><span class="dim">생산자 혜택</span><span class="ap-g">'+goodChip(t)+'+1</span></div>'}:{})
    +'<div class="ap-endbanner">🌾 생산 단계가 끝났습니다</div>';
  if(!phaseReport('🌾 생산 결과', html, 'craft')) nextChooser();
}

/* ── 상인 ── */
function sellableTypes(p){
  const M=G.supply.market;
  if(M.length>=4) return [];
  const office=occB(p,'b_off');
  return GTYPES.filter(t=>p.goods[t]>0 && (office||!M.includes(t)));
}
function traderNext(){
  const F=G.phase;
  if(F.qi>=F.queue.length){ phasePause('trader'); return; }
  const pi=F.queue[F.qi]; const p=P(pi);
  const opts=sellableTypes(p);
  if(!opts.length){ phaseHist({pi, kind:'skip', forced:true}); log(pname(p)+' — 판매할 수 있는 상품이 없어 생략합니다.'); F.qi++; traderNext(); return; }
  G.pending={type:'trader', player:pi};
  schedule();
}
function traderFinish(){
  const F=G.phase;
  // 단계 요약 — 진행 패널과 같은 2단 레이아웃으로: 좌 = 플레이어별 결과, 우 = 상점 최종 상황(비우기 전)
  const plCards=G.players.map(p=>{
    const h=(F.hist||[]).find(x=>x.pi===p.i&&x.kind==='sell');
    return '<div class="ap-pl" style="--pc:'+PCOLOR[p.i]+'">'
      +'<div class="ap-pl-h" style="color:'+PCOLOR[p.i]+'">'+esc(p.name)+'</div>'
      +'<div class="ap-prow">'+(h?'<span class="ap-g">'+goodChip(h.t)+PLANT_NM[h.t]+' 판매</span><b>+'+h.coins+'주화</b>':'<span class="dim">판매 없음</span>')+'</div></div>';
  }).join('');
  const full=G.supply.market.length>=4;
  const slots='<div class="ap-slots">'
    +G.supply.market.map(t=>'<div class="ap-slot">'+goodChip(t)+'</div>').join('')
    +Array(4-G.supply.market.length).fill('<div class="ap-slot"></div>').join('')+'</div>'
    +'<div class="ap-msg" style="margin-top:8px">'+(full?'가득 차 상품을 공급처로 반납합니다.':(G.supply.market.length?G.supply.market.length+'/4 — 다음 판매 단계까지 유지됩니다.':'비어 있음'))+'</div>';
  const html='<div class="ap-msg">모두 판매를 마쳤습니다. 결과를 확인하세요.'
    +'<br><span class="dim">'+(full?'가득 찬 상점은 비워집니다.':'남은 상품은 다음 판매 단계까지 유지됩니다.')+'</span></div>'
    +'<div class="ap-cols">'
    +'<div class="ap-col"><div class="ap-col-h">① 플레이어 결과</div><div class="ap-pls">'+plCards+'</div></div>'
    +'<div class="ap-col"><div class="ap-col-h">② 상점 (최대 4칸)</div>'+slots+'</div>'
    +'</div>'
    +'<div class="ap-endbanner">💰 판매 단계가 끝났습니다</div>';
  if(full){
    for(const t of G.supply.market) G.supply.goods[t]++;
    G.supply.market=[];
    log('상점이 가득 차 상품을 모두 공급처로 치웠습니다.');
  }
  G.phase=null;
  if(!phaseReport('💰 판매 결과', html, 'trader')) nextChooser();
}
function saleCoins(p,t,isChooser){
  let c=GOODS[t].price+(isChooser?1:0);
  if(occB(p,'b_smkt')) c+=1;
  if(occB(p,'b_lmkt')) c+=2;
  return c;
}
function actTrade(t){
  const pd=G.pending; const p=P(pd.player); const isC=(pd.player===G.phase.chooser);
  if(t==='skip'){ phaseHist({pi:p.i, kind:'skip'}); log(pname(p)+' — 판매를 생략'); G.pending=null; G.phase.qi++; traderNext(); return; }
  const c=saleCoins(p,t,isC);
  p.goods[t]--; G.supply.market.push(t); p.coins+=c;
  phaseHist({pi:p.i, kind:'sell', t, coins:c});
  markPanelFx(['plcard-'+p.i, 'mktslot-'+(G.supply.market.length-1), 'hist-last']);
  log(pname(p)+' — <b>'+PLANT_NM[t]+'</b> 판매 (+'+c+'주화)');
  G.pending=null; G.phase.qi++; traderNext();
}

/* ── 선장 ── */
function shipOptions(p){
  // 적재 가능한 (배, 상품) — 각 상품마다 최대 적재 배만 허용
  const res=[];
  for(const t of GTYPES){
    if(p.goods[t]<=0) continue;
    let best=-1, cand=[];
    G.supply.ships.forEach((s,si)=>{
      const space=s.size-s.count;
      if(space<=0) return;
      if(s.type===null){
        if(G.supply.ships.some(o=>o!==s&&o.type===t)) return;
      } else if(s.type!==t) return;
      const load=Math.min(space,p.goods[t]);
      if(load>best){ best=load; cand=[si]; }
      else if(load===best) cand.push(si);
    });
    for(const si of cand) if(best>0) res.push({ship:si,type:t,load:best});
  }
  return res;
}
function captainNext(){
  const F=G.phase;
  if(F.passes>=G.n){ captainStorage(); return; }
  const pi=F.cur; const p=P(pi);
  const opts=shipOptions(p);
  const wharfOK=occB(p,'b_wharf') && !F.wharfUsed[pi] && goodsTotal(p)>0;
  if(!opts.length && !wharfOK){
    F.passes++; F.cur=(F.cur+1)%G.n; captainNext(); return;
  }
  if(!opts.length && wharfOK){
    // 조선소는 선택 사항 → 결정 필요 (통과 가능)
    G.pending={type:'captain', player:pi, opts, wharfOK, mayPass:true};
  } else {
    G.pending={type:'captain', player:pi, opts, wharfOK, mayPass:false};
  }
  schedule();
}
/* 선적 시 얻을 승점 — 패널 미리보기용(변형 없음)과 실제 적용용을 분리 */
function captainVPPreview(p,pi,amount){
  const F=G.phase;
  let vp=amount;
  if(occB(p,'b_harb')) vp+=1;
  if(pi===F.chooser && !F.firstShip[pi]) vp+=1;
  return vp;
}
function captainShipVP(p,pi,amount){
  const vp=captainVPPreview(p,pi,amount);
  G.phase.firstShip[pi]=true;
  return vp;
}
function actCaptain(action,arg){
  const F=G.phase; const pd=G.pending; const pi=pd.player; const p=P(pi);
  if(action==='pass'){
    phaseHist({pi:p.i, kind:'skip'});
    log(pname(p)+' — 조선소를 사용하지 않고 넘깁니다.');
    G.pending=null; F.passes++; F.cur=(F.cur+1)%G.n; captainNext(); return;
  }
  if(action==='wharf'){
    const t=arg; const amt=p.goods[t];
    p.goods[t]=0; G.supply.goods[t]+=amt;
    F.wharfUsed[pi]=true;
    const vp=captainShipVP(p,pi,amt);
    giveVP(p,vp);
    phaseHist({pi:p.i, kind:'ship', t, amt, vp, wharf:true});
    markPanelFx(['plcard-'+p.i, 'hist-last']);
    log(pname(p)+' — 조선소(가상의 수송선)로 <b>'+PLANT_NM[t]+' '+amt+'개</b> 선적 (+'+vp+'점)');
  } else {
    const o=pd.opts[arg]; const s=G.supply.ships[o.ship];
    s.type=o.type; s.count+=o.load; p.goods[o.type]-=o.load;
    const vp=captainShipVP(p,pi,o.load);
    giveVP(p,vp);
    phaseHist({pi:p.i, kind:'ship', t:o.type, amt:o.load, vp, ship:s.size});
    // 방금 실린 칸들 + 배 카드 + 행동한 플레이어 카드에 애니메이션
    const slotKeys=[]; for(let k=s.count-o.load;k<s.count;k++) slotKeys.push('shipslot-'+o.ship+'-'+k);
    markPanelFx(['plcard-'+p.i, 'ship-'+o.ship, 'hist-last'].concat(slotKeys));
    log(pname(p)+' — '+s.size+'칸 수송선에 <b>'+PLANT_NM[o.type]+' '+o.load+'개</b> 선적 (+'+vp+'점)');
  }
  G.pending=null; F.passes=0; F.cur=(F.cur+1)%G.n; captainNext();
}
/* 저장 */
function storageCapacity(p){
  let types=0;
  if(occB(p,'b_swh')) types+=1;
  if(occB(p,'b_lwh')) types+=2;
  return types; // + 낱개 1개
}
function captainStorage(){
  const F=G.phase;
  F.storageQueue=F.queue.filter(pi=>goodsTotal(P(pi))>0);
  F.sqi=0;
  storageNext();
}
function storageNext(){
  const F=G.phase;
  if(F.sqi>=F.storageQueue.length){ captainEnd(); return; }
  const pi=F.storageQueue[F.sqi]; const p=P(pi);
  const cap=storageCapacity(p);
  const types=GTYPES.filter(t=>p.goods[t]>0);
  // 전부 저장 가능하면 자동
  if(types.length<=cap || (types.length===cap+1 && types.some(t=>p.goods[t]===1))){
    // cap종류 + 낱개1 로 전부 커버되는지 정확 판정
    const sorted=[...types].sort((a,b)=>p.goods[a]-p.goods[b]);
    let keepAll=false;
    if(types.length<=cap) keepAll=true;
    else if(types.length===cap+1){
      keepAll = sorted.some(t=>p.goods[t]===1);
    }
    if(keepAll){ F.sqi++; storageNext(); return; }
  }
  G.pending={type:'storage', player:pi, cap};
  uiSel={types:[], single:null};
  schedule();
}
function actStorage(keepTypes, single){
  const p=P(G.pending.player);
  const kept={};
  for(const t of keepTypes) kept[t]=p.goods[t];
  if(single && !kept[single]) kept[single]=(kept[single]||0)+1;
  let lost=[];
  for(const t of GTYPES){
    const k=kept[t]||0;
    const drop=p.goods[t]-Math.min(p.goods[t],k);
    if(drop>0){ G.supply.goods[t]+=drop; p.goods[t]-=drop; lost.push(PLANT_NM[t]+' '+drop); }
  }
  if(lost.length) log(pname(p)+' — 저장 한도 초과로 반납: '+lost.join(', '));
  G.pending=null; G.phase.sqi++; storageNext();
}
function captainEnd(){ phasePause('captain'); }
function captainFinish(){
  const F=G.phase;
  // 단계 요약 — 진행 패널과 같은 2단 레이아웃으로: 좌 = 플레이어별 결과, 우 = 수송선 최종 상황(비우기 전)
  const tally={};
  (F&&F.hist||[]).forEach(h=>{
    if(h.kind!=='ship') return;
    const t=tally[h.pi]||(tally[h.pi]={amt:0,vp:0});
    t.amt+=h.amt; t.vp+=h.vp;
  });
  const plCards=G.players.map(p=>{
    const t=tally[p.i];
    return '<div class="ap-pl" style="--pc:'+PCOLOR[p.i]+'">'
      +'<div class="ap-pl-h" style="color:'+PCOLOR[p.i]+'">'+esc(p.name)+'</div>'
      +'<div class="ap-prow">'+(t?t.amt+'개 선적 → <b>+'+t.vp+'점</b>':'<span class="dim">선적 없음</span>')+'</div></div>';
  }).join('');
  const shipCards=G.supply.ships.map(s=>{
    const full=s.type&&s.count>=s.size;
    return '<div class="ap-ship"><div class="hd"><b>'+s.size+'칸 수송선</b>'
      +(s.type?'<span class="cnt">'+PLANT_NM[s.type]+' '+s.count+'/'+s.size+'</span>':'<span class="free">비어 있음</span>')
      +(full?'<span class="why">가득 차 비워짐</span>':(s.type?'<span class="cnt">유지</span>':''))
      +'</div>'+shipSlotsHtml(s)+'</div>';
  }).join('');
  const html='<div class="ap-msg">모두 선적을 마쳤습니다. 결과를 확인하세요.'
    +'<br><span class="dim">가득 찬 수송선의 상품은 공급처로 반납됩니다.</span></div>'
    +'<div class="ap-cols">'
    +'<div class="ap-col"><div class="ap-col-h">① 플레이어 결과</div><div class="ap-pls">'+plCards+'</div></div>'
    +'<div class="ap-col"><div class="ap-col-h">② 수송선</div><div class="ap-ships vert">'+shipCards+'</div></div>'
    +'</div>'
    +'<div class="ap-endbanner">⚓ 선적 단계가 끝났습니다 — 가득 찬 수송선의 상품은 공급처로 반납됩니다</div>';
  for(const s of G.supply.ships){
    if(s.count>=s.size && s.type){
      G.supply.goods[s.type]+=s.count;
      log(s.size+'칸 수송선이 가득 차 '+PLANT_NM[s.type]+' '+s.count+'개를 공급처로 치웠습니다.');
      s.type=null; s.count=0;
    }
  }
  G.phase=null;
  if(!phaseReport('⚓ 선적 결과', html, 'captain')) nextChooser();
}

/* ═══════════════════════════ 게임 종료 / 점수 ═══════════════════════════ */
function finishGame(){
  G.over=true;
  const rows=G.players.map(p=>{
    const bvp=p.buildings.reduce((s,b)=>s+BUILDINGS[b.id].vp,0);
    let bigBonus=0; const notes=[];
    for(const b of p.buildings){
      if(!occupied(b)) continue;
      if(b.id==='b_fire'){
        const s=p.buildings.filter(x=>['b_fruit_s','b_sugar_s'].includes(x.id)).length;
        const l=p.buildings.filter(x=>['b_fruit_l','b_sugar_l','b_tobacco','b_coffee'].includes(x.id)).length;
        const v=s+l*2; bigBonus+=v; notes.push('소방서 +'+v);
      }
      if(b.id==='b_resi'){
        const c=p.land.length;
        const v=c>=12?7:c>=11?6:c>=10?5:4; bigBonus+=v; notes.push('주거지 +'+v);
      }
      if(b.id==='b_fort'){
        const v=Math.floor(totalWorkersOf(p)/3); bigBonus+=v; notes.push('요새 +'+v);
      }
      if(b.id==='b_cust'){
        const v=Math.floor(p.vp/4); bigBonus+=v; notes.push('세관 +'+v);
      }
      if(b.id==='b_hall'){
        const v=p.buildings.filter(x=>BUILDINGS[x.id].kind!=='prod').length;
        bigBonus+=v; notes.push('시청 +'+v);
      }
    }
    return {p, chips:p.vp, bvp, bigBonus, total:p.vp+bvp+bigBonus,
      tie:p.coins+goodsTotal(p), notes};
  });
  rows.sort((a,b)=> b.total-a.total || b.tie-a.tie);
  G.scores=rows.map(r=>({name:r.p.name, ai:r.p.ai, chips:r.chips, bvp:r.bvp, big:r.bigBonus, total:r.total, tie:r.tie, notes:r.notes}));
  const reasons={workers:'인력 시장 보충 불가', sites:'건설 부지 12칸 완성', vp:'승점 칩 소진'};
  log('<span class="r">게임 종료</span> — '+G.endReasons.map(r=>reasons[r]).join(', '));
  log('🏆 승자: <b>'+G.scores[0].name+'</b> ('+G.scores[0].total+'점)');
  G.pending={type:'gameOver'};
  render(); save();
}
