/* ═══════════════════════════ 중앙 액션 패널 · 액션바 ═══════════════════════════ */
/* ── 중앙 액션 패널 렌더 ──
   내 차례의 선택지를 화면 가운데에 모아 보여준다. 모든 버튼은 기존 actXxx/uiXxx 진입점만 호출한다.
   G.phase.hist(이번 단계 진행 내역)로 "봇들이 방금 무엇을 했는지"도 함께 보여준다. */
function panelHistHtml(F){
  const all=(F&&F.hist||[]);
  const items=all.slice(-4);   // 최근 4건만 — 줄이 계속 늘어나며 패널 내용이 밀리는 것을 막는다
  const rows=items.map((h,i)=>{
    const q=P(h.pi);
    const nm='<b style="color:'+PCOLOR[q.i]+'">'+esc(q.name)+'</b>';
    let inner='';
    if(h.kind==='skip') inner=nm+'<span class="dim">— 생략</span>';
    else if(h.kind==='farm')   inner=nm+'<span>— '+PLANT_NM[h.t]+' 농장 개척</span>';
    else if(h.kind==='deck')   inner=nm+'<span>— 대규모 농장: 더미에서 '+PLANT_NM[h.t]+'</span>';
    else if(h.kind==='quarry') inner=nm+'<span>— 채석장 개척</span>';
    else if(h.kind==='sell')   inner=nm+goodChip(h.t)+'<span>'+PLANT_NM[h.t]+' 판매</span><b>+'+h.coins+'주화</b>';
    else if(h.kind==='ship')   inner=nm+goodChip(h.t)+'<span>'+PLANT_NM[h.t]+' '+h.amt+'개 '+(h.wharf?'(조선소)':'('+h.ship+'칸 배)')+'</span><b>+'+h.vp+'점</b>';
    if(!inner) return '';
    // 마지막 줄(방금 일어난 일)은 슬라이드 인
    return '<div class="hrow'+(i===items.length-1?pfxCls('hist-last','pfx-row'):'')+'">'+inner+'</div>';
  }).join('');
  return rows?'<div class="ap-hist"><div class="ap-sec-h">이번 단계 진행'
    +(all.length>items.length?' <span class="dim">· 최근 '+items.length+'건</span>':'')
    +'</div>'+rows+'</div>':'';
}
/* 패널 내용을 부품({title, sub, btn, cls, body})으로 반환한다 — 배경 오버레이·창 스켈레톤은
   render()가 유지하며 제목·본문만 갈아끼운다 (통째로 다시 만들면 전환이 뚝뚝 끊겨 보인다) */
function renderActionPanel(pd){
  const p=(pd.player!==undefined)?P(pd.player):null; const F=G.phase;  // phaseEnd에는 행동할 사람이 없다
  let title='', body='';
  if(pd.type==='pickRole'){
    title='역할 선택';
    const cells=G.roles.map((r,i)=>{
      const R=ROLES[r.id];
      const open=(r.takenBy===null);
      const tile='<div class="role'+(open?' pickable':' taken')+'" '+(open?'onclick="pickRole('+pd.player+','+i+')"':'')+'>'
        +imgTag('역할',R.nm,'img')
        +'<div class="rolefb">'+R.rn+' '+R.nm+'<br><span>'+R.ph+'</span></div>'
        +(r.coins>0?'<div class="coin">'+r.coins+'</div>':'')
        +(r.takenBy!==null?'<div class="took" style="background:'+PCOLOR[r.takenBy]+'">'+esc(P(r.takenBy).name)+'</div>':'')
        +'</div>';
      return '<div class="ap-rolecell">'+tile
        +'<div class="ap-rolename">'+R.nm+'<span class="dim"> · '+R.ph+'</span></div>'
        +'<div class="ap-roledesc">'+esc(R.desc).replace(/\n/g,'<br>')+'</div>'
        +(r.coins>0?'<div class="ap-rolecoin">+ 타일 위 주화 '+r.coins+'개</div>':'')
        +'</div>';
    }).join('');
    // 하단: 각 플레이어 요약 — 접힌 카드와 같은 정보 (주화·승점·일꾼 / 농장 / 건물 / 상품)
    const pcards=G.players.map(q=>{
      const farm={}; for(const l of q.land) farm[l.type]=(farm[l.type]||0)+1;
      // 접힌 카드와 같은 순서: 채석장 → 상품 가격순 / 생산 → 상업 → 고급 (승점 오름차순)
      const farms=['quarry'].concat(GTYPES).filter(t=>farm[t]).map(t=>PLANT_NM[t]+'×'+farm[t]).join(' · ')||'—';
      const KORD={prod:0,com:1,big:2};
      const blds=[...q.buildings].sort((a,b)=>{
        const A=BUILDINGS[a.id],B2=BUILDINGS[b.id];
        return (KORD[A.kind]-KORD[B2.kind])||(A.vp-B2.vp)||(A.cost-B2.cost);
      }).map(b=>BUILDINGS[b.id].nm).join(' · ')||'—';
      const goods=GTYPES.filter(t=>q.goods[t]>0).map(t=>goodChip(t)+'×'+q.goods[t]).join(' ')||'—';
      return '<div class="ap-pcard" style="border-left:3px solid '+PCOLOR[q.i]+'">'
        +'<div class="nm" style="color:'+PCOLOR[q.i]+'">'+(q.ai?aosIcon('bot',12)+' ':'')+esc(q.name)+(G.governor===q.i?' 👑':'')+(q.i===pd.player?' (나)':'')+'</div>'
        // 접힌 개인 보드 카드와 같은 토큰 마크업(.cstat/.cpair) — 주화 $, 승점 VP, 일꾼 토큰
        +'<div class="cstat"><span class="cpair" title="주화"><span class="tok-coin sm">$</span><b>'+q.coins+'</b></span>'
        +'<span class="cpair" title="승점"><span class="tok-vp sm">VP</span><b>'+q.vp+'</b></span>'
        +'<span class="cpair" title="일꾼"><span class="wtok smw"></span><b>'+totalWorkersOf(q)+'</b></span></div>'
        +'<div class="sec">농장 '+q.land.length+'</div><div class="row">'+farms+'</div>'
        +'<div class="sec">건물 '+q.buildings.length+'</div><div class="row">'+blds+'</div>'
        +'<div class="sec">상품</div><div class="row">'+goods+'</div>'
        +'</div>';
    }).join('');
    body='<div class="ap-msg">수행할 역할을 클릭하세요. 모두가 그 행동을 하지만, <b>특별 혜택은 선택한 사람만</b> 얻습니다.</div>'
      +'<div class="ap-roles">'+cells+'</div>'
      +'<div class="ap-pstrip">'+pcards+'</div>';
  }
  else if(pd.type==='settler'){
    title='개척 — 타일 가져오기';
    const isC=(F.chooser===pd.player);
    const canQ=settlerCanQuarry(pd.player);
    // 채석장은 항상 맨 왼쪽, 농장과의 간격은 일반 간격(10px)의 3배(gap 10 + margin 20 = 30).
    // 타일은 전부 [그림+이름] 동일 구조 — 높이가 어긋나지 않게 부가 설명은 타일 밖(ap-msg)에 쓴다.
    let tiles='';
    if(canQ){
      tiles+='<div class="plant pickable" style="margin-right:20px" onclick="actSettler(\'quarry\')">'
        +'<div class="art" style="background:#8a857a33">'+imgTag('농장','채석장')+'</div>'
        +'<div class="lbl">채석장</div></div>';
    }
    tiles+=G.supply.display.map((t,i)=>{
      const g=GOODS[t];
      return '<div class="plant pickable" onclick="actSettler(\'display\','+i+')">'
        +'<div class="art" style="background:'+(g?g.color:'#888')+'22">'+imgTag('농장',PLANT_NM[t])+'</div>'
        +'<div class="lbl">'+PLANT_NM[t]+'</div></div>';
    }).join('');
    body='<div class="ap-msg">가져갈 타일을 클릭하세요. 내 토지 <b>'+p.land.length+'/12</b>칸'
      +(canQ?'<br>맨 왼쪽 <b>채석장</b>은 '+(isC?'개척자 혜택':'건설막 효과')+'으로 가져갈 수 있고, 건물 지을 때 비용을 깎아줍니다.':'')
      +'</div>'
      +'<div class="ap-tiles">'+(tiles||'<span class="dim">가져갈 수 있는 타일이 없습니다.</span>')+'</div>'
      +'<div class="ap-btns">'
      +(!pd.haciendaUsed && occB(p,'b_hac') && (G.supply.deck.length||G.supply.discard.length) && p.land.length<12
        ?'<button class="ap-opt" onclick="actSettler(\'deck\')">🌱 대규모 농장 — 뒷면 더미에서 1개 추가 배치</button>':'')
      +'<button class="ap-opt" onclick="actSettler(\'skip\')">이번엔 안 가져가기</button>'
      +'</div>'
      +panelHistHtml(F);
  }
  else if(pd.type==='mayorPlace'){
    title='모집 — 일꾼 배치';
    const empty=emptyCirclesOf(p);
    body='<div class="ap-stat"><span>배치할 일꾼 <b>'+p.stored+'</b>개</span><span>빈 원형 칸 <b>'+empty+'</b>곳</span></div>'
      +'<div class="ap-msg">보드의 농장·건물 타일을 클릭해 일꾼을 배치하거나 회수할 수 있습니다.<br>'
      +'빈 원형 칸이 남아 있으면 일꾼을 반드시 배치해야 합니다.</div>'
      +'<div class="ap-btns">'
      +'<button class="ap-opt" onclick="uiMayorAuto('+p.i+')">자동 배치</button>'
      +'<button class="ap-opt" onclick="uiTogglePanel()">보드에서 직접 배치</button>'
      +'<button class="ap-opt hot" onclick="uiMayorDone('+p.i+')">배치 완료</button>'
      +'</div>';
  }
  else if(pd.type==='craftBonus'){
    title='생산 단계';
    const myTurn=isLocalHuman(pd.player);
    const btns=myTurn
      ?'<div class="ap-msg" style="margin:8px 0 2px">생산자 혜택 — 방금 생산한 것 중 <b>1개</b>를 추가로 받으세요.</div>'
        +'<div class="ap-opts">'
        +F.bonusOptions.map(t=>'<button class="ap-opt hot" onclick="actCraftBonus(\''+t+'\')">'+goodChip(t)+PLANT_NM[t]+' 받기</button>').join('')
        +'</div>'
      :'';
    body='<div class="ap-msg">'+(myTurn
        ?'모두 생산을 마쳤습니다. 내 카드에서 <b>혜택 상품</b>을 고르세요.'
        :'모두 생산을 마쳤습니다. '+esc(p.name)+'이(가) 혜택 상품을 고르는 중…')+'</div>'
      +craftStageHtml(F.prod||[], {turnPi:pd.player, label:(myTurn?' — 내 차례':' — 혜택 선택 중…'), extra:btns});
  }
  else if(pd.type==='trader'){
    title='판매 단계';
    const myTurn=isLocalHuman(pd.player);
    const M=G.supply.market; const isC=(pd.player===F.chooser);
    const slots='<div class="ap-slots">'
      +M.map((t,i)=>'<div class="ap-slot'+pfxCls('mktslot-'+i,'pfx-pop')+'">'+goodChip(t)+'</div>').join('')
      +Array(4-M.length).fill('<div class="ap-slot"></div>').join('')
      +'</div>';
    const sellable=sellableTypes(p);
    const opts=GTYPES.filter(t=>p.goods[t]>0).map(t=>{
      if(sellable.includes(t))
        return '<button class="ap-opt hot" onclick="actTrade(\''+t+'\')">'+goodChip(t)+PLANT_NM[t]+' ×'+p.goods[t]
          +' <span class="gain">+'+saleCoins(p,t,isC)+'주화</span></button>';
      const why=(M.length>=4)?'상점 가득':'같은 종류가 이미 상점에';
      return '<div class="ap-opt no">'+goodChip(t)+PLANT_NM[t]+' ×'+p.goods[t]+' <span class="why">'+why+'</span></div>';
    }).join('');
    // 전원 카드 — 각자의 보유 상품. 내 차례인 내 카드만 판매 버튼
    const plist=G.players.map(q=>{
      const isTurn=(q.i===pd.player);
      let inner;
      if(myTurn&&isTurn){
        // 패스 버튼은 선택지 바로 아래에 — 패널 하단은 내용이 길면 잘려서 버튼이 안 보인다
        inner='<div class="ap-opts vert">'+(opts||'<span class="dim">보유 상품이 없습니다.</span>')
          +'<button class="ap-opt" onclick="actTrade(\'skip\')">이번엔 판매 안 함</button></div>';
      } else {
        const chips=GTYPES.filter(t=>q.goods[t]>0).map(t=>'<span class="ap-g">'+goodChip(t)+'×'+q.goods[t]+'</span>').join('')
          ||'<span class="dim">상품 없음</span>';
        inner='<div class="ap-prow">'+chips+'</div>';
      }
      return '<div class="ap-pl'+(isTurn?' turn':'')+pfxCls('plcard-'+q.i,'pfx-card')+'" style="--pc:'+PCOLOR[q.i]+'">'
        +'<div class="ap-pl-h" style="color:'+PCOLOR[q.i]+'">'+(q.ai?aosIcon('bot',12)+' ':'')+esc(q.name)
        +(isTurn?(myTurn?' — 내 차례':' — 판매 중…'):'')+'</div>'
        +inner+'</div>';
    }).join('');
    body='<div class="ap-msg">'+(myTurn
        ?'판매할 상품을 클릭하세요 (1개만 판매). 옥수수는 0주화지만 팔 수 있습니다.'
        :'차례대로 상점에 상품을 1개씩 판매합니다.')
      +'<br><span class="dim">상점엔 같은 종류를 놓을 수 없고(영업소 예외), 가득 차면 단계 끝에 비워집니다.</span></div>'
      +'<div class="ap-cols">'
      +'<div class="ap-col"><div class="ap-col-h">① 플레이어 상품</div>'
        +'<div class="ap-pls">'+plist+'</div>'
      +'</div>'
      +'<div class="ap-col"><div class="ap-col-h">② 상점 (최대 4칸)</div>'+slots+'</div>'
      +'</div>'
      +panelHistHtml(F);
  }
  else if(pd.type==='captain'){
    title='선적 단계';
    const myTurn=isLocalHuman(pd.player);
    // 내 차례에만 인터랙션: 상품을 고른다 (배로든 조선소로든 실을 수 있는 것만 클릭 가능)
    const shippable=t=>pd.opts.some(o=>o.type===t)||(pd.wharfOK&&p.goods[t]>0);
    // 이전 결정의 선택이 남아 있으면(차례가 돌아온 경우) 무효화
    const selT=(myTurn&&uiShipSel&&p.goods[uiShipSel]>0&&shippable(uiShipSel))?uiShipSel:null;
    const bestLoad=t=>{
      const loads=pd.opts.filter(o=>o.type===t).map(o=>o.load);
      let m=loads.length?Math.max(...loads):0;
      if(pd.wharfOK) m=Math.max(m,p.goods[t]);
      return m;
    };
    const goodsBtns=GTYPES.filter(t=>p.goods[t]>0).map(t=>{
      if(shippable(t))
        return '<button class="ap-opt'+(selT===t?' on':' hot')+'" onclick="uiSelectShipGood(\''+t+'\')">'
          +goodChip(t)+PLANT_NM[t]+' ×'+p.goods[t]+(selT===t?' ✓':'')
          +'<span class="gain">최대 '+bestLoad(t)+'개 선적</span></button>';
      const sOfT=G.supply.ships.find(s=>s.type===t);
      const why=sOfT?'실린 배가 가득 참':'놓을 수 있는 배 없음';
      return '<div class="ap-opt no">'+goodChip(t)+PLANT_NM[t]+' ×'+p.goods[t]+' <span class="why">'+why+'</span></div>';
    }).join('');
    // 전원 카드 — 각자의 보유 상품. 내 차례인 내 카드만 버튼, 나머지는 현황 표시
    const plist=G.players.map(q=>{
      const isTurn=(q.i===pd.player);
      let inner;
      if(myTurn&&isTurn){
        // 넘기기 버튼도 선택지 바로 아래에 — 패널 하단은 내용이 길면 잘려서 버튼이 안 보인다
        inner='<div class="ap-opts vert">'+(goodsBtns||'<span class="dim">보유 상품이 없습니다.</span>')
          +(pd.mayPass?'<button class="ap-opt" onclick="actCaptain(\'pass\')">넘기기</button>':'')
          +'</div>';
      } else {
        const chips=GTYPES.filter(t=>q.goods[t]>0).map(t=>'<span class="ap-g">'+goodChip(t)+'×'+q.goods[t]+'</span>').join('')
          ||'<span class="dim">상품 없음</span>';
        inner='<div class="ap-prow">'+chips+'</div>';
      }
      return '<div class="ap-pl'+(isTurn?' turn':'')+pfxCls('plcard-'+q.i,'pfx-card')+'" style="--pc:'+PCOLOR[q.i]+'">'
        +'<div class="ap-pl-h" style="color:'+PCOLOR[q.i]+'">'+(q.ai?aosIcon('bot',12)+' ':'')+esc(q.name)
        +(isTurn?(myTurn?' — 내 차례':' — 선적 중…'):'')+'</div>'
        +inner+'</div>';
    }).join('');
    // ② 오른쪽 — 수송선: 상품을 고르면 실을 수 있는 배가 버튼이 되고, 안 되는 배는 이유를 보여준다.
    // 카드마다 적재 칸을 그대로 그려서(실린 칸 = 상품 토큰, 실릴 칸 = 강조 미리보기) 상태를 한눈에 보여준다.
    const slotsOf=(s,si,pvLoad)=>{
      let out='';
      for(let i=0;i<s.size;i++){
        if(i<s.count) out+='<span class="ap-shipslot'+pfxCls('shipslot-'+si+'-'+i,'pfx-pop')+'">'+goodChip(s.type)+'</span>';
        else if(pvLoad&&i<s.count+pvLoad) out+='<span class="ap-shipslot pv">'+goodChip(selT)+'</span>';
        else out+='<span class="ap-shipslot"></span>';
      }
      return '<div class="ap-shipslots">'+out+'</div>';
    };
    const ships=G.supply.ships.map((s,si)=>{
      const shipFx=pfxCls('ship-'+si,'pfx-card');
      const name='<b>'+s.size+'칸 수송선</b>'
        +(s.type?'<span class="cnt">'+PLANT_NM[s.type]+' '+s.count+'/'+s.size+'</span>':'<span class="free">비어 있음</span>');
      if(!selT) return '<div class="ap-ship'+shipFx+'"><div class="hd">'+name+'</div>'+slotsOf(s,si)+'</div>';
      const oi=pd.opts.findIndex(o=>o.type===selT&&o.ship===si);
      if(oi>=0){
        const o=pd.opts[oi]; const vp=captainVPPreview(p,pd.player,o.load);
        return '<button class="ap-ship pick'+shipFx+'" onclick="actCaptain(\'ship\','+oi+')">'
          +'<div class="hd">'+name+'<span class="gain">'+o.load+'개 싣기 → +'+vp+'점</span></div>'
          +slotsOf(s,si,o.load)+'</button>';
      }
      let why;
      if(s.type&&s.type!==selT) why='다른 상품 전용';
      else if(s.count>=s.size) why='가득 참';
      else if(!s.type&&G.supply.ships.some(o2=>o2!==s&&o2.type===selT)) why='이미 다른 배에 실림';
      else why='더 많이 실을 수 있는 배가 있음';   // 규칙: 가장 많이 실리는 배를 골라야 한다
      return '<div class="ap-ship dim'+shipFx+'"><div class="hd">'+name+'<span class="why">'+why+'</span></div>'+slotsOf(s,si)+'</div>';
    }).join('');
    // 조선소도 "배" 하나로 취급 — 상품을 고르면 선택지가 된다 (내 차례에만 표시)
    let wharfCard='';
    if(pd.wharfOK&&myTurn){
      if(selT){
        const amt=p.goods[selT]; const vp=captainVPPreview(p,pd.player,amt);
        const pv='<div class="ap-shipslots">'+Array(amt).fill('<span class="ap-shipslot pv">'+goodChip(selT)+'</span>').join('')+'</div>';
        wharfCard='<button class="ap-ship pick" onclick="actCaptain(\'wharf\',\''+selT+'\')">'
          +'<div class="hd"><b>조선소</b><span class="cnt">가상의 수송선</span><span class="gain">'+amt+'개 전부 → +'+vp+'점</span></div>'
          +pv+'</button>';
      } else {
        wharfCard='<div class="ap-ship"><div class="hd"><b>조선소</b><span class="free">가상의 수송선 · 단계당 1회 · 칸 무제한</span></div></div>';
      }
    }
    body='<div class="ap-msg">'+(myTurn
        ?(pd.mayPass
          ?'선적할 수 있는 배가 없습니다. 조선소를 쓰거나 넘길 수 있습니다.'
          :'<b>선적은 의무입니다.</b> ① 내 카드에서 <b>상품</b>을 고르고 ② 오른쪽에서 <b>실을 배</b>를 고르세요. 실은 개수만큼 승점을 얻습니다.')
        :'차례대로 상품을 수송선에 싣습니다. 더 이상 아무도 실을 수 없을 때까지 계속됩니다.')
      +'<br><span class="dim">배마다 한 종류만 실리며, 이미 다른 배에 실린 종류는 실을 수 없습니다.</span></div>'
      +'<div class="ap-cols">'
      +'<div class="ap-col"><div class="ap-col-h">① 플레이어 상품</div>'
        +'<div class="ap-pls">'+plist+'</div>'
      +'</div>'
      +'<div class="ap-col"><div class="ap-col-h">② 수송선</div>'
        +'<div class="ap-ships vert">'+ships+wharfCard+'</div>'
      +'</div>'
      +'</div>'
      +panelHistHtml(F);
  }
  else if(pd.type==='storage'){
    title='선적 단계 — 상품 저장';
    const myTurn=isLocalHuman(pd.player);
    const cap=pd.cap; const sel=storeSel();
    const types=GTYPES.filter(t=>p.goods[t]>0);
    // 내 카드 안에 들어가는 저장 선택기
    let picker='';
    if(myTurn){
      const drops=[];
      for(const t of types){
        const keep=sel.types.includes(t)?p.goods[t]:(sel.single===t?1:0);
        if(p.goods[t]-keep>0) drops.push(PLANT_NM[t]+' '+(p.goods[t]-keep));
      }
      picker='<div class="ap-msg" style="margin:8px 0 2px">'+(cap>0
          ?'창고 <b>'+cap+'종류</b> 전부 + 낱개 <b>1개</b>만 저장 — 나머지는 반납됩니다.'
          :'창고가 없어 <b>낱개 1개</b>만 저장할 수 있습니다 — 나머지는 반납됩니다.')+'</div>'
        +(cap>0?'<div class="ap-opts">'
          +types.map(t=>'<button class="ap-opt'+(sel.types.includes(t)?' on':'')+'" onclick="uiStoreType(\''+t+'\')">'
            +goodChip(t)+PLANT_NM[t]+' 전부('+p.goods[t]+')</button>').join('')+'</div>':'')
        +'<div class="ap-opts" style="margin-top:6px">'
        +types.map(t=>'<button class="ap-opt'+(sel.single===t?' on':'')+'" onclick="uiStoreSingle(\''+t+'\')">'
          +goodChip(t)+'낱개 1개</button>').join('')+'</div>'
        +'<div class="ap-msg" style="margin:8px 0 2px">'+(drops.length?'반납: <b>'+drops.join(', ')+'</b>':'모든 상품이 저장됩니다.')+'</div>'
        +'<div class="ap-opts"><button class="ap-opt hot" onclick="uiStoreDone()">저장 확정</button></div>';
    }
    const plist=G.players.map(q=>{
      const isTurn=(q.i===pd.player);
      const chips=GTYPES.filter(t=>q.goods[t]>0).map(t=>'<span class="ap-g">'+goodChip(t)+'×'+q.goods[t]+'</span>').join('')
        ||'<span class="dim">상품 없음</span>';
      return '<div class="ap-pl'+(isTurn?' turn':'')+pfxCls('plcard-'+q.i,'pfx-card')+'" style="--pc:'+PCOLOR[q.i]+'">'
        +'<div class="ap-pl-h" style="color:'+PCOLOR[q.i]+'">'+(q.ai?aosIcon('bot',12)+' ':'')+esc(q.name)
        +(isTurn?(myTurn?' — 내 차례':' — 저장 정리 중…'):'')+'</div>'
        +'<div class="ap-prow">'+chips+'</div>'
        +(isTurn&&myTurn?picker:'')
        +'</div>';
    }).join('');
    const shipCards=G.supply.ships.map(s=>
      '<div class="ap-ship"><div class="hd"><b>'+s.size+'칸 수송선</b>'
      +(s.type?'<span class="cnt">'+PLANT_NM[s.type]+' '+s.count+'/'+s.size+'</span>':'<span class="free">비어 있음</span>')
      +'</div>'+shipSlotsHtml(s)+'</div>').join('');
    body='<div class="ap-msg">'+(myTurn
        ?'선적이 끝났습니다. 저장 한도를 넘는 상품을 정리하세요.'
        :'선적이 끝났습니다. '+esc(p.name)+'이(가) 상품 저장을 정리하는 중…')
      +'<br><span class="dim">기본 1개 + 창고 종류만큼 저장할 수 있고, 나머지는 반납됩니다.</span></div>'
      +'<div class="ap-cols">'
      +'<div class="ap-col"><div class="ap-col-h">① 플레이어 상품</div><div class="ap-pls">'+plist+'</div></div>'
      +'<div class="ap-col"><div class="ap-col-h">② 수송선</div><div class="ap-ships vert">'+shipCards+'</div></div>'
      +'</div>';
  }
  else if(pd.type==='phaseEnd'){
    // 단계 마무리 일시정지 — 마지막 행동이 반영된 진행 상황을 잠깐 보여준 뒤(schedule의 PHASE_END_HOLD)
    // 결과 창으로 넘어간다. 버튼 없는 관전용 화면이므로 pd에 행동 정보가 없어도 그릴 수 있어야 한다.
    const F2=G.phase||{};
    if(pd.id==='craft'){
      title='생산 단계';
      body='<div class="ap-msg">모두 생산을 마쳤습니다…</div>'
        +craftStageHtml(F2.prod||[], F2.bonusTaken?{turnPi:F2.bonusPi, extra:'<div class="ap-prow"><span class="dim">생산자 혜택</span><span class="ap-g">'+goodChip(F2.bonusTaken)+'+1</span></div>'}:{});
    } else if(pd.id!=='captain'&&pd.id!=='trader'){
      // 개척·모집·건설 마무리(0.3초) — 보통 패널이 닫혀 있지만, 열어둔 채라면 간단한 안내만
      title={settler:'개척 단계',mayor:'모집 단계',builder:'건설 단계'}[pd.id]||'단계 마무리';
      body='<div class="ap-msg">단계가 끝났습니다. 다음 역할 선택으로 넘어갑니다…</div>'+panelHistHtml(F2);
    } else {
      title=(pd.id==='captain')?'선적 단계':'판매 단계';
      const plist=G.players.map(q=>{
        const chips=GTYPES.filter(t=>q.goods[t]>0).map(t=>'<span class="ap-g">'+goodChip(t)+'×'+q.goods[t]+'</span>').join('')
          ||'<span class="dim">상품 없음</span>';
        return '<div class="ap-pl'+pfxCls('plcard-'+q.i,'pfx-card')+'" style="--pc:'+PCOLOR[q.i]+'">'
          +'<div class="ap-pl-h" style="color:'+PCOLOR[q.i]+'">'+(q.ai?aosIcon('bot',12)+' ':'')+esc(q.name)+'</div>'
          +'<div class="ap-prow">'+chips+'</div></div>';
      }).join('');
      // 방금 실린 칸의 팝 이펙트(markPanelFx)가 이 화면에서 재생된다 — 진행 패널과 같은 마크업
      const slotsOf=(s,si)=>{
        let out='';
        for(let i=0;i<s.size;i++)
          out+= i<s.count?'<span class="ap-shipslot'+pfxCls('shipslot-'+si+'-'+i,'pfx-pop')+'">'+goodChip(s.type)+'</span>':'<span class="ap-shipslot"></span>';
        return '<div class="ap-shipslots">'+out+'</div>';
      };
      const right=(pd.id==='captain')
        ?'<div class="ap-ships vert">'+G.supply.ships.map((s,si)=>
            '<div class="ap-ship'+pfxCls('ship-'+si,'pfx-card')+'"><div class="hd"><b>'+s.size+'칸 수송선</b>'
            +(s.type?'<span class="cnt">'+PLANT_NM[s.type]+' '+s.count+'/'+s.size+'</span>':'<span class="free">비어 있음</span>')
            +'</div>'+slotsOf(s,si)+'</div>').join('')+'</div>'
        :'<div class="ap-slots">'
          +G.supply.market.map((t,i)=>'<div class="ap-slot'+pfxCls('mktslot-'+i,'pfx-pop')+'">'+goodChip(t)+'</div>').join('')
          +Array(4-G.supply.market.length).fill('<div class="ap-slot"></div>').join('')+'</div>';
      body='<div class="ap-msg">'+(pd.id==='captain'?'모두 선적을 마쳤습니다…':'모두 판매를 마쳤습니다…')+'</div>'
        +'<div class="ap-cols">'
        +'<div class="ap-col"><div class="ap-col-h">① 플레이어 상품</div><div class="ap-pls">'+plist+'</div></div>'
        +'<div class="ap-col"><div class="ap-col-h">② '+(pd.id==='captain'?'수송선':'상점 (최대 4칸)')+'</div>'+right+'</div>'
        +'</div>'
        +panelHistHtml(F2);
    }
  }
  // stage(선적·판매): 단계 내내 떠 있으므로 높이를 고정 — 내용이 바뀌어도 패널 크기가 출렁이지 않게
  return {
    title,
    sub: (p?'<span class="ap-sub" style="color:'+PCOLOR[p.i]+'">'+esc(p.name)+' 차례</span>':'<span class="ap-sub">단계 마무리…</span>'),
    btn: '<button class="btn-ghost" onclick="uiTogglePanel()">닫기 ✕</button>',
    cls: (pd.type==='pickRole'?' wide':'')+((pd.type==='captain'||pd.type==='storage'||pd.type==='trader'||pd.type==='craftBonus'||pd.type==='phaseEnd')?' stage':''),
    body,
  };
}

function renderActionBar(pd){
  const p=P(pd.player);
  const who='<span class="who">'+esc(p.name)+'</span>';
  let msg='', btns='';
  if(pd.type==='pickRole'){
    msg='역할 타일을 선택하세요.';
  }
  else if(pd.type==='settler'){
    msg='공개된 농장을 클릭해 가져가세요.';
    if(!pd.haciendaUsed && occB(p,'b_hac') && (G.supply.deck.length||G.supply.discard.length) && p.land.length<12)
      btns+='<button onclick="actSettler(\'deck\')">대규모 농장: 더미에서 1개</button>';
    if(settlerCanQuarry(pd.player))
      btns+='<button class="hot" onclick="actSettler(\'quarry\')">채석장 가져가기</button>';
    btns+='<button onclick="actSettler(\'skip\')">생략</button>';
  }
  else if(pd.type==='mayorPlace'){
    msg='타일을 클릭해 일꾼을 배치/회수하세요. 보관 일꾼: <b>'+p.stored+'</b>';
    btns+='<button onclick="uiMayorAuto('+p.i+')">자동 배치</button>';
    btns+='<button class="hot" onclick="uiMayorDone('+p.i+')">배치 완료</button>';
  }
  else if(pd.type==='builder'){
    msg='건설할 건물을 클릭하세요. (빨간 테두리 = 건설 가능'+(pd.player===G.phase.chooser?' · 혜택 -1주화':'')+')';
    btns+='<button onclick="uiToggleShop()">'+(shopVisibleNow()?'건물 닫기':'건물 보기')+'</button>';
    btns+='<button onclick="actBuild(\'skip\')">생략</button>';
  }
  else if(pd.type==='craftBonus'){
    msg='생산자 혜택 — 추가로 받을 상품을 고르세요.';
    for(const t of G.phase.bonusOptions)
      btns+='<button class="hot" onclick="actCraftBonus(\''+t+'\')">'+PLANT_NM[t]+'</button>';
  }
  else if(pd.type==='trader'){
    msg='판매할 상품을 고르세요.';
    for(const t of sellableTypes(p))
      btns+='<button class="hot" onclick="actTrade(\''+t+'\')">'+PLANT_NM[t]+' (+'+saleCoins(p,t,pd.player===G.phase.chooser)+'주화)</button>';
    btns+='<button onclick="actTrade(\'skip\')">생략</button>';
  }
  else if(pd.type==='captain'){
    msg=pd.mayPass?'선적할 배가 없습니다. 조선소를 사용할 수 있습니다.':'선적은 의무입니다 — 선택하세요.';
    pd.opts.forEach((o,i)=>{
      btns+='<button class="hot" onclick="actCaptain(\'ship\','+i+')">'+PLANT_NM[o.type]+' '+o.load+'개 → '+G.supply.ships[o.ship].size+'칸 배</button>';
    });
    if(pd.wharfOK){
      for(const t of GTYPES) if(p.goods[t]>0)
        btns+='<button onclick="actCaptain(\'wharf\',\''+t+'\')">조선소: '+PLANT_NM[t]+' '+p.goods[t]+'개 전부</button>';
    }
    if(pd.mayPass) btns+='<button onclick="actCaptain(\'pass\')">넘기기</button>';
  }
  else if(pd.type==='storage'){
    const cap=pd.cap;
    const sel=storeSel();
    const types=GTYPES.filter(t=>p.goods[t]>0);
    msg=cap>0
      ?'저장 한도 초과 — 창고 저장 종류 <b>'+cap+'</b>개 + 낱개 1개를 고르세요.'
      :'저장 한도 초과 — 창고가 없어 <b>낱개 1개</b>만 남길 수 있습니다.';
    // 종류 보관 버튼은 창고가 있을 때만 — 없는데 그리면 보관할 수 있는 것처럼 보인다 (눌러도 무반응)
    if(cap>0) for(const t of types){
      const on=sel.types.includes(t);
      btns+='<button style="'+(on?'background:#4e8c46;border-color:#4e8c46':'')+'" onclick="uiStoreType(\''+t+'\')">'
        +(on?'✓ ':'')+PLANT_NM[t]+' 전부('+p.goods[t]+')</button>';
    }
    for(const t of types){
      const on=sel.single===t;
      btns+='<button style="'+(on?'background:#9a7b2f;border-color:#9a7b2f':'')+'" onclick="uiStoreSingle(\''+t+'\')">'
        +(on?'✓ ':'')+'낱개: '+PLANT_NM[t]+'</button>';
    }
    btns+='<button class="hot" onclick="uiStoreDone()">확정</button>';
  }
  // 중앙 액션 패널이 있는 단계는 어디서든 다시 열 수 있게 토글 버튼을 함께 둔다
  if(PANEL_TYPES[pd.type]) btns='<button onclick="uiTogglePanel()">'+(panelVisibleNow()?'패널 닫기':'선택 패널 열기')+'</button>'+btns;
  return '<div class="actionbar"><div class="inner">'+who+'<span class="msg">'+msg+'</span><div class="btns">'+btns+'</div></div></div>';
}
