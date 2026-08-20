/* ═══════════════════════════ 뷰 상태 · 연출 ═══════════════════════════ */
/* G에 넣지 않는 화면 전용 상태(uiXxx 전역)와 토스트·이펙트·패널 가시성.
   새로고침하면 초기값으로 돌아간다는 전제를 렌더가 지켜야 한다 (CLAUDE.md 참고). */
/* ── 이벤트 토스트 (뷰 전용 — 게임 상태와 무관, 헤드리스에선 무시) ── */
/* 방금 배치된 것 강조: 액션한 플레이어 보드로 화면을 옮기고, 새 타일/일꾼에 팝 이펙트 */
let fxMark=null;
let cardFx=null;   // 사건이 일어난 사이드 카드 번쩍임
/* 직전 행동의 이펙트를 이 시간만큼은 화면에 붙잡아둔다 (렌더 전환·큰 토스트 공통 기준).
   = 배치 애니메이션 전체 길이: 보드 열림+간격(--fx-step .72s) + 팝(fxpop .95s) ≈ 1.67s
   CSS의 애니메이션 길이를 바꾸면 이 값도 반드시 같이 바꿀 것 — 짧으면 이펙트가 끝나기 전에
   다음 차례 UI(패널·팝업·액션바)가 떠서 방금 일어난 일이 안 보인다. */
const FX_HOLD=1700;
const BOARD_ANIM=470;  // 개인 보드 펼침 애니메이션(CSS --board-anim = .42s)이 끝나는 데 걸리는 시간 + 여유
const SHOP_DELAY=300;  // 보드가 다 펼쳐진 뒤 건물 보관판이 뜨기까지 쉬는 한 박자
function cardFxCls(id){ return (cardFx && cardFx.sel===id && Date.now()-cardFx.t<1400) ? ' cardflash' : ''; }
function markFxKeys(pi, keys){ const m={}; keys.forEach(k=>m[k]=1); fxMark={keys:m, t:Date.now(), pi}; uiBoardSel=pi; }
function markFx(pi, key){ markFxKeys(pi, [key]); }
/* 사람 행동용: 이펙트를 잠깐 보여준 뒤 보드를 자동 모드로 되돌려 다음 차례에게 넘긴다.
   봇은 다음 봇의 markFx가 보드를 가져가지만, 사람 뒤 차례가 전부 생략되면 보드가 내게 묶인 채 남는다. */
function markFxThenFollow(pi, key){
  markFx(pi, key);
  setTimeout(()=>{ if(uiBoardSel===pi){ uiBoardSel=null; render(); } }, FX_HOLD);
}
function fxCls(key){ return (fxMark && fxMark.keys[key] && Date.now()-fxMark.t<1900) ? ' fx-pop' : ''; }
/* 배치 팝이 두 번 재생되는 것을 막는다 — 보드 HTML은 fx와 무관한 이유(차례 띠·단계 전환 클래스)로도
   다시 만들어지는데, 교체된 새 노드의 애니메이션은 0초부터 다시 시작한다. 그래서 새로 만들어진
   fx 요소에 음수 animation-delay를 줘서 원래 타임라인의 그 시점부터 "이어서" 재생한다.
   render() 마지막에 호출. data-fxd 표시로 같은 노드를 두 번 만지지 않는다 (delay를 다시 쓰면 그게 또 재시작이다). */
function fxTimeSync(){
  if(!fxMark || typeof document==='undefined' || !document.querySelectorAll || typeof getComputedStyle!=='function') return;
  const elapsed=Date.now()-fxMark.t;
  document.querySelectorAll('.fx-pop:not([data-fxd])').forEach(el=>{
    el.dataset.fxd='1';
    if(fxMark.delay===undefined)   // 첫 렌더에 CSS가 정한 지연(0.3s 또는 board-in 0.72s)이 이 fx의 기준
      fxMark.delay=Math.round((parseFloat(getComputedStyle(el).animationDelay)||0)*1000);
    el.style.animationDelay=(fxMark.delay-elapsed)+'ms';
  });
}

let toastLive={};
function toast(html, sel, big, color){
  if(typeof document==='undefined'||!document.body||!document.createElement) return;
  // 큰 토스트(라운드 시작 등)가 직전 다른 플레이어의 이펙트를 화면에서 밀어내지 않게,
  // 그 이펙트가 아직 붙잡혀 있는 동안은 잠깐 미뤘다가 띄운다.
  if(big && fxMark && Date.now()-fxMark.t<FX_HOLD){
    setTimeout(()=>toast(html,sel,big,color), FX_HOLD-(Date.now()-fxMark.t));
    return;
  }
  try{
    const key='@center';  // 전부 중앙에 뜨므로 한 줄로 선다
    if(sel) cardFx={sel:sel, t:Date.now()};   // 해당 패널 번쩍
    const t=document.createElement('div');
    t.className='toast'+(big?' big':'');
    if(color) t.style.setProperty('--tc', color);
    t.innerHTML=html;
    // 모든 알림은 화면 세로 중앙에서 뜨고, 겹치면 위로 줄 선다
    let x=Math.round(innerWidth/2), y=big?Math.round(innerHeight*0.3):Math.round(innerHeight*0.46);
    const n=(toastLive[key]||0); toastLive[key]=n+1;         // 같은 자리에 겹치면 위로 줄 선다
    t.style.left=x+'px'; t.style.top=(y-n*58)+'px';  // 이미지 토스트 높이만큼 간격
    document.body.appendChild(t);
    setTimeout(()=>{ try{t.remove();}catch(_){} toastLive[key]=Math.max(0,(toastLive[key]||1)-1); }, big?2600:2400);
  }catch(e){}
}
/* 단계 결과 패널 — 단계가 끝날 때 전원의 결과를 한 장으로 화면 가운데에 (클릭하면 닫힘, 잠시 후 자동으로 사라짐) */
function phaseFlash(title, html){
  if(typeof document==='undefined'||!document.body||!document.createElement) return;
  // 직전 행동의 이펙트가 아직 붙잡혀 있으면 그만큼 미뤘다가 띄운다 (큰 토스트와 같은 규칙)
  if(fxMark && Date.now()-fxMark.t<FX_HOLD){
    setTimeout(()=>phaseFlash(title, html), FX_HOLD-(Date.now()-fxMark.t));
    return;
  }
  try{
    const d=document.createElement('div');
    d.className='prodflash';
    d.innerHTML='<div class="pf-h">'+title+'</div>'+html+'<div class="pf-hint">클릭하면 닫힙니다</div>';
    d.onclick=()=>{ try{d.remove();}catch(_){} };
    document.body.appendChild(d);
    setTimeout(()=>{ try{d.remove();}catch(_){} }, 5000);
  }catch(e){}
}
/* 생산 단계 화면 — 진행(혜택 선택)과 결과 보고가 같은 2단 레이아웃을 쓴다: 좌 = 플레이어별 생산, 우 = 공급처 재고.
   opts.turnPi 카드에는 강조 테두리 + opts.label + opts.extra(혜택 버튼 등)를 붙인다. */
function craftStageHtml(rows, opts){
  opts=opts||{};
  const plCards=rows.map(r=>{
    const q=P(r.pi); const kinds=Object.keys(r.got);
    const isTurn=(q.i===opts.turnPi);
    return '<div class="ap-pl'+(isTurn?' turn':'')+'" style="--pc:'+PCOLOR[q.i]+'">'
      +'<div class="ap-pl-h" style="color:'+PCOLOR[q.i]+'">'+(q.ai?aosIcon('bot',12)+' ':'')+esc(q.name)+(isTurn&&opts.label?opts.label:'')+'</div>'
      +'<div class="ap-prow">'
      +(kinds.length
        ? kinds.map(t=>'<span class="ap-g">'+goodChip(t)+'×'+r.got[t]+'</span>').join('')
          +(r.fact?'<span class="dim">공업소 +'+r.fact+'주화</span>':'')
        : '<span class="dim">생산 없음</span>')
      +'</div>'
      +(isTurn&&opts.extra?opts.extra:'')
      +'</div>';
  }).join('');
  const sup='<div class="ap-pls">'+GTYPES.map(t=>
    '<div class="ap-supline"><span class="ap-g">'+goodChip(t)+PLANT_NM[t]+'</span><b>'+G.supply.goods[t]+'</b></div>').join('')+'</div>';
  // craft: 좌우 1:1이 아니라 좌(플레이어 카드)를 넓게 — 5인에서 상품 칩이 줄바꿈되며 세로로 길어져 스크롤이 생겼다
  return '<div class="ap-cols craft">'
    +'<div class="ap-col"><div class="ap-col-h">① 생산 결과</div><div class="ap-pls">'+plCards+'</div></div>'
    +'<div class="ap-col"><div class="ap-col-h">② 공급처 재고</div>'+sup+'</div>'
    +'</div>';
}
/* 수송선 적재 칸 시각화 — 진행 패널과 결과 패널이 같은 그림을 쓴다 */
function shipSlotsHtml(s){
  let out='';
  for(let i=0;i<s.size;i++)
    out+= i<s.count?'<span class="ap-shipslot">'+goodChip(s.type)+'</span>':'<span class="ap-shipslot"></span>';
  return '<div class="ap-shipslots">'+out+'</div>';
}
/* 단계 결과 보고 — 사람이 있으면 [확인]을 누를 때까지 게임을 멈춘다.
   pending(직렬화 가능)으로 만들어야 이 상태에서 새로고침해도 복구된다. 봇만 있으면 지나가는 패널로 대체.
   stage('captain'|'trader')를 주면 해당 단계 진행 패널과 같은 크기·레이아웃으로 그려져 패널이 이어지는 것처럼 보인다.
   호출 전에 G.phase는 정리되어 있어야 하며, 반환 false면 호출자가 직접 진행(nextChooser)한다.
   banner: "단계가 끝났습니다" 배너 문구. 보고 모달에서는 확인 버튼과 같은 줄에 놓여 세로를 아끼고
   (5인 결과가 620px 창을 넘겨 스크롤이 생겼다), 봇만 있는 지나가는 패널에서는 본문 아래에 그대로 붙는다. */
function phaseReport(title, html, stage, banner){
  if(G.players.some(p=>!p.ai)){
    // acks: 이 결과를 확인한 좌석들 — 온라인에서는 사람 좌석 전원이 확인해야 다음으로 넘어간다
    G.pending={type:'report', title, html, stage:stage||null, banner:banner||'', acks:[]};
    schedule();
    return true;
  }
  phaseFlash(title, html+(banner?'<div class="ap-endbanner">'+banner+'</div>':''));
  return false;
}
/* 결과 확인 — 로컬은 즉시 진행, 온라인은 사람 좌석 전원이 확인해야 진행한다.
   seat: 확인한 좌석(호스트가 게스트 intent를 대신 적용할 때 전달). 생략하면 내 좌석. */
function actReportDone(seat){
  const pd=G.pending;
  if(!pd||pd.type!=='report') return;
  if(typeof NET!=='undefined'&&NET.on){
    if(!NET.host) return;                      // 게스트는 intent만 보낸다 (netWrapActs가 감쌈)
    const s=(seat===undefined||seat===null)?NET.mySeat:seat;
    pd.acks=pd.acks||[];
    if(s!==null&&s!==undefined&&!pd.acks.includes(s)) pd.acks.push(s);
    const humans=G.players.filter(p=>!p.ai).map(p=>p.i);
    if(!humans.every(i=>pd.acks.includes(i))){ schedule(); return; }   // 아직 안 누른 사람이 있다
  }
  G.pending=null;
  nextChooser();
}

/* 역할 선택: 역할 카드 이미지가 중앙에 잠깐 크게 떴다 사라진다 */
/* 역할 선택 연출 — 고른 역할 카드가 화면 가운데에 부드럽게 떴다가 부드럽게 사라진다. */
const ROLE_ANIM=1400;                     // 떴다 사라지기까지 전체 시간 (CSS @keyframes rsplash와 같은 값)
function roleSplash(roleId, p){
  if(typeof document==='undefined'||!document.body||!document.createElement) return;
  try{
    const d=document.createElement('div');
    d.className='rsplash';
    d.style.setProperty('--tc', PCOLOR[p.i]);
    // 반드시 imgTag를 쓴다 — 배포본에는 webp만 올라가므로(.png는 404) 손으로 짠 <img src=".png">는 사라진다
    d.innerHTML=imgTag('역할', ROLES[roleId].nm)
      +'<div class="who">'+esc(p.name)+' — '+ROLES[roleId].nm+'</div>';
    document.body.appendChild(d);
    setTimeout(()=>{ try{d.remove();}catch(_){} }, ROLE_ANIM+50);
  }catch(e){}
}

/* ── 화면 상태 ──
   G에 넣지 않는 순수 뷰 상태. 저장/되돌리기와 무관하며 새로고침하면 기본값으로 돌아간다. */
let uiBoardSel = null;   // 펼쳐 볼 개인 보드. null = 현재 차례인 플레이어를 자동으로 따라감
let uiShopOpen = null;   // 건물 보관판 팝업. null = 자동(내 건설 차례에 열림) / true = 열어둠 / false = 닫아둠
let uiShopWasVisible = false;  // 직전 렌더에서 팝업이 떠 있었는가 — "새로 열린 순간"에만 등장 애니메이션을 준다
let uiLastPend = '';     // pending 전환 감지용
let uiHoldUntil = 0;     // 이 시각까지는 "당신 차례" 표시(역할 선택 가능 표시·액션바 등)를 숨긴다 — 직전 이펙트를 먼저 보여주기 위함
let uiPrevShown = null;  // 직전 렌더에서 펼쳐져 있던 보드 — 바뀐 순간에만 넓어지는 애니메이션을 준다

/* "이 좌석의 결정을 이 화면에서 내리는가" — 로컬 게임이면 사람이면 전부,
   온라인이면 내 좌석일 때만. "당신 차례" UI(패널·액션바·클릭 가능 표시)는 전부 이걸 봐야 한다 —
   !p.ai 만 보면 온라인에서 남의(원격 사람) 차례에도 내 화면이 조작 가능해진다. */
function isLocalHuman(pi){
  if(pi===null||pi===undefined||!G||!G.players[pi]||G.players[pi].ai) return false;
  if(typeof NET==='undefined'||!NET.on) return true;
  return NET.mySeat===pi;
}
function humanPend(){ const pd=G&&G.pending; return (pd&&pd.player!==undefined&&pd.type!=='gameOver'&&isLocalHuman(pd.player))?pd:null; }
function shownBoard(){
  if(!G) return 0;
  if(uiBoardSel!==null) return uiBoardSel;
  const pd=G.pending;
  // 중앙 패널이 떠 있는 단계(선적·저장·판매·생산 혜택·결과 보고·단계 마무리)에는 개인 보드를 움직이지 않는다 —
  // 패널 뒤에서 보드 아코디언이 전환되면 화면 전체가 흔들려 보인다
  if(pd&&(pd.type==='captain'||pd.type==='storage'||pd.type==='trader'||pd.type==='craftBonus'||pd.type==='report'||pd.type==='phaseEnd')){
    const h=G.players.find(q=>!q.ai);
    return h?h.i:G.governor;
  }
  return (pd&&pd.player!==undefined)?pd.player:G.governor;
}
function shopVisibleNow(){
  if(!G||G.over) return false;
  if(uiShopOpen!==null) return uiShopOpen;
  const pd=humanPend();
  return !!pd && pd.type==='builder';
}
function uiSelectBoard(i){ uiBoardSel=i; render(); }
// 보관판을 닫으면 그 위에 떠 있던 탭 미리보기 시트도 같이 닫는다 —
// 안 그러면 뒤가 비어 있는 시트만 덩그러니 남는다
function uiToggleShop(){ uiShopOpen=!shopVisibleNow(); if(!uiShopOpen) uiPreview=null; render(); }

/* ── 중앙 액션 패널 ──
   내 차례의 선택지(개척·모집·생산 보너스·판매·선적·저장)를 건물 보관소처럼 가운데 팝업으로 보여준다.
   건설은 기존 건물 보관소 팝업이 그 역할이므로 여기서 다루지 않는다. */
let uiPanelOpen = null;        // null = 자동(내 차례에 열림) / true = 열어둠 / false = 닫아둠
let uiPanelWasVisible = false; // 등장 애니메이션은 "새로 열린 순간"에만
let uiPanelAnim = '';          // 패널 오버레이에 붙일 애니메이션 클래스 ('pop'=새로 열림, 'swap'=결과 전환 펄스)
let uiPanelKey = '';           // 패널이 지금 보여주는 단계 키 — 바뀌는 순간 내용 전환 애니메이션을 튼다
let uiPanelFlip = false;       // 내용 전환 애니메이션 재생 트리거 (a/b 클래스 교대)
/* 패널 바깥(어두운 배경) 클릭 — 결과 보고 중이면 확인으로, 그 외에는 닫기로 취급 */
function uiPanelBg(e){
  if(!e || e.target.id!=='ap-ov') return;
  if(G && G.pending && G.pending.type==='report') actReportDone();
  else uiTogglePanel();
}
const PANEL_TYPES = { pickRole:1, settler:1, mayorPlace:1, craftBonus:1, trader:1, captain:1, storage:1 };
function panelVisibleNow(){
  if(!G||G.over) return false;
  const pd=G.pending;
  if(!pd) return false;
  if(uiPanelOpen!==null) return uiPanelOpen;
  // 선적(저장 포함)·판매·생산 혜택은 봇 차례에도 패널을 유지한다 — 전원의 진행 상황을 그 안에서 보여준다
  if((pd.type==='captain'||pd.type==='storage'||pd.type==='trader'||pd.type==='craftBonus')&&G.players.some(q=>!q.ai)) return true;
  // 단계 마무리 일시정지: 패널 단계였다면 마지막 행동이 보이도록 패널을 그대로 띄워 둔다
  if(pd.type==='phaseEnd') return (pd.id==='captain'||pd.id==='trader'||pd.id==='craft')&&G.players.some(q=>!q.ai);
  const hp=humanPend();
  return !!hp && !!PANEL_TYPES[hp.type];
}
function uiTogglePanel(){ uiPanelOpen=!panelVisibleNow(); render(); }
/* 선적 패널의 2단계 선택: ① 상품을 고르면 ② 실을 수 있는 배가 버튼이 된다 (뷰 상태 — 새로고침하면 초기화) */
let uiShipSel = null;
function uiSelectShipGood(t){
  uiShipSel=(uiShipSel===t)?null:t;
  // 화물을 골랐는데 실을 곳이 단 하나뿐이면 두 번째 클릭 없이 바로 싣는다 (사용자 요청)
  if(uiShipSel){
    const pd=G&&G.pending;
    if(pd&&pd.type==='captain'){
      const ships=pd.opts.map((o,i)=>({o,i})).filter(x=>x.o.type===t);
      const nOpts=ships.length+(pd.wharfOK?1:0);   // 조선소도 선택지 하나로 센다
      if(nOpts===1){
        uiShipSel=null;
        if(ships.length) actCaptain('ship', ships[0].i);
        else actCaptain('wharf', t);
        return;
      }
    }
  }
  render();
}
/* ? 도움말 — 언제든 볼 수 있는 요약 규칙 팝업 (뷰 상태) */
/* ── 탭 미리보기 ──
   터치 기기에는 호버가 없다. 데스크톱에서 호버가 하던 일(카드 확대 + 효과 확인)을 첫 탭이 맡고,
   확정은 시트의 버튼에서만 일어난다 — 카드를 탭했다고 건물이 지어지면 되돌릴 방법이 없다.
   (UI/UX 원칙 2: 불가능한 이유를 보여준다 · 3: 확정 전까지 되돌릴 수 있다)
   포인터가 있는 기기(데스크톱)에서는 이 경로를 아예 타지 않는다 — 지금의 호버 확대가 그대로다. */
function tapPreviewMode(){
  try{ return window.matchMedia('(hover:none)').matches; }catch(e){ return false; }
}
let uiPreview=null;   // {kind:'bld'|'role', id, pi} — 뷰 상태이므로 G에 넣지 않는다
function uiPreviewOpen(kind,id,pi){ uiPreview={kind:kind,id:id,pi:pi}; render(); }
function uiPreviewClose(){ uiPreview=null; render(); }
function uiPreviewConfirm(){
  const pv=uiPreview; uiPreview=null;
  if(!pv) return;
  if(pv.kind==='bld') actBuild(pv.id);
  else pickRole(pv.pi, pv.id);
}

/* 모바일 접이식 — 공용 보드(공개 농장·수송선·상점·인력시장·공급처)와 기록을 역할 타일 바로 아래
   한 줄로 접어 둔다. 접힌 줄에도 요약 수치를 얹어, 펼치지 않고도 대부분의 판단이 끝나게 한다.
   뷰 상태이므로 G에 넣지 않는다 — 새로고침하면 접힌 기본값으로 돌아간다.
   펼침을 기억하지 않는 이유: 펼치면 개인 보드가 아래로 밀리는데, 그 상태가 다음 차례까지 남으면
   "내 보드가 어디 갔지"가 된다. 그래서 결정이 바뀔 때마다 접는다 (render의 pending 전환 처리). */
let uiFold={board:false, log:false};
function uiToggleFold(k){ uiFold[k]=!uiFold[k]; render(); }
let uiHelpOpen=false;
function uiToggleHelp(){ uiHelpOpen=!uiHelpOpen; render(); }
function renderHelpPop(){
  if(!uiHelpOpen) return '';
  const roleRows=[
    ['개척자','공개된 농장 1개를 토지 칸에 놓는다','농장 대신 채석장을 가져올 수 있음'],
    ['모집관','인력 시장의 일꾼을 나눠 갖고, 내 일꾼 전체를 자유롭게 재배치','공급처에서 일꾼 1개 추가'],
    ['건축가','건물 1개를 건설 (점유된 채석장만큼 할인)','건설 비용 −1주화'],
    ['생산자','점유된 농장·공장 짝만큼 상품 생산 (옥수수는 농장만)','생산한 것 중 1개 추가'],
    ['상인','상점(4칸)에 상품 1개 판매 — 같은 종류 중복 불가','판매가 +1주화'],
    ['선장','실을 수 있으면 반드시 선적 — 배마다 한 종류, 1개=1점','첫 선적 +1점'],
    ['탐험가','아무 행동 없음','은행에서 1주화'],
  ].map(r=>'<tr><td>'+r[0]+'</td><td>'+r[1]+'</td><td>'+r[2]+'</td></tr>').join('');
  return '<div class="overlay help-ov pop" onclick="if(event.target===this)uiToggleHelp()"><div class="modal help-modal">'
    +'<div class="shop-modal-h"><h2>요약 규칙</h2><button class="btn-ghost" onclick="uiToggleHelp()">닫기 ✕</button></div>'
    +'<h3>목표</h3>'
    +'<p>승점을 가장 많이 모으면 승리. 승점 = <b>선적</b>(상품 1개=1점) + <b>건물 승점</b> + <b>점유된 고급 건물 보너스</b>. 동점이면 주화+상품 합계.</p>'
    +'<h3>라운드 흐름</h3>'
    +'<p>주지사부터 시계 방향으로 역할을 하나씩 고릅니다. 고른 역할의 행동은 <b>전원이</b> 하지만, <b>특별 혜택은 고른 사람만</b> 받습니다. '
    +'아무도 안 고른 역할엔 1주화가 쌓여 다음 라운드에 더 매력적이 됩니다.</p>'
    +'<h3>역할 7종</h3>'
    +'<table><tr><th>역할</th><th>전원 행동</th><th>선택자 혜택</th></tr>'+roleRows+'</table>'
    +'<h3>꼭 기억할 것</h3>'
    +'<ul>'
    +'<li><b>점유</b> — 타일 위 원형 칸에 일꾼이 있어야 그 타일이 일합니다. 예외: 건물 승점은 비어 있어도 계산.</li>'
    +'<li><b>생산 짝</b> — 과일·설탕·담배·커피는 점유된 <b>농장 + 공장 일꾼</b>이 짝을 이룬 만큼만 생산. 옥수수는 농장만.</li>'
    +'<li><b>선적</b> — 배마다 한 종류, 다른 배와 같은 종류 불가, 가장 많이 실리는 배에 전부. 단계 끝에 상품은 1개만 저장(+창고).</li>'
    +'<li><b>채석장</b> — 건설 할인. 건물 구역(1~4)에 따라 할인 한도가 다릅니다.</li>'
    +'</ul>'
    +'<h3>게임 종료</h3>'
    +'<p>다음 중 하나면 그 라운드 끝에 종료: ① 인력 시장을 다 못 채움 ② 누군가 건설 부지 12칸을 다 채움 ③ 승점 칩 소진.</p>'
    +'<p class="hm-dim">더 자세한 규칙은 소개 페이지의 "게임 하는 방법" 탭에 있습니다.</p>'
    +'</div></div>';
}

/* 선적·판매 패널의 액션 이펙트 — 방금 행동으로 바뀐 요소(카드·칸·내역 줄)에만 애니메이션 클래스를 붙인다.
   fxMark(보드용)와 같은 원리지만 보드 전환(uiBoardSel)을 건드리지 않는 패널 전용 마커. */
let panelFx=null;
function markPanelFx(keys){ const m={}; keys.forEach(k=>m[k]=1); panelFx={keys:m, t:Date.now()}; }
function pfxCls(key, cls){ return (panelFx&&panelFx.keys[key]&&Date.now()-panelFx.t<1000)?' '+cls:''; }

/* ── 소개 페이지에 끼워졌을 때(iframe) ──
   소개 페이지의 "플레이" 탭은 이 파일을 iframe으로 띄우고 화면 전체를 내준다.
   그래서 돌아갈 길은 여기서 만들어 줘야 한다 — 부모에게 "소개로 돌려보내 달라"고 알린다.
   file:// 로 열면 부모/자식이 서로 다른 출처로 취급돼 직접 함수 호출이 막히므로 postMessage를 쓴다. */
const EMBEDDED=(()=>{ try{ return window.self!==window.top; }catch(e){ return true; } })();

/* 지금 화면이 그리고 있는 파일이 "언제 저장된 것인지" 보여준다.
   브라우저가 예전 파일을 캐시해 두면 고친 내용이 반영이 안 되는데, 화면만 봐서는 알 수가 없다.
   이 시각이 실제 저장 시각보다 옛날이면 강제 새로고침(⇧⌘R)이 필요하다는 뜻이다. */
function fileStamp(){
  const d=new Date(document.lastModified);
  if(isNaN(d.getTime())) return '';
  const z=n=>(n<10?'0':'')+n;
  return z(d.getMonth()+1)+'-'+z(d.getDate())+' '+z(d.getHours())+':'+z(d.getMinutes());
}
function stampHtml(){
  const s=fileStamp();
  return s?'<span class="ver" title="이 화면이 그리고 있는 게임 파일의 저장 시각입니다.\n실제 파일보다 옛날이면 브라우저가 예전 파일을 캐시하고 있는 것이니 ⇧⌘R(강제 새로고침) 하세요.">파일 '+s+'</span>':'';
}
function backBtnHtml(){ return EMBEDDED?'<button class="backbtn" onclick="uiBackToIntro()">← 소개로</button>':''; }
// postMessage만 쓴다 — 부모 주소를 직접 건드리면 히스토리에 쓸데없는 항목이 쌓인다.
// 메시지가 아예 막힌 환경이면 부모가 아래 pr1897:ready 신호를 못 받고 자기 버튼을 띄운다.
function uiBackToIntro(){ try{ window.parent.postMessage('pr1897:back','*'); }catch(e){} }
// 부모에게 "안에서 버튼을 그렸다"고 알린다 — 이 신호가 없으면 부모가 자기 쪽 버튼을 띄운다
if(EMBEDDED){ try{ window.parent.postMessage('pr1897:ready','*'); }catch(e){} }

/* ── 개인 보드 타일 폭 ──
   한 줄에 [펼친 보드 1개 + 접힌 요약 카드 (인원-1)장]이 들어가야 한다.
   펼친 보드가 원래 크기로 필요로 하는 폭은 건설 부지 6칸(119px×6 + 간격) = 729px + 패딩이라,
   5인이면 접힌 카드가 아무리 좁아도 최대 창(main-col 1108px)에서조차 자리가 모자란다.
   폭이 모자라면 flex가 펼친 보드를 눌러버리고, 안의 내용은 max-content라 안 줄어들어
   건설 부지 오른쪽 칸이 그냥 잘려나갔다 (부지가 몇 칸 남았는지 셀 수 없게 된다).
   → 잘라내는 대신 타일을 줄인다. 접힌 카드 몫을 먼저 떼고 남는 폭에 6칸을 맞춘다.
   대부분의 경우 BW_MAX 그대로이고, 좁을 때만 조금씩 작아진다. */
const CB_MIN=118;     // 접힌 요약 카드 최소 폭 — 농장·건물 이름이 들어가야 한다. CSS --cbmin 기본값과 같을 것
const CB_GAP=8;       // .players의 gap
const BW_MAX=119, BW_MIN=62;   // 건설 부지 타일 폭 상·하한 (하한은 "작아도 6칸 다 보이는 게 낫다"는 판단)
const BW_MIN_NARROW=40;        // 1단(모바일) 레이아웃 전용 하한 — 390px 화면에서 6칸이 다 들어가려면 62로는 모자란다
const LW_MAX=59;               // 토지 타일 폭 상한 (2단 레이아웃의 원래 크기)
const BOARD_PAD=31, BGRID_GAP=15;   // 펼친 보드 좌우 패딩·테두리 / 건설 부지 칸 사이 gap 3px×5
const LGRID_GAP=20;   // 토지 그리드 칸 사이 gap 4px×5
const NARROW_W=1000;  // 1단 레이아웃 전환점 — css/game.css의 @media (max-width:1000px)와 같아야 한다
/* 한 줄의 폭 배분을 통째로 계산한다 —
   펼친 폭(openW)과 접힌 폭(cbw)이 "어느 보드를 펼치든 같은 값"이어야
   보드를 전환할 때 관계없는 카드들이 흔들리지 않는다. */
function boardMetrics(n){
  const cont=document.getElementById('rd-players');
  const w=cont?cont.clientWidth:0;
  if(!w) return null;
  /* 1단(모바일) 레이아웃: .players가 가로 스크롤 스트립이라 펼친 보드가 컨테이너 폭을 통째로 쓴다
     — 접힌 카드 몫을 미리 뗄 필요가 없다. 예전에는 여기서 null을 반환해 축소가 통째로 꺼져 있었고,
     그래서 390px 화면에서 건설 부지(6×119=760px)의 오른쪽 칸이 그냥 잘려나갔다.
     토지는 자원 패널 옆이 아니라 위에 놓이므로(.landrow 세로 전환) 건설 부지와 같은 폭을 쓴다. */
  if(window.innerWidth<=NARROW_W){
    const inner=w-BOARD_PAD;
    return {
      bw: Math.max(BW_MIN_NARROW, Math.min(BW_MAX, Math.floor((inner-BGRID_GAP)/6))),
      lw: Math.max(BW_MIN_NARROW, Math.min(LW_MAX, Math.floor((inner-LGRID_GAP)/6))),
      narrow: true,
    };
  }
  const avail=w-(n-1)*(CB_MIN+CB_GAP);                                  // 펼친 보드가 쓸 수 있는 폭
  const bw=Math.max(BW_MIN, Math.min(BW_MAX, Math.floor((avail-BOARD_PAD-BGRID_GAP)/6)));
  const contentW=6*bw+BGRID_GAP+BOARD_PAD;                              // 그 타일 폭일 때 보드 내용 폭
  const openW=Math.min(avail, contentW);                                // 내용보다 넓게 늘리지 않는다
  const slack=Math.max(0, avail-openW);                                 // 타일이 상한(BW_MAX)에 걸려 남는 폭
  const cbw=CB_MIN+Math.floor(slack/(n-1));                             // 남는 폭은 접힌 카드들이 똑같이 나눠 갖는다
  return {bw, lw:Math.round(bw*LW_MAX/BW_MAX), openW, cbw, narrow:false};
}
// 창 크기가 바뀌면 다시 계산해야 한다 (타일 폭이 창 폭에 달려 있으므로)
let rzT=0;
window.addEventListener('resize', function(){ if(!G||!document.getElementById('rd-players')) return;
  clearTimeout(rzT); rzT=setTimeout(render, 120); });

document.addEventListener('keydown', function(e){
  if(!G||G.over) return;
  const tg=e.target&&e.target.tagName;
  if(tg==='INPUT'||tg==='SELECT'||tg==='TEXTAREA') return;
  if(e.key==='ArrowLeft'||e.key==='ArrowRight'){
    uiBoardSel=(shownBoard()+(e.key==='ArrowRight'?1:G.n-1))%G.n;
    e.preventDefault(); render();
  } else if(e.key==='Escape'&&uiPreview){
    uiPreviewClose();
  } else if(e.key==='Escape'&&uiHelpOpen){
    uiHelpOpen=false; render();
  } else if(e.key==='Escape'&&shopVisibleNow()){
    uiShopOpen=false; render();
  } else if(e.key==='Escape'&&panelVisibleNow()){
    uiPanelOpen=false; render();
  } else if((e.key==='Escape'||e.key==='Enter')&&G.pending&&G.pending.type==='report'){
    actReportDone();
  }
});
