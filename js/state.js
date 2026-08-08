/* ═══════════════════════════ 게임 상태 ═══════════════════════════ */
let G = null;           // 게임 상태 (JSON 직렬화 가능)
let uiSel = null;       // 임시 UI 선택 상태 (모집 배치 등)
/* 저장 단계의 선택 상태는 G에 없는 뷰 상태다 — 저장 단계에서 새로고침해 게임을 복구하면
   pending은 'storage'인데 uiSel은 null이라, 렌더가 uiSel.types를 읽다가 통째로 죽었다
   (화면에 배경만 남는 증상). 그래서 읽는 쪽에서 없으면 만들어 쓴다. */
function storeSel(){ if(!uiSel || !Array.isArray(uiSel.types)) uiSel={types:[], single:null}; return uiSel; }

function playerCountSetup(n){
  if (n===2) return { coins:3, vp:65, workers:40, market:2, ships:[4,6],
    startPlants:['fruit','corn'], removePerType:3, removeGoods:2, quarries:5,
    roles:['settler','mayor','builder','craftsman','trader','captain','prospector'],
    comCount:1, prodCount:2, picksEach:3 };
  if (n===3) return { coins:2, vp:75, workers:55, market:3, ships:[4,5,6],
    startPlants:['fruit','fruit','corn'], removePerType:0, removeGoods:0, quarries:8,
    roles:['settler','mayor','builder','craftsman','trader','captain'],
    comCount:2, prodCount:0, picksEach:1 };
  if (n===4) return { coins:3, vp:100, workers:75, market:4, ships:[5,6,7],
    startPlants:['fruit','fruit','corn','corn'], removePerType:0, removeGoods:0, quarries:8,
    roles:['settler','mayor','builder','craftsman','trader','captain','prospector'],
    comCount:2, prodCount:0, picksEach:1 };
  return { coins:4, vp:126, workers:95, market:5, ships:[6,7,8],
    startPlants:['fruit','fruit','fruit','corn','corn'], removePerType:0, removeGoods:0, quarries:8,
    roles:['settler','mayor','builder','craftsman','trader','captain','prospector','prospector2'],
    comCount:2, prodCount:0, picksEach:1 };
}

function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

function newGame(seats){
  const n = seats.length, cfg = playerCountSetup(n);
  // 농장 더미
  const deckCount = { coffee:8, tobacco:9, corn:10, sugar:11, fruit:12 };
  const goodsSup  = { coffee:9, tobacco:9, corn:10, sugar:11, fruit:11 };
  if (cfg.removePerType){ for(const t of GTYPES) deckCount[t]-=cfg.removePerType; }
  if (cfg.removeGoods){ for(const t of GTYPES) goodsSup[t]-=cfg.removeGoods; }
  let deck=[]; for(const t in deckCount) for(let i=0;i<deckCount[t];i++) deck.push(t);
  shuffle(deck);
  // 시작 농장 제거
  for (const t of cfg.startPlants){ deck.splice(deck.indexOf(t),1); }
  // 건물 재고
  const stock={};
  for(const id of BORDER){
    const b=BUILDINGS[id];
    if (b.kind==='big') stock[id]=1;
    else if (b.kind==='prod'){
      if (n===2) stock[id]=2;
      else stock[id] = (id==='b_tobacco'||id==='b_coffee') ? 3 : (id.endsWith('_l')?3:4);
    } else stock[id] = (n===2)?1:2;
  }
  // 첫 주지사는 무작위 — 시작 농장은 주지사부터 시계 방향 순서(규칙서)로 배분
  const gov = Math.floor(Math.random()*n);
  G = {
    n, round:1, governor:gov, over:false, endReasons:[], scores:null,
    players: seats.map((s,i)=>({
      i, name:s.name, ai:s.ai,
      coins:cfg.coins, vp:0,
      goods:{corn:0,fruit:0,sugar:0,tobacco:0,coffee:0},
      land:[{type:cfg.startPlants[(i-gov+n)%n], w:0}],
      buildings:[], stored:0,
    })),
    supply:{ workers:cfg.workers, vp:cfg.vp, goods:goodsSup, quarries:cfg.quarries,
      deck, discard:[], display:[], stock,
      ships: cfg.ships.map(sz=>({size:sz,type:null,count:0})),
      labor: cfg.market, market:[] },
    roles: cfg.roles.map(id=>({id,coins:0,takenBy:null})),
    picksEach: cfg.picksEach,
    chooserQueue:[], chooserIdx:0,
    phase:null, pending:null,
    log:[],
  };
  // 초기 농장 공개 (인원+1)
  refillDisplay();
  log('<span class="r">게임 시작</span> — '+n+'인 · 승점 칩 '+cfg.vp+'점 · 일꾼 '+cfg.workers+'개');
  startRound();
}

function refillDisplay(){
  const S=G.supply, need=G.n+1;
  S.discard.push(...S.display); S.display=[];
  while(S.display.length<need){
    if(!S.deck.length){
      if(!S.discard.length) break;
      S.deck=shuffle(S.discard.splice(0));
    }
    S.display.push(S.deck.pop());
  }
}

/* ═══════════════════════════ 유틸 ═══════════════════════════ */
const P = i => G.players[i];
function log(html){ G.log.push(html); if(G.log.length>400) G.log.shift(); }
function pname(p){ return '<b style="color:'+PCOLOR[p.i]+'">'+esc(p.name)+'</b>'; }
function occupied(b){ return b.w>0; }
function hasB(p,id){ return p.buildings.some(b=>b.id===id); }
function occB(p,id){ const b=p.buildings.find(b=>b.id===id); return b&&b.w>0; }
function sitesUsed(p){ return p.buildings.reduce((s,b)=>s+(BUILDINGS[b.id].size||1),0); }
function goodsTotal(p){ return GTYPES.reduce((s,t)=>s+p.goods[t],0); }
function order(from){ const o=[]; for(let k=0;k<G.n;k++) o.push((from+k)%G.n); return o; }
function giveVP(p,amt){
  if(amt<=0) return;
  const got=Math.min(amt,G.supply.vp);
  G.supply.vp-=got; p.vp+=amt; // 칩 부족분도 기록(규칙: 종이에 기록)
  if(G.supply.vp===0 && !G.endReasons.includes('vp')){ G.endReasons.push('vp'); log('⚠️ 승점 칩이 바닥났습니다 — 이번 라운드가 끝나면 게임이 종료됩니다.'); }
}
function takeWorkerSupplyFirst(){ // 병원/학교용: 공급처 → 인력시장 → 없음
  if(G.supply.workers>0){ G.supply.workers--; return true; }
  if(G.supply.labor>0){ G.supply.labor--; return true; }
  return false;
}
