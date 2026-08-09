/* ═══════════════════════════ 렌더링 ═══════════════════════════ */
const $app=document.getElementById('app');

/* ── 부분 렌더 인프라 ──
   render()는 여전히 매번 모든 섹션의 HTML 문자열을 새로 만들지만, DOM에는 "문자열이 지난번과
   달라진 섹션"만 써넣는다. 안 바뀐 섹션은 건드리지 않으므로 진행 중인 CSS 애니메이션이 안 끊기고,
   이미지가 다시 그려지지 않으며, 호버 상태가 유지된다. AI 턴처럼 렌더가 잦은 구간의 끊김이 이걸로 사라진다.
   섹션을 새로 추가할 때는 스켈레톤에 컨테이너를 만들고 setPart(id, html)로 채울 것. */
let rdCache={};        // 섹션 id → 마지막으로 써넣은 HTML 문자열
/* 중앙 액션 패널 스켈레톤 — 패널이 떠 있는 동안 이 배경·창은 재사용되고 head/body만 교체된다 */
const AP_SKEL='<div class="overlay panel-ov" id="ap-ov" onclick="uiPanelBg(event)">'
  +'<div class="modal" id="ap-modal"><div class="shop-modal-h" id="ap-head"></div><div id="ap-bodyc"></div></div></div>';
let rdBoards=[];       // 플레이어 보드별 HTML 문자열 (인원수만큼)
let rdSkeleton=false;  // $app 안에 게임 스켈레톤이 세워져 있는가
function rdReset(){ rdCache={}; rdBoards=[]; rdSkeleton=false; }
function setPart(id, html){
  if(rdCache[id]===html) return false;
  rdCache[id]=html;
  const el=document.getElementById(id);
  if(el) el.innerHTML=html;
  return true;
}
function setCls(id, cls){
  if(rdCache['cls:'+id]===cls) return;
  rdCache['cls:'+id]=cls;
  const el=document.getElementById(id);
  if(el) el.className=cls;
}
/* 플레이어 보드: 바뀐 보드만 통째로 교체 (자리 수는 게임 중 불변) */
function setBoards(parts){
  const cont=document.getElementById('rd-players');
  if(!cont) return;
  if(cont.children.length!==parts.length){
    cont.innerHTML=parts.join('');
  } else {
    for(let i=0;i<parts.length;i++){
      if(rdBoards[i]!==parts[i]){
        const tmp=document.createElement('div');
        tmp.innerHTML=parts[i];
        cont.replaceChild(tmp.firstElementChild, cont.children[i]);
      }
    }
  }
  rdBoards=parts;
}
/* 상품 토큰: 글자 없이 색으로만. 이름이 필요한 곳은 옆에 텍스트로 쓴다. */
function goodChip(t){
  const g=GOODS[t];
  return '<span class="goodchip" style="--gc:'+g.color+'" title="'+g.nm+'"></span>';
}
function esc(s){ return String(s).replace(/</g,'&lt;'); }
function escAttr(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }
/* 툴팁 문구 — 건물 상점·플레이어 보드 양쪽에서 같은 설명을 쓴다 */
function buildingTip(B){
  const bits=[B.nm+' — '+B.cost+'주화 · 승점 '+B.vp+(B.size===2?' · 부지 2칸':'')];
  if(B.kind==='prod') bits.push(PLANT_NM[B.prod]+' 생산 · 일꾼 '+B.slots+'칸');
  if(B.fx) bits.push(B.fx);
  return bits.join('\n');
}

/* ── 설정 화면 (aos_showcase 스타일: 히어로 + 좌 비주얼 / 우 설정 카드) ── */
/* 기본 이름도 1897 카리브 정서로 — 접속할 때마다 농장주 이름 하나를 뽑아 준다 */
const PR_NAMES=['페드로','이사벨라','알론소','루시아','라몬','카탈리나'];
let setupName=PR_NAMES[Math.floor(Math.random()*PR_NAMES.length)];
let setupN=4;
/* 좌석 0=나 고정. 탭별 기본이 다르다 — 로컬은 봇과 혼자, 온라인은 친구 초대가 기본 (사용자 결정) */
let setupKinds=['me','ai','ai','ai','ai'];            // 로컬 탭
let setupKindsOn=['me','human','human','human','human'];  // 온라인 탭
function curSetupKinds(){ return setupMode==='online'?setupKindsOn:setupKinds; }
function uiSetupCount(n){ setupN=n; renderSetup(); }
function uiSetupToggle(i){ const k=curSetupKinds(); k[i]=(k[i]==='ai')?'human':'ai'; renderSetup(); }
/* ═══ 설정·대기실 — aos_showcase의 설정 카드(GamePageClient) + OnlineLobby를 그대로 이식 ═══
   디자인 토큰까지 동일: 페이지 #efece4 · 카드 #faf8f3 (r18px) · 버밀리언 #c04a2b · 잉크 #1c1b18.
   이 화면들에서는 게임의 양피지 배경·프레임을 끈다(body.aos-setup — aosFrame이 켜고, 게임 render()가 끈다). */
let setupMode='online';   // 온라인 멀티가 기본 탭 (사용자 결정)
let setupPublic=true;     // 방 공개가 기본 — 공개방 목록에 노출, 스위치로 비공개 전환
let setupTitle='';
function uiSetupMode(m){
  if(typeof NET!=='undefined'&&NET.on){ if(m==='local') uiNetLeave(); return; }
  setupMode=m; renderSetup();
}
function uiSetupPublic(){ setupPublic=!setupPublic; renderSetup(); }
/* 공개방 목록 8초 폴링 — 온라인 폼이 보이는 동안만 (쇼케이스와 같은 주기) */
let pubT=0;
function pubPoll(){
  clearTimeout(pubT);
  if(setupMode!=='online'||typeof NET==='undefined'||NET.on||!netConfigured()||!document.getElementById('aos-publist')) return;
  netListPublicRooms().then(()=>{
    const el=document.getElementById('aos-publist');
    if(el){ el.innerHTML=pubListHtml(); pubT=setTimeout(pubPoll, 8000); }
  });
}
function pubListHtml(){
  const rooms=(typeof NET!=='undefined'&&NET.pubRooms)||[];
  if(!rooms.length) return '<div class="aos-dim center" style="text-align:center;padding:10px 0">대기 중인 공개방이 없습니다</div>';
  return rooms.map(r=>{
    const seated=r.seats.filter(s=>s.kind==='human'&&s.clientId).length;
    const aiN=r.seats.filter(s=>s.kind==='ai').length;
    const full=!r.seats.some(s=>s.kind==='human'&&!s.clientId);
    return '<div class="aos-pubroom">'
      +'<div class="inf"><div class="t">'+esc(r.title||r.code)+'</div>'
      +'<div class="d">'+(seated+aiN)+'/'+r.seats.length+'명'+(aiN>0?' (AI '+aiN+')':'')+'</div></div>'
      +'<button class="aos-pubjoin"'+(full?' disabled':'')+' onclick="netJoinRoom(\''+esc(r.code)+'\', (setupName||\'게스트\').trim())">'+(full?'만석':'입장')+'</button>'
      +'</div>';
  }).join('');
}
/* lucide 아이콘 (MIT) — 쇼케이스가 쓰는 것과 같은 세트를 인라인 SVG로 */
function aosIcon(n,s,fill){
  const P={
    crown:'<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.735H5.81a1 1 0 0 1-.957-.735L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>',
    star:'<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
    user:'<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    bot:'<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
    wifi:'<path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.859a10 10 0 0 1 14 0"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/>',
    wifioff:'<path d="M12 20h.01"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/><path d="M5 12.859a10 10 0 0 1 5.17-2.69"/><path d="M19 12.859a10 10 0 0 0-2.007-1.523"/><path d="M2 8.82a15 15 0 0 1 4.177-2.643"/><path d="M22 8.82a15 15 0 0 0-11.288-3.764"/><path d="m2 2 20 20"/>',
    copy:'<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    check:'<path d="M20 6 9 17l-5-5"/>',
    pencil:'<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
    send:'<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
    play:'<polygon points="6 3 20 12 6 21 6 3"/>',
    logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
    x:'<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    swap:'<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
    loader:'<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
  };
  return '<svg width="'+(s||15)+'" height="'+(s||15)+'" viewBox="0 0 24 24" fill="'+(fill||'none')+'" stroke="currentColor" stroke-width="'+(fill?1.8:2)+'" stroke-linecap="round" stroke-linejoin="round">'+(P[n]||'')+'</svg>';
}
/* 왕관·별은 쇼케이스처럼 금색 채움 + 짙은 획 */
const AOS_GOLD='#E8B33C';
function icCrown(s){ return '<span class="ic-ink">'+aosIcon('crown',s||16,AOS_GOLD)+'</span>'; }
function icStar(s){ return '<span class="ic-ink">'+aosIcon('star',s||14,AOS_GOLD)+'</span>'; }

function aosPills(){
  return '<div class="aos-pills">'+[2,3,4,5].map(n=>
    '<button class="aos-pill'+(n===setupN?' on':'')+'" onclick="uiSetupCount('+n+')">'+n+'인</button>').join('')+'</div>';
}
/* 자리 구성 폼 (로컬·온라인 방 만들기 공용) — 쇼케이스의 좌석 리스트와 같은 행 구조 */
function aosSeatFormRows(online){
  let rows='';
  for(let i=0;i<setupN;i++){
    if(i===0){
      rows+='<div class="aos-seatform">'+icCrown(16)
        +'<input class="aos-input name" type="text" value="'+escAttr(setupName)+'" maxlength="12" onchange="setupName=this.value" placeholder="이름">'
        +'<span class="aos-accent">(나'+(online?' · 호스트':'')+')</span></div>';
    } else {
      const isAi=curSetupKinds()[i]==='ai';
      rows+='<div class="aos-seatform"><span class="aos-seatlabel">자리 '+(i+1)+'</span>'
        +'<button class="aos-chip'+(isAi?' bot':'')+'" onclick="uiSetupToggle('+i+')" title="눌러서 전환">'
        +(isAi?aosIcon('bot',14):aosIcon('user',14,'currentColor'))+' '+(isAi?'BOT':(online?'친구 자리':'사람 (한 기기)'))+'</button></div>';
    }
  }
  return '<div class="aos-seatforms">'+rows+'</div>';
}
function aosTabs(online){
  return '<div class="aos-tabs">'
    +'<button class="'+(online?'':'on')+'" onclick="uiSetupMode(\'local\')">로컬 (한 기기)</button>'
    +'<button class="'+(online?'on':'')+'" onclick="uiSetupMode(\'online\')">온라인 멀티</button>'
    +'</div>';
}
/* 화면 프레임: [메인 카드 | 게임 요약 카드] — 쇼케이스 게임 셋업 화면의 2단 배치 */
function aosFrame(cardHtml){
  if(typeof document!=='undefined'&&document.body&&document.body.classList) document.body.classList.add('aos-setup');
  return '<div class="aos-wrap">'
    +'<div class="aos-card aos-main">'+cardHtml+'</div>'
    +'<aside class="aos-card aos-rules">'
      +'<h3>푸에르토리코 전략</h3>'
      +'<p class="sub">이기고 싶다면 이 감각부터.</p>'
      +'<div class="it"><b>옥수수 선적 러시</b><p>옥수수는 공장 없이 농장만으로 생산됩니다. 초반부터 옥수수를 모아 꾸준히 선적하면 승점이 차곡차곡 — 항구(선적마다 +1점)·조선소와 만나면 폭발합니다.</p></div>'
      +'<div class="it"><b>고가품 생산 경제</b><p>담배(3주화)·커피(4주화)는 팔았을 때 돈이 됩니다. 공장을 갖추고 상인으로 주화를 벌어 고급 건물(10주화)로 마무리하는 장기 플랜.</p></div>'
      +'<div class="it"><b>채석장 건설 우위</b><p>초반 채석장 2~3개를 점유하면 건물이 사실상 반값 — 공업소·학교·항구 같은 좋은 건물을 남보다 먼저 세웁니다.</p></div>'
      +'<div class="it"><b>역할은 "나만 좋게"</b><p>역할 행동은 전원이 합니다. 내가 크게 얻고 상대는 조금 얻는 타이밍에 고르세요 — 상대 커피가 쌓여 있을 때의 선장 선택은 남 좋은 일입니다.</p></div>'
      +'<div class="it"><b>선적은 의무</b><p>선장 단계에선 실을 수 있으면 반드시 싣고, 남은 상품은 창고 없이는 1개 빼고 반납됩니다. 상대의 상점 자리·수송선 종류를 보고 생산량을 조절하세요.</p></div>'
    +'</aside>'
    +'</div>';
}
function renderSetup(){
  rdReset();
  const netOK=typeof netConfigured==='function'&&netConfigured();
  if(netOK&&typeof NET!=='undefined'&&NET.on){ renderLobby(); return; }
  const canResume=!!lsGet('pr1897_save');
  const netSess=netOK&&typeof netSavedSession==='function'?netSavedSession():null;
  const online=setupMode==='online';
  let body;
  if(online&&netOK){
    body=
      '<div class="aos-label">'+icCrown(16)+' 내 이름</div>'
      +'<input class="aos-input" type="text" value="'+escAttr(setupName)+'" maxlength="12" onchange="setupName=this.value" placeholder="이름">'
      +'<div class="aos-box">'
        +'<div class="aos-box-h"><span>방 만들기</span>'
          /* 공개/비공개 스위치 — 공개가 기본 (공개방 목록에 노출) */
          +'<button class="aos-pubtgl'+(setupPublic?' on':'')+'" onclick="uiSetupPublic()" '
          +'title="'+(setupPublic?'공개방 (목록에 노출)':'비공개 (코드로만 입장)')+'">'
          +(setupPublic?'공개':'비공개')+'</button>'
        +'</div>'
        +(setupPublic
          ?'<input class="aos-input" style="margin-bottom:12px" type="text" maxlength="20" value="'+escAttr(setupTitle)+'" '
            +'placeholder="방 제목 (기본: '+escAttr((setupName||'호스트').trim())+'의 방)" onchange="setupTitle=this.value">'
          :'')
        +aosPills()
        +aosSeatFormRows(true)
        +'<button class="aos-btnp full" onclick="uiNetCreate()">방 만들기 (코드 발급)</button>'
      +'</div>'
      +'<div class="aos-box">'
        +'<div class="aos-box-h"><span>코드로 입장</span></div>'
        +'<div class="aos-joinrow">'
          +'<input class="aos-input mono" id="s2-code" placeholder="방 코드 (예: 7XK2QP)" maxlength="8" '
          +'oninput="this.value=this.value.toUpperCase()" onkeydown="if(event.key===\'Enter\')uiNetJoin()">'
          +'<button class="aos-btns" onclick="uiNetJoin()">입장</button>'
        +'</div>'
        /* 실패 사유는 입력 바로 아래 + 자리 선확보 — 나타나도 레이아웃이 안 움직인다 (쇼케이스 규칙) */
        +'<div class="aos-errslot">'+(typeof NET!=='undefined'&&NET.err?'<p>'+esc(NET.err)+'</p>':'')+'</div>'
      +'</div>'
      +'<div class="aos-box">'
        +'<div class="aos-box-h"><span>공개방</span></div>'
        +'<div id="aos-publist">'+pubListHtml()+'</div>'
      +'</div>'
      +(netSess?'<button class="aos-textbtn" onclick="uiNetResume()">진행하던 온라인 게임 이어서 하기 ('+esc(netSess.code)+')</button>':'');
  } else if(online){
    body='<div class="aos-box"><p class="aos-dim">온라인 기능이 설정되지 않은 환경입니다 (네트워크 모듈 미로드). 로컬 게임은 그대로 즐길 수 있습니다.</p></div>';
  } else {
    body=
      '<div class="aos-label">'+aosIcon('users',16)+' 플레이어 수</div>'
      +aosPills()
      +'<div class="aos-label" style="margin-top:20px">'+aosIcon('user',16)+' 자리</div>'
      +aosSeatFormRows(false)
      +'<button class="aos-btnp full" style="margin-top:20px" onclick="startNewGame()">게임 시작</button>';
  }
  $app.innerHTML=aosFrame(
    (typeof EMBEDDED!=='undefined'&&EMBEDDED?'<button class="aos-x" onclick="uiBackToIntro()" title="소개로 돌아가기">'+aosIcon('x',20)+'</button>':'')
    +'<h1>푸에르토리코 1897</h1>'
    +'<p class="aos-sub">기본 게임 - '+setupN+'인 게임</p>'
    +(canResume
      ?'<div class="aos-resume">'
        +'<button class="rx" onclick="lsDel(\'pr1897_save\');renderSetup()" title="저장된 게임 삭제" aria-label="저장된 게임 삭제">'+aosIcon('x',14)+'</button>'
        +'<div class="t">진행 중인 게임이 있습니다</div>'
        +'<p>이어서 하거나, X를 누르면 저장된 게임이 삭제됩니다. 새 게임을 시작해도 기존 게임은 사라집니다.</p>'
        +'<button class="aos-btnp full sm" onclick="resumeGame()">이어하기</button>'
      +'</div>':'')
    +(netOK?aosTabs(online):'')
    +body
  );
  if(online&&netOK) pubPoll();   // 공개방 목록 8초 폴링 시작 (온라인 폼이 보이는 동안만)
}
function uiNetCreate(){
  clearTimeout(pubT);
  netCreateRoom((setupName||'플레이어').trim(), setupN, setupKindsOn.slice(), setupPublic, setupTitle.trim());
}
function uiNetJoin(){
  const inp=document.getElementById('s2-code');
  if(!inp||!inp.value.trim()) return;
  netJoinRoom(inp.value.trim().toUpperCase(), (setupName||'게스트').trim());
}
/* ── 온라인 대기실 — OnlineLobby의 대기실 화면 이식 ── */
function renderLobby(){
  rdReset();
  // presence·방 이벤트로 다시 그려져도 입력 중이던 채팅·이름이 날아가지 않게 값·포커스를 보존한다
  const keep=['lb-chat-in','aos-name-in'].map(id=>{
    const el=document.getElementById(id);
    return el?{id, v:el.value, f:document.activeElement===el, s:el.selectionStart}:null;
  }).filter(Boolean);
  const restoreInputs=()=>keep.forEach(k=>{
    const el=document.getElementById(k.id);
    if(!el) return;
    el.value=k.v;
    if(k.f){ el.focus(); try{ el.setSelectionRange(k.s,k.s); }catch(e){} }
  });
  const head='<h1>푸에르토리코 1897</h1>'
    +'<p class="aos-sub">기본 게임 - '+(NET.room?NET.room.seats.length:setupN)+'인 게임</p>'
    +aosTabs(true);
  if(NET.status==='connecting'){
    $app.innerHTML=aosFrame(head
      +'<div class="aos-startwait center"><span class="aos-spin">'+aosIcon('loader',14)+'</span> 서버에 연결하는 중…</div>');
    return;
  }
  const seats=NET.room.seats, present=NET.presence;
  const allReady=seats.every(s=>s.kind==='ai'||(s.clientId&&present.includes(s.clientId)));
  const seatRows=seats.map((s,i)=>{
    const isMe=i===NET.mySeat;
    const isHostSeat=s.clientId&&s.clientId===NET.room.host_client_id;
    const online=s.clientId?present.includes(s.clientId):false;
    // 정체성 아이콘: 나=왕관 / 호스트=별 / 봇 / 사람 (쇼케이스와 동일한 규칙)
    const icon=isMe?icCrown(16):(isHostSeat?icStar(15):(s.kind==='ai'
      ?'<span class="ic-bot">'+aosIcon('bot',15)+'</span>'
      :'<span class="ic-ink">'+aosIcon('user',15,'currentColor')+'</span>'));
    const name=isMe
      ?'<span class="aos-seatname"><input class="aos-nameinline" id="aos-name-in" type="text" value="'+escAttr(s.name||NET.myName)+'" maxlength="12" onchange="uiNetRename(this.value)">'
        +'<span class="aos-accent sm">(나)</span><span class="pencil">'+aosIcon('pencil',12)+'</span></span>'
      :'<span class="aos-seatname"><span class="nm'+((s.clientId||s.kind==='ai')?'':' dim')+'">'+(s.name?esc(s.name):'친구를 기다리는 자리')+'</span></span>';
    const hostBadge=isHostSeat?'<span class="aos-badge host">'+icStar(11)+' 호스트</span>':'';
    let stat='', swap='';
    if(s.kind==='ai'){
      if(NET.host) swap='<button class="aos-roundbtn" onclick="uiNetToggleSeat('+i+')" title="사람 자리로 전환 (참가 대기)">'+aosIcon('swap',13)+' '+aosIcon('user',14,'currentColor')+'</button>';
    } else {
      if(s.clientId) stat=online
        ?'<span class="aos-badge on">'+aosIcon('wifi',11)+' 접속</span>'
        :'<span class="aos-badge off">'+aosIcon('wifioff',11)+' 끊김</span>';
      else stat='<span class="aos-badge off">대기 중…</span>';
      if(NET.host&&!isMe&&!online) swap='<button class="aos-roundbtn" onclick="uiNetToggleSeat('+i+')" title="BOT으로 전환">'+aosIcon('swap',13)+' '+aosIcon('bot',14)+'</button>';
    }
    return '<div class="aos-seat'+(isMe?' me':'')+'">'+icon+name+hostBadge+stat+swap+'</div>';
  }).join('');
  const start=NET.host
    ?'<button class="'+(allReady?'aos-btnp full big':'aos-startwait full')+'" onclick="uiNetStartGame()">'
      +aosIcon('play',15)+' '+(allReady?'게임 시작':'모든 자리가 차야 시작할 수 있어요 (빈자리는 BOT으로 전환 가능)')+'</button>'
    :'<div class="aos-startwait center"><span class="aos-spin">'+aosIcon('loader',14)+'</span> 호스트가 시작하기를 기다리는 중…</div>';
  $app.innerHTML=aosFrame(
    '<button class="aos-x" onclick="uiNetLeave()" title="방 나가기">'+aosIcon('x',20)+'</button>'
    +head
    +'<div class="aos-codebox">'
      +'<div class="cap">방 코드 — 친구에게 공유하세요</div>'
      +'<div class="row"><span class="code">'+esc(NET.room.code)+'</span>'
      +'<button class="cpy" onclick="uiNetCopyCode(this)" title="코드 복사">'+aosIcon('copy',16)+'</button></div>'
      +'<div class="cnt">'+aosIcon('wifi',12)+' 접속 '+Math.max(1,present.length)+'명</div>'
    +'</div>'
    +'<div class="aos-seats">'+seatRows+'</div>'
    +'<div class="aos-chat">'
      +'<div class="list" id="lb-chat-list"></div>'
      +'<div class="in"><input id="lb-chat-in" placeholder="메시지…" maxlength="300" onkeydown="uiLobbyChatKey(event)">'
      +'<button onclick="uiLobbyChatSend()" aria-label="전송">'+aosIcon('send',14)+'</button></div>'
    +'</div>'
    +start
    +'<button class="aos-textbtn" onclick="uiNetLeave()">'+aosIcon('logout',13)+' 방 나가기</button>'
    +(NET.err?'<div class="aos-errslot"><p>'+esc(NET.err)+'</p></div>':'')
  );
  netChatRender();
  restoreInputs();
}
function uiNetCopyCode(btn){
  try{
    navigator.clipboard.writeText(NET.room.code);
    btn.innerHTML=aosIcon('check',16);
    btn.classList.add('ok');
    setTimeout(()=>{ btn.innerHTML=aosIcon('copy',16); btn.classList.remove('ok'); },1500);
  }catch(e){}
}
function startNewGame(){
  const seats=[{name:(setupName||'플레이어').trim(), ai:false}];
  let ai=0, fr=0;
  for(let i=1;i<setupN;i++){
    if(setupKinds[i]==='human') seats.push({name:PR_NAMES.filter(n=>n!==setupName)[fr++%5], ai:false});
    else seats.push({name:NET_AI_NAMES[ai++%4], ai:true});
  }
  newGame(seats);
}
function resumeGame(){ if(loadSave()){ render(); schedule(); } }
function confirmNew(){
  if(typeof NET!=='undefined'&&NET.on){ uiNetLeave(); return; }
  if(confirm('현재 게임을 버리고 새 게임을 시작할까요?')){ lsDel('pr1897_save'); G=null; renderSetup(); }
}

/* 본 게임 렌더 */
function render(){
  if(!G){ renderSetup(); return; }
  // 설정·대기실의 크림 페이퍼 배경(aos-setup)을 해제 — 게임은 양피지 테마로
  if(typeof document!=='undefined'&&document.body&&document.body.classList) document.body.classList.remove('aos-setup');
  const pd=G.pending||{};
  const curPi=(pd.player!==undefined)?pd.player:null;

  /* 결정이 바뀌면 뷰 상태를 기본값으로 — 보관판 팝업은 자동 모드로, 사람 차례가 되면 그 보드를 따라간다 */
  const pendKey=(pd.type||'')+':'+(curPi===null?'-':curPi);
  if(pendKey!==uiLastPend){
    const prevPendType=uiLastPend.split(':')[0];
    uiLastPend=pendKey;
    const isHumanTurn=pd.type!=='gameOver'&&isLocalHuman(curPi);
    // 직전에 다른 사람(주로 봇)의 행동 이펙트가 아직 살아있으면, 그걸 먼저 보여준 뒤에
    // 내 보드로 전환하고 팝업을 연다 (즉시 전환하면 방금 무슨 일이 있었는지 못 봄)
    const showingOther=fxMark&&fxMark.pi!==curPi&&(Date.now()-fxMark.t)<FX_HOLD;
    const applyTurnStart=()=>{
      uiShopOpen=null;
      // 선적·판매 단계는 단계 내내 같은 패널이 유지된다 — 같은 단계 안의 차례 전환에서는
      // 열림 상태(uiPanelOpen)·상품 선택(uiShipSel)을 리셋하지 않는다 (닫았으면 닫힌 채로)
      const grp=t=>(t==='captain'||t==='storage')?'captain':t;   // 저장은 선적 단계의 연장
      const samePhasePanel=(grp(pd.type)===grp(prevPendType))&&(pd.type==='captain'||pd.type==='storage'||pd.type==='trader');
      if(!samePhasePanel){
        uiPanelOpen=null;   // 액션 패널도 자동 모드로 — 내 차례의 새 결정마다 다시 열린다
        uiShipSel=null;     // 선적 2단계 선택도 단계가 바뀌면 처음부터
      }
      if(isHumanTurn){
        uiBoardSel=null;
        // 건설 차례: 내 보드가 다 펼쳐지고 한 박자(SHOP_DELAY) 쉰 뒤에 건물 보관판을 연다.
        // (보드가 넓어지는 애니메이션과 팝업이 같이 뜨면 두 움직임이 겹쳐 어수선하게 보인다)
        if(pd.type==='builder'){
          const opening=(uiPrevShown!==null&&uiPrevShown!==curPi);  // 보드가 새로 펼쳐지는가
          uiShopOpen=false;
          setTimeout(()=>{
            if(G&&G.pending===pd&&uiShopOpen===false){ uiShopOpen=null; render(); }  // 그새 직접 열었으면(true) 건드리지 않는다
          }, (opening?BOARD_ANIM:0)+SHOP_DELAY);
        }
        // 사람 차례 시작: 무엇을 해야 하는지 중앙 알림 (떴다 사라짐)
        const TURNMSG={pickRole:'역할 타일을 선택하세요',settler:'가져갈 농장을 고르세요',mayorPlace:'일꾼을 배치하세요',
          builder:'건설할 건물을 고르세요',craftBonus:'추가로 받을 상품을 고르세요',trader:'판매할 상품을 고르세요',
          captain:'상품을 선적하세요',storage:'저장할 상품을 고르세요'};
        if(TURNMSG[pd.type]) toast('<b style="color:'+PCOLOR[curPi]+'">'+esc(P(curPi).name)+'</b> 차례 — '+TURNMSG[pd.type], null, true, PCOLOR[curPi]);
      }
    };
    if(isHumanTurn&&showingOther){
      uiShopOpen=false; // 팝업이 자동으로 먼저 뜨지 않게 잠깐 붙잡아둔다
      uiPanelOpen=false;
      const wait=FX_HOLD-(Date.now()-fxMark.t);
      uiHoldUntil=Date.now()+wait;   // 그동안 역할 선택 표시·액션바 등 "당신 차례" 티도 숨긴다
      setTimeout(()=>{ if(G&&G.pending===pd){ uiHoldUntil=0; applyTurnStart(); render(); } }, wait);
    } else {
      applyTurnStart();
    }
  }
  const holding=Date.now()<uiHoldUntil;

  /* 역할 타일 */
  const phaseRole=G.phase?G.phase.id:null;
  const rolesHtml=G.roles.map((r,i)=>{
    const R=ROLES[r.id];
    const pickable=(!holding&&pd.type==='pickRole'&&isLocalHuman(curPi)&&r.takenBy===null);
    const cls='role'+(r.takenBy!==null?' taken':'')+(pickable?' pickable':'')+(phaseRole===r.id&&r.takenBy!==null?' cur':'');
    const tip=R.rn+'. '+R.nm+' — '+R.ph+'\n'+R.desc+(r.coins>0?'\n올려둔 주화 '+r.coins+'개를 함께 가져갑니다.':'');
    return '<div class="'+cls+'" '+(pickable?'onclick="pickRole('+curPi+','+i+')"':'')+' title="'+escAttr(tip)+'">'
      +imgTag('역할',R.nm,'img')
      +'<div class="rolefb">'+R.rn+' '+R.nm+'<br><span>'+R.ph+'</span></div>'
      +(r.coins>0?'<div class="coin">'+r.coins+'</div>':'')
      +(r.takenBy!==null?'<div class="took" style="background:'+PCOLOR[r.takenBy]+'">'+esc(P(r.takenBy).name)+'</div>':'')
      +'</div>';
  }).join('');

  /* 수송선 */
  const shipsHtml=G.supply.ships.map(s=>{
    let slots='';
    for(let i=0;i<s.size;i++){
      if(i<s.count) slots+='<span class="slot g">'+goodChip(s.type,'')+'</span>';
      else slots+='<span class="slot"></span>';
    }
    const full=s.count>=s.size;
    const cols=Math.ceil(s.size/2);   // 위아래 2줄
    return '<div class="ship'+(full?' full':'')+'"><div class="cap">'+s.size+'칸 '
      +(s.type?PLANT_NM[s.type]+' <b>'+s.count+'/'+s.size+'</b>':'· 빈 배')
      +'</div><div class="slots" style="grid-template-columns:repeat('+cols+',20px)">'+slots+'</div></div>';
  }).join('');

  /* 상점 */
  let mkt='';
  for(let i=0;i<4;i++){
    mkt+= (G.supply.market[i]!==undefined)
      ? goodChip(G.supply.market[i])
      : '<span class="slot"></span>';
  }

  /* 인력 시장 */
  const S=G.supply;
  const laborHtml='<div class="labor-row">'
    +(S.labor>0?'<span class="wtok"></span> <b>×'+S.labor+'</b>':'<span style="color:var(--dim);font-size:12px">비어 있음</span>')
    +'</div>'
    +'<div class="hintline">다음 모집 때 나눠 갖는 일꾼</div>';

  /* 공급처 */
  const supHtml='<div class="supply-line">'
    +'<span class="sup-item">일꾼 <b>'+S.workers+'</b></span>'
    +'<span class="sup-item">승점 칩 <b>'+S.vp+'</b></span>'
    +'<span class="sup-item">채석장 <b>'+S.quarries+'</b></span>'
    +'<span class="sup-item">농장 더미 <b>'+S.deck.length+'</b></span>'
    +GTYPES.map(t=>'<span class="sup-item">'+goodChip(t)+' '+PLANT_NM[t]+' <b>'+S.goods[t]+'</b></span>').join('')
    +'</div>';

  /* 공개 농장 */
  const settlerActive=(!holding&&pd.type==='settler'&&isLocalHuman(curPi));
  const plantCell=(t,i)=>{
    const g=GOODS[t];
    return '<div class="plant'+(settlerActive?' pickable':'')+'" '+(settlerActive?'onclick="actSettler(\'display\','+i+')"':'')+'>'
      +'<div class="art" style="background:'+(g?g.color:'#888')+'22">'+imgTag('농장',PLANT_NM[t])+'</div>'
      +'<div class="lbl">'+PLANT_NM[t]+'</div></div>';
  };
  // 위아래 반반 배치 (홀수면 윗줄이 1개 더)
  const phalf=Math.ceil(S.display.length/2);
  const plantsHtml='<div class="prow">'+S.display.slice(0,phalf).map((t,i)=>plantCell(t,i)).join('')+'</div>'
    +(S.display.length>phalf?'<div class="prow">'+S.display.slice(phalf).map((t,i)=>plantCell(t,phalf+i)).join('')+'</div>':'');

  /* 건물 상점 (건설 단계 또는 항상 표시) */
  const builderActive=(!holding&&pd.type==='builder'&&isLocalHuman(curPi));
  const shopCell=id=>{
    const B=BUILDINGS[id]; const cnt=S.stock[id];
    let cls='shopb'; let click=''; let info='';
    if(cnt<=0) cls+=' none';
    if(builderActive){
      const me=P(curPi), isC=(curPi===G.phase.chooser);
      if(canBuild(me,id,isC)){
        cls+=' buyable';
        click='onclick="actBuild(\''+id+'\')"';
        const c=buildCost(me,id,isC);
        // 지금 얼마고, 사고 나면 얼마 남는지 미리 보여준다
        info='<div class="inf ok">'+c+'주화 <span>→ 남음 '+(me.coins-c)+'</span></div>';
      } else {
        cls+=' cant';
        info='<div class="inf no">'+buildBlockReason(me,id,isC)+'</div>';
      }
    }
    return '<div class="'+cls+'" '+click+' title="'+escAttr(buildingTip(B))+'">'
      +imgTag('건물',B.nm,'card')
      +imgTag('건물',B.nm,'zoom')
      +'<div class="nm imgless-only">'+B.nm+'</div>'
      +info
      +'<div class="cnt">×'+cnt+'</div></div>';
  };
  const ZONE_LABELS={
    1:'1구역<span>채석장 할인<br>최대 1개</span>',
    2:'2구역<span>채석장 할인<br>최대 2개</span>',
    3:'3구역<span>채석장 할인<br>최대 3개</span>',
    4:'고급<span>채석장 할인<br>최대 4개</span>'};
  const shopHtml=[1,2,3,4].map(z=>
    '<div class="zone"><div class="zone-h">'+ZONE_LABELS[z]+'</div>'
    +'<div class="shop">'+BORDER.filter(id=>BUILDINGS[id].zone===z).map(shopCell).join('')+'</div></div>'
  ).join('');

  /* 플레이어 보드 — 펼친 보드 1개(좌) + 요약 카드 세로 스택(우) */
  const mayorActive=(!holding&&pd.type==='mayorPlace'&&isLocalHuman(curPi));
  const shown=shownBoard();
  // 펼쳐진 보드가 바뀐 프레임에만 새 모양(펼침 쪽·접힘 쪽 둘 다)에 페이드 클래스를 준다 — 폭은 건드리지 않는다
  const prevShown=uiPrevShown;
  const boardJustSwitched=(prevShown!==null&&prevShown!==shown);
  uiPrevShown=shown;
  // 내가 고른 게 아니라 "지금 이 사람 차례라서" 자동으로 펼쳐진 보드에만, 무슨 액션 중인지 이름 옆에 표시
  const ACTIONMSG={pickRole:'역할 선택 중',settler:'개척 중',mayorPlace:'일꾼 배치 중',
    builder:'건설 중',craftBonus:'상품 선택 중',trader:'판매 중',captain:'선적 중',storage:'저장 중'};
  // 건물 보관소 버튼: 가장 우측(마지막 자리) 개인 보드의 우측 하단에 붙인다
  // stopPropagation: 이 버튼은 접힌 개인 보드(클릭=펼치기) 안에 있어서, 막지 않으면 보드까지 같이 펼쳐진다
  const fabShopHtml='<button class="fab-shop" onclick="event.stopPropagation();uiToggleShop()" title="건물 보관소 열기/닫기 (Esc로 닫기)">🏘️<span>건물</span></button>';
  // 두꺼운 색 띠(.cur)는 "이번 역할을 고른 사람"에게 — 역할 선택 중일 때는 고르는 중인 사람에게
  const chooserPi=G.phase?G.phase.chooser:curPi;
  const boardParts=G.players.map(p=>{
    const isCur=(curPi===p.i);
    const isChooser=(chooserPi===p.i);
    const isMayorMe=mayorActive&&isCur;
    const acting=(uiBoardSel===null&&isCur&&ACTIONMSG[pd.type]);
    // 사람/봇 정체 표시 — 봇은 봇 아이콘+BOT, 사람은 사람 아이콘, 온라인의 나는 왕관 (사용자 요청)
    const idTag=p.ai
      ?'<span class="tag bot" title="AI 봇">'+aosIcon('bot',11)+'BOT</span>'
      :((typeof NET!=='undefined'&&NET.on&&NET.mySeat===p.i)
        ?'<span class="tag meid" title="나">'+aosIcon('crown',11,AOS_GOLD)+'나</span>'
        :'<span class="tag humanid" title="사람">'+aosIcon('user',10)+'사람</span>');
    const tags=(G.governor===p.i?'<span class="gov-ic" title="주지사 — 이번 라운드 시작 플레이어"><svg viewBox="0 0 24 16"><path d="M2 14h20L20 4l-5 4.2L12 1 9 8.2 4 4z" fill="#e8c95c" stroke="#8a6a1f" stroke-width="1.2" stroke-linejoin="round"/></svg></span>':'')+idTag+(acting?'<span class="tag acting">'+ACTIONMSG[pd.type]+'</span>':'');
    if(p.i!==shown){
      // 좁은 카드에서는 이름이 먼저다 — AI 배지는 이름에 이미 "AI"가 들어 있으면 생략(자리만 먹는다)
      const ctags=(G.governor===p.i?'<span class="gov-ic" title="주지사 — 이번 라운드 시작 플레이어"><svg viewBox="0 0 24 16"><path d="M2 14h20L20 4l-5 4.2L12 1 9 8.2 4 4z" fill="#e8c95c" stroke="#8a6a1f" stroke-width="1.2" stroke-linejoin="round"/></svg></span>':'')
        +idTag;   // 접힌 카드에도 사람/봇 표시 (84px 폭에서 아이콘+짧은 라벨은 안전)
      // 요약 카드: 주화·승점 한 줄 / 일꾼 한 줄, 그 아래 농장·건물·상품을 "무엇을 가졌는지"까지 보여준다.
      // (카드 폭이 모자라면 펼친 보드의 타일이 대신 줄어든다 — boardMetrics 참고)
      const farm={}; for(const l of p.land) farm[l.type]=(farm[l.type]||0)+1;
      // 농장은 한 줄에 하나씩(.clist), 채석장 → 옥수수·과일·설탕·담배·커피(가격순) 순서로
      const farmList=['quarry'].concat(GTYPES).filter(t=>farm[t])
        .map(t=>'<div>'+PLANT_NM[t]+' ×'+farm[t]+'</div>').join('')||'<div class="dim">—</div>';
      // 건물 정렬: 생산 → 상업 → 고급, 같은 종류 안에서는 승점 낮은 것부터
      const KORD={prod:0,com:1,big:2};
      const bldSorted=[...p.buildings].sort((a,b)=>{
        const A=BUILDINGS[a.id],B2=BUILDINGS[b.id];
        return (KORD[A.kind]-KORD[B2.kind])||(A.vp-B2.vp)||(A.cost-B2.cost);
      });
      const bldList=bldSorted.map(b=>'<div class="bk-'+BUILDINGS[b.id].kind+(b.w>0?'':' un')+'"'+(b.w>0?'':' title="일꾼 미배치"')+'>'+BUILDINGS[b.id].nm+'</div>').join('')||'<div class="dim">—</div>';
      const goodsRow=GTYPES.filter(t=>p.goods[t]>0).map(t=>'<span class="cg">'+goodChip(t)+'×'+p.goods[t]+'</span>').join('')||'<span class="dim">—</span>';
      return '<div class="pboard collapsed'+(isChooser?' cur':'')+(boardJustSwitched&&p.i===prevShown?' board-out':'')+cardFxCls('pboard-'+p.i)+'" data-pi="'+p.i+'" style="border-left:4px solid '+PCOLOR[p.i]+';--pc:'+PCOLOR[p.i]+'" onclick="uiSelectBoard('+p.i+')" title="클릭하면 펼칩니다">'
        +'<div class="pcontent">'
        +'<div class="chead"><span class="pdot" style="background:'+PCOLOR[p.i]+'"></span><span class="cnm" title="'+escAttr(p.name+(p.ai?' (AI)':''))+'">'+esc(p.name)+'</span></div>'
        +(ctags?'<div class="ctags">'+ctags+'</div>':'')   // 주지사·AI 표시는 아랫줄로 — 좁은 카드에서 이름이 먼저다
        +'<div class="cstat"><span class="cpair" title="주화"><span class="tok-coin sm">$</span><b>'+p.coins+'</b></span><span class="cpair" title="승점"><span class="tok-vp sm">VP</span><b>'+p.vp+'</b></span></div>'
        +'<div class="cstat"><span class="cpair" title="일꾼"><span class="wtok smw"></span><b>'+totalWorkersOf(p)+'</b></span></div>'
        +'<div class="csec">농장 '+p.land.length+'</div><div class="clist">'+farmList+'</div>'
        +'<div class="csec">건물 '+p.buildings.length+'</div><div class="clist">'+bldList+'</div>'
        +'<div class="csec">상품</div><div class="crow">'+goodsRow+'</div>'
        +'<div class="expand">펼치기 ▾</div>'
        +'</div>'
        +(p.i===G.n-1?fabShopHtml:'')
        +'</div>';
    }
    // 토지
    let land='';
    for(let i=0;i<12;i++){
      const l=p.land[i];
      if(l){
        const g=GOODS[l.type];
        const clickable=isMayorMe;
        land+='<div class="cell land'+(clickable?' clickable':'')+fxCls('land-'+p.i+'-'+i)+'" '+(clickable?'onclick="uiToggleLand('+p.i+','+i+')"':'')+'>'
          +'<div class="art" style="background:'+(g?g.color+'26':'#ddd')+'">'
          +imgTag('농장',PLANT_NM[l.type])
          +(l.w?'<span class="wk"><span class="wtok'+fxCls('wkl-'+p.i+'-'+i)+'"></span></span>':'')+'</div>'
          +'<div class="lbl">'+PLANT_NM[l.type]+'</div></div>';
      } else land+='<div class="cell land empty"></div>';
    }
    /* 건물 — 건설 부지는 6열 × 2행.
       고급 건물은 부지 2칸을 "세로로" 쓰므로 반드시 1행에서 시작해야 두 층이 온전히 들어간다.
       자동 배치에 맡기면 앞선 건물 개수에 따라 2행에서 시작하는 경우가 생겨, 3행이 만들어지며
       보드가 아래로 늘어났다. → 자리를 직접 정한다:
         · 고급 건물에게 오른쪽 끝 열을 한 열씩 통째로 준다 (항상 1~2행 = 2층)
         · 일반 건물은 남은 열들만 행 우선으로 채운다
       그래서 고급 건물이 새로 지어지면 일반 건물들의 위치가 왼쪽으로 밀린다 — 자리가 없으면
       옮겨서라도 고급 건물을 2층으로 세운다는 뜻. 총 용량(12칸)은 그대로다. */
    const bigs=[], smalls=[];
    p.buildings.forEach(b=>((BUILDINGS[b.id].size===2)?bigs:smalls).push(b));
    const smallCols=Math.max(0, 6-bigs.length);
    const cellPos=(i)=>'grid-column:'+((i%smallCols)+1)+';grid-row:'+(Math.floor(i/smallCols)+1);
    let blds='';
    let used=0;
    const bldCell=(b, pos)=>{
      const B=BUILDINGS[b.id];
      // 배치된 일꾼만 그린다 — 빈 자리는 타일에 인쇄된 원이 이미 보여준다.
      // 인쇄된 원 위치(실측): 1칸 건물 23% · 2칸 21%/45% · 3칸 20%/45%/70% (y 60%)
      // 고급 건물은 좌상단 비용 코인을 감싼 원이 일꾼 자리 (22%, 29%)
      let wk='';
      for(let s=0;s<b.w;s++){
        // 인쇄된 원 위치 — 23종 전수 픽셀 실측 (비용 코인 중심 = 1번 원):
        // 생산 공장 (21.4, 59) + 24.5%씩 · 일반 상업 (23, 64.3) · 고급 (23.9, 30.2)
        let x,y;
        if(B.size===2){ x=23.9; y=30.2; }
        else if(B.kind==='prod'){ x=21.4+s*24.5; y=59; }
        else { x=23; y=64.3; }
        wk+='<span class="wtok'+fxCls('wkb-'+p.i+'-'+b.id+'-'+s)+'" style="left:'+x+'%;top:'+y+'%"></span>';
      }
      const clickable=isMayorMe;
      return '<div class="cell'+(B.size===2?' b2':'')+(clickable?' clickable':'')+fxCls('bld-'+p.i+'-'+b.id)+'" '
        +'style="'+pos+'" '+(clickable?'onclick="uiToggleBld('+p.i+',\''+b.id+'\')"':'')
        +' title="'+escAttr(buildingTip(B)+(b.w<B.slots?'\n일꾼 미배치 — 효과가 발동하지 않습니다.':''))+'">'
        +'<div class="bimg">'+imgTag('건물',B.nm)+wk+'</div>'
        +imgTag('건물',B.nm,'zoom')
        +'<div class="lbl">'+B.nm+'</div></div>';
    };
    p.buildings.forEach(b=>{ used+=(BUILDINGS[b.id].size||1); });
    smalls.forEach((b,i)=>{ blds+=bldCell(b, cellPos(i)); });
    bigs.forEach((b,j)=>{ blds+=bldCell(b, 'grid-column:'+(smallCols+j+1)+';grid-row:1 / span 2'); });
    for(let i=smalls.length;i<smallCols*2;i++) blds+='<div class="cell empty" style="'+cellPos(i)+'"></div>';
    // 우측 자원 패널
    // 자원(주화·승점·일꾼)은 타일 3칸, 상품은 2×2 타일 그리드로 구분
    // 자원: 3줄 세로(아이콘·이름 | 숫자) · 상품: 가로 2개씩 2줄
    const goodsCells=GTYPES.filter(t=>p.goods[t]>0)
      .map(t=>'<div class="pgood">'+goodChip(t)+'<span>'+PLANT_NM[t]+'</span><b>×'+p.goods[t]+'</b></div>').join('')
      ||'<div class="pres-empty">없음</div>';
    const pres='<div class="pres">'
      +'<div class="pgroup">'
        +'<div class="pres-stats">'
          +'<div class="prow"><span class="tok-coin">$</span>주화<b>'+p.coins+'</b></div>'
          +'<div class="prow"><span class="tok-vp">VP</span>승점<b>'+p.vp+'</b></div>'
          +'<div class="prow"><span class="wtok"></span>일꾼<b>'+p.stored+'</b></div>'
        +'</div>'
      +'</div>'
      +'<div class="pgroup pg-goods">'
        +'<div class="pg-title">상품</div>'
        +'<div class="pres-goods">'+goodsCells+'</div>'
      +'</div>'
      +'</div>';
    return '<div class="pboard'+(isChooser?' cur':'')+(boardJustSwitched?' board-in':'')+cardFxCls('pboard-'+p.i)+'" data-pi="'+p.i+'" style="border-left:4px solid '+PCOLOR[p.i]+';--pc:'+PCOLOR[p.i]+'">'
      +'<div class="pcontent">'
      +'<div class="phead"><span class="pdot" style="background:'+PCOLOR[p.i]+'"></span><span class="nm">'+esc(p.name)+'</span>'+tags+'</div>'
      +'<div class="landrow">'
        +'<div><div class="sec-title" style="margin-bottom:3px">토지 (' +p.land.length+'/12)</div><div class="grid12">'+land+'</div></div>'
        +'<div class="preswrap"><div class="sec-title" style="margin-bottom:3px">자원</div>'+pres+'</div>'
      +'</div>'
      +'<div class="bsec"><div class="sec-title" style="margin-bottom:3px">건설 부지 ('+used+'/12)</div><div class="grid12 bgrid">'+blds+'</div></div>'
      +'</div>'
      +(p.i===G.n-1?fabShopHtml:'')
      +'</div>';
  });
  // 자리 순서 그대로 — 펼친 보드가 자기 자리에서 열린다 (접힘·오픈·접힘·접힘 …)

  /* 액션 바 */
  let bar='';
  if(pd.type==='gameOver'){
    bar='';
  } else if(!holding && pd.type && isLocalHuman(curPi)){
    bar=renderActionBar(pd);
  } else if(curPi!==null && P(curPi).ai){
    bar='<div class="actionbar"><div class="inner"><span class="who">'+aosIcon('bot',13)+' '+esc(P(curPi).name)+'</span><span class="msg">생각하는 중…</span></div></div>';
  } else if(curPi!==null && !P(curPi).ai){
    // 온라인: 원격 플레이어 차례 — 연결이 끊겼으면 호스트가 AI로 대체할 수 있다 (필수 기능)
    const dis=typeof netSeatDisconnected==='function'&&netSeatDisconnected(curPi);
    bar='<div class="actionbar"><div class="inner"><span class="who">'+esc(P(curPi).name)+'</span>'
      +'<span class="msg">'+(dis?'연결이 끊긴 것 같습니다':'차례를 진행하는 중…')+'</span>'
      +(dis&&NET.host?'<div class="btns"><button class="hot" onclick="uiNetAiTakeover('+curPi+')">AI가 이어받기</button></div>':'')
      +'</div></div>';
  }

  /* 종료 모달 */
  let modal='';
  if(G.over&&G.scores){
    modal='<div class="overlay pop"><div class="modal">'   // 종료 모달은 한 번만 뜨므로 항상 등장 애니메이션
    +'<h2>최종 점수</h2>'
    +'<table><tr><th>플레이어</th><th>승점 칩</th><th>건물</th><th>고급 건물 보너스</th><th>합계</th></tr>'
    +G.scores.map((s,i)=>'<tr'+(i===0?' class="scorewin"':'')+'><td>'+(s.ai?aosIcon('bot',12)+' ':'')+esc(s.name)+(i===0?' 🏆':'')+'</td><td>'+s.chips+'</td><td>'+s.bvp+'</td>'
      +'<td>'+s.big+(s.notes.length?' <span style="color:var(--dim);font-size:11px">('+s.notes.join(', ')+')</span>':'')+'</td>'
      +'<td><b>'+s.total+'</b></td></tr>').join('')
    +'</table>'
    +'<div class="hint">동점 시 주화+상품 개수로 승부: '+G.scores.map(s=>esc(s.name)+' '+s.tie).join(' · ')+'</div>'
    +'<div style="display:flex;gap:10px;margin-top:20px"><button class="btn-primary" onclick="confirmNew()">새 게임</button></div>'
    +'</div></div>';
  }

  /* 건물 보관판 팝업 */
  let shopPop='';
  const shopNow=shopVisibleNow();
  // 등장 애니메이션은 "이번에 새로 열렸을 때"만 — 팝업이 떠 있는 동안 내용이 바뀌어 다시 그려질 때마다
  // 스르르가 반복되면 오히려 산만하다 (setPart는 문자열이 바뀐 섹션을 통째로 갈아끼운다)
  const shopJustOpened=shopNow&&!uiShopWasVisible;
  uiShopWasVisible=shopNow;
  if(shopNow){
    shopPop='<div class="overlay shop-ov'+(shopJustOpened?' pop':'')+'" onclick="if(event.target===this)uiToggleShop()"><div class="modal shop-modal'+(builderActive?' buying':'')+'">'
      +'<div class="shop-modal-h"><h2>건물 보관소</h2><div style="display:flex;gap:8px">'
      +(builderActive?'<button class="btn-ghost" onclick="actBuild(\'skip\')">건설 넘기기</button>':'')
      +'<button class="btn-ghost" onclick="uiToggleShop()">닫기 ✕</button></div></div>'
      +shopHtml
      +'</div></div>';
  }

  /* 중앙 액션 패널 — 내 차례의 선택지 (개척·모집·생산 보너스·판매·선적·저장) / 단계 결과 보고.
     배경 오버레이·창(스켈레톤)은 패널이 떠 있는 동안 유지하고 제목·본문만 갈아끼운다 —
     매 행동마다 통째로 다시 만들면 진행→마무리→결과 전환이 뚝뚝 끊겨 보인다. */
  const isReport=(pd.type==='report');
  const panelNow=isReport||(!holding&&panelVisibleNow());
  const panelJustOpened=panelNow&&!uiPanelWasVisible;
  uiPanelWasVisible=panelNow;
  let apParts=null;
  if(isReport){
    // 결과 보고: [확인]을 누를 때까지 게임이 기다린다 (바깥 클릭도 확인으로 취급).
    // stage 보고(선적·판매)는 진행 패널과 같은 크기·레이아웃 — 같은 창 안에서 내용만 바뀐다.
    apParts={ title:pd.title,
      sub:'<span class="ap-sub">결과를 확인하세요</span>',
      btn:'<button class="btn-ghost" onclick="actReportDone()">확인 ✓</button>',
      cls:' report'+(pd.stage?' stage':''),
      body:pd.html+'<div class="ap-btns"><button class="ap-opt hot" onclick="actReportDone()">확인</button></div>' };
  } else if(panelNow) apParts=renderActionPanel(pd);

  /* ── 조립: 스켈레톤은 한 번만 세우고, 이후에는 달라진 섹션만 갈아끼운다 ── */
  if(!rdSkeleton){
    rdSkeleton=true; rdCache={}; rdBoards=[];
    $app.innerHTML=
    '<div class="hdr" id="rd-hdr"></div>'
    +'<div class="layout" style="margin-top:4px">'
      +'<div class="main-col">'
        +'<div><div class="sec-title">역할</div><div class="roles" id="rd-roles"></div></div>'
        +'<div class="sec"><div class="sec-title">플레이어<span class="kbd-hint">←/→ 키 또는 클릭으로 보드 전환</span></div><div class="players" id="rd-players"></div></div>'
      +'</div>'
      +'<div class="side-col">'
        +'<div class="card" id="card-plants"><div class="sec-title">공개된 농장</div><div class="plants" id="rd-plants"></div></div>'
        +'<div class="card" id="card-ships"><div class="sec-title">수송선</div><div class="ships" id="rd-ships"></div></div>'
        +'<div class="cardrow">'
          +'<div class="card" id="card-market"><div class="sec-title">상점</div><div class="market-slots" id="rd-market"></div><div class="hintline">가득 차면 비워짐 · 중복 종류 판매 불가</div></div>'
          +'<div class="card" id="card-labor"><div class="sec-title">인력 시장</div><div id="rd-labor"></div></div>'
        +'</div>'
        +'<div class="card" id="card-supply"><div class="sec-title">공급처</div><div id="rd-supply"></div></div>'
        +'<div class="log" id="logbox"></div>'
      +'</div>'
    +'</div>'
    +'<div id="rd-bar"></div><div id="rd-modal"></div><div id="rd-panel"></div><div id="rd-shop"></div><div id="rd-help"></div>';
  }

  setPart('rd-hdr',
    backBtnHtml()
    +'<h1>푸에르토리코</h1><span class="sub">1897</span>'
    +'<div class="meta"><span>라운드 <b>'+G.round+'</b></span><span>주지사 <b>'+esc(P(G.governor).name)+'</b></span>'
    +(G.phase?'<span>단계 <b>'+ROLES[G.phase.id].ph+'</b></span>':'')
    +stampHtml()
    +(typeof NET!=='undefined'&&NET.on?'<span class="netbadge" title="온라인 게임 — 방 코드">🌐 '+esc(NET.room.code)+'</span>':'')
    +'<button class="helpbtn" onclick="uiToggleHelp()" title="요약 규칙 — 언제든 볼 수 있습니다">?</button>'
    +'<button onclick="confirmNew()">'+(typeof NET!=='undefined'&&NET.on?'나가기':'새 게임')+'</button></div>');
  setPart('rd-roles', rolesHtml);
  /* 폭 배분 — 스켈레톤이 선 뒤에 재야 한다(컨테이너 실제 폭이 필요).
     타일(--bw/--lw)과 판 폭(--w-open/--cbw)을 한 번에 확정해 얹는다. */
  const $pl=document.getElementById('rd-players');
  if($pl){
    const m=boardMetrics(G.n);
    ['--bw','--lw','--w-open','--cbw'].forEach(k=>$pl.style.removeProperty(k));
    if(m){
      $pl.style.setProperty('--bw', m.bw+'px');
      $pl.style.setProperty('--lw', m.lw+'px');
      $pl.style.setProperty('--w-open', m.openW+'px');
      $pl.style.setProperty('--cbw', m.cbw+'px');
    }
  }
  setBoards(boardParts);
  setPart('rd-plants', plantsHtml);
  setPart('rd-ships', shipsHtml);
  setPart('rd-market', mkt);
  setPart('rd-labor', laborHtml);
  setPart('rd-supply', supHtml);
  /* 사이드 카드 번쩍임: 클래스만 갈아끼운다 (innerHTML은 건드리지 않음 → 애니메이션 안 끊김) */
  setCls('card-plants','card'+cardFxCls('#card-plants'));
  setCls('card-ships','card'+cardFxCls('#card-ships'));
  setCls('card-market','card'+cardFxCls('#card-market'));
  setCls('card-labor','card'+cardFxCls('#card-labor'));
  setCls('card-supply','card'+cardFxCls('#card-supply'));
  setPart('rd-bar', bar);
  setPart('rd-modal', modal);
  /* 패널: 스켈레톤(배경+창)은 유지, 클래스·제목·본문만 부분 교체 */
  if(!apParts){
    setPart('rd-panel','');
    uiPanelAnim='';
    uiPanelKey='';   // 닫혔다 다시 열리면 (같은 단계여도) 전환 애니메이션이 다시 나온다
  } else {
    if(setPart('rd-panel', AP_SKEL)){
      // 스켈레톤을 새로 세웠으면 하위 캐시를 비워 클래스·내용이 반드시 다시 적용되게 한다
      ['cls:ap-ov','cls:ap-modal','cls:ap-head','cls:ap-bodyc','ap-head','ap-bodyc'].forEach(k=>delete rdCache[k]);
    }
    // 등장(pop)은 새로 열릴 때 한 번, 결과 보고 전환은 창 유지 + 테두리 펄스(swap)
    if(panelJustOpened) uiPanelAnim='pop';
    else if(isReport){ if(uiPanelAnim!=='swap') uiPanelAnim='swap'; }
    else if(uiPanelAnim==='swap') uiPanelAnim='';
    /* 내용 전환 애니메이션 — 패널이 "다른 단계"를 보여주기 시작하는 순간(역할 선택→선적 등)
       제목·본문이 떠오른다. 같은 단계 안의 차례 이동·마무리·결과(stage 연속)는 키가 같아 재생 안 됨.
       a/b 클래스를 교대로 붙여야 요소가 유지된 채로도 애니메이션이 다시 튼다. */
    const grpKey=t=>({storage:'captain', craftBonus:'craft'})[t]||t;
    const apKey=isReport?(pd.stage||'report'):(pd.type==='phaseEnd'?pd.id:grpKey(pd.type));
    // 키가 바뀌면 무조건 재생 — 새로 열릴 때 생략했더니 대부분의 등장 경로에서 애니메이션이 통째로 빠졌다
    if(apKey!==uiPanelKey){ uiPanelKey=apKey; uiPanelFlip=!uiPanelFlip; }
    const flip=uiPanelFlip?' apb-a':' apb-b';
    setCls('ap-ov','overlay panel-ov'+(uiPanelAnim?' '+uiPanelAnim:''));
    setCls('ap-modal','modal act-modal'+apParts.cls);
    setCls('ap-head','shop-modal-h'+flip);
    setCls('ap-bodyc',flip.trim());
    setPart('ap-head','<h2>'+apParts.title+'</h2>'+apParts.sub+apParts.btn);
    setPart('ap-bodyc', apParts.body);
  }
  setPart('rd-shop', shopPop);
  setPart('rd-help', renderHelpPop());
  /* 로그: 내용이 바뀐 렌더에서만 바닥으로 스크롤 */
  if(setPart('logbox', G.log.slice(-120).map(l=>'<div>'+l+'</div>').join(''))){
    const lb=document.getElementById('logbox'); if(lb) lb.scrollTop=lb.scrollHeight;
  }
  /* 배치 팝 이어 재생 — 보드 노드가 다른 이유로 교체돼도 애니메이션이 처음부터 다시 재생되지 않게.
     모든 DOM 쓰기가 끝난 뒤(새로 만들어진 노드가 다 자리잡은 뒤) 한 번에 처리해야 한다. */
  fxTimeSync();
}
