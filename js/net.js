/* ═══════════════════════════ 온라인 멀티플레이 ═══════════════════════════ */
/* aos_showcase와 같은 방식: 호스트 권위(host-authoritative) 모델.
   - 호스트: 엔진·AI를 돌리고, 상태가 바뀔 때마다 snapshot을 브로드캐스트 + DB에 저장(재접속용)
   - 게스트: 엔진을 돌리지 않는다. 내 차례의 행동은 intent로 호스트에 보내고 snapshot을 받아 그린다.
   - 연출(토스트·팝·역할 스플래시)은 호스트가 fx 이벤트로 중계 → 게스트도 같은 연출을 본다.
   - 비공개 정보: 게스트에게 가는 snapshot의 농장 덱은 '?'로 가린다 (길이만 보임).
   채널: room:{코드} (프라이빗 — RLS가 참가자만 허용), 이벤트: intent / snapshot / chat / room / fx */

const NET={
  on:false, host:false, status:'idle',   // idle | connecting | lobby | playing
  sb:null, chan:null, room:null, uid:null,
  mySeat:null,            // 내 좌석 번호 (G.players 인덱스와 동일)
  presence:[],            // 채널에 붙어 있는 clientId 목록
  chat:[], chatUnread:0,
  rev:0, err:'', myName:'',
  orig:{},                // 게스트 모드에서 감싼 원본 함수들 (복구용)
  saveT:0,                // DB snapshot 저장 디바운스
  hbT:0,                  // 대기실 하트비트
  /* 연결 끊김 상태 (쇼케이스와 동일한 모델) */
  takeover:null,          // 게스트: 호스트 이탈 안내 {status, can}
  takeoverT:0,            // 승계 유예 타이머
  offSeat:null,           // 호스트: 이탈한 게스트 좌석 {seat, name}
  offT:0,                 // 이탈 유예 타이머
  reconnT:0, reconnN:0,   // 순단 재연결 타이머·시도 횟수
  connected:true,         // 내 채널 연결 상태
  dismissed:[],           // 호스트가 "계속 기다리기"를 고른 좌석들 (다시 묻지 않는다)
};

/* 연결 끊김 처리 — aos_showcase와 같은 규칙·같은 값
   HOST_TAKEOVER_DELAY: 호스트 이탈 후 승계를 묻기까지 유예 (짧은 끊김 플랩 오탐 방지)
   GUEST_GRACE:         게스트 이탈 후 AI 전환을 제안하기까지 유예
   RECONNECT_DELAY/MAX: 채널 순단 시 자동 재연결 간격·횟수 */
const HOST_TAKEOVER_DELAY=6000, GUEST_GRACE=10000, RECONNECT_DELAY=5000, MAX_RECONNECT=5;
const NET_CODE_CHARS='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  // I/O/0/1 제외 (구두로 불러줘도 안 헷갈림)
/* 1897 카리브 배경에 어울리는 스페인풍 이름 — 게임 몰입용 (사용자 요청) */
const NET_AI_NAMES=['미겔','카르멘','디에고','로시타'];

/* 좌석 이름 유일화는 data.js의 uniqueName() — 겹치면 테마 이름 풀에서 무작위로 다른 이름을 준다 */
function netTakenNames(exceptSeat){
  return (NET.room?NET.room.seats:[]).filter((s,i)=>i!==exceptSeat&&s.name).map(s=>s.name);
}

function netClientId(){
  let id=sessionStorage.getItem('pr1897-net-client-id');
  if(!id){ id=crypto.randomUUID(); sessionStorage.setItem('pr1897-net-client-id', id); }
  return id;
}
function netClient(){
  if(!NET.sb) NET.sb=supabase.createClient(NET_SUPABASE_URL, NET_SUPABASE_KEY,
    { auth:{ persistSession:true, autoRefreshToken:true } });
  return NET.sb;
}
/* 익명 로그인 — 프라이빗 채널·RLS가 uid를 요구한다 */
async function netAuth(){
  const sb=netClient();
  const { data:s }=await sb.auth.getSession();
  if(s&&s.session) return NET.uid=s.session.user.id;
  const { data, error }=await sb.auth.signInAnonymously();
  if(error) throw new Error('익명 로그인 실패: '+error.message);
  return NET.uid=data.user.id;
}
function netMkCode(){ let c=''; for(let i=0;i<6;i++) c+=NET_CODE_CHARS[Math.floor(Math.random()*NET_CODE_CHARS.length)]; return c; }

/* ── 방 만들기 (호스트) ── */
async function netCreateRoom(myName, n, seatKinds, isPublic, title){
  // seatKinds: 좌석 1..n-1의 'ai'|'human' (0번은 항상 나)
  NET.err=''; NET.status='connecting'; NET.myName=myName; renderSetup();
  try{
    await netAuth();
    const cid=netClientId();
    const used=[];
    const hostName=uniqueName(myName, used); used.push(hostName);
    const seats=[{seat:0, name:hostName, kind:'human', clientId:cid, uid:NET.uid}];
    for(let i=1;i<n;i++){
      const isAi=seatKinds[i]==='ai';
      // 폼 미리보기와 같은 공식 — 화면에서 본 봇 이름이 그대로 방에 들어간다 (겹치면 번호)
      const nm=isAi?uniqueName(NET_AI_NAMES[(i-1)%4], used):'';
      if(nm) used.push(nm);
      seats.push({seat:i, name:nm, kind:isAi?'ai':'human', clientId:null});
    }
    const sb=netClient();
    let row=null;
    for(let t=0;t<4;t++){  // 코드 충돌 시 재생성
      const { data, error }=await sb.from('rooms').insert({
        code:netMkCode(), map_id:NET_MAP_ID, is_public:!!isPublic, status:'waiting',
        title:isPublic?String(title||myName+'의 방').trim().slice(0,60):null,
        seats, host_client_id:cid, host_uid:NET.uid, participant_uids:[NET.uid],
      }).select().single();
      if(!error){ row=data; break; }
      if(error.code!=='23505') throw new Error('방 생성 실패: '+error.message);
    }
    if(!row) throw new Error('방 코드 생성에 실패했습니다. 다시 시도해 주세요.');
    NET.on=true; NET.host=true; NET.room=row; NET.mySeat=0; NET.status='lobby';
    netSaveSession();
    netConnect();
    netHeartbeat();
    renderSetup();
  }catch(e){ NET.err=e.message; NET.status='idle'; renderSetup(); }
}

/* ── 코드로 참가 (게스트) ──
   onlyIfPlaying: 새로고침 자동 복귀 전용 — 진행 중이던 게임만 되돌아가고,
   대기실 상태였다면 조용히 설정 화면에 머문다 (설정 화면에서 F5를 눌렀는데 옛 대기실로
   끌려가지 않게. 그 방은 설정 화면의 "이어서" 버튼으로 언제든 다시 들어갈 수 있다). */
async function netJoinRoom(code, myName, onlyIfPlaying){
  NET.err=''; NET.status='connecting'; NET.myName=myName; renderSetup();
  try{
    await netAuth();
    const sb=netClient();
    const { data:row, error }=await sb.rpc('join_room', { p_code:code });
    if(error) throw new Error(error.message||'방을 찾을 수 없습니다');
    if(row.map_id!==NET_MAP_ID) throw new Error('이 코드는 푸에르토리코 방이 아닙니다.');
    if(onlyIfPlaying&&row.status!=='playing'){ NET.status='idle'; NET.on=false; renderSetup(); return; }
    NET.on=true; NET.host=(row.host_client_id===netClientId()); NET.room=row;
    NET.status=(row.status==='playing')?'playing':'lobby';
    netSaveSession();
    netConnect(()=>{
      if(NET.host){
        // 내가 만든 방에 재접속(F5·탭 복구) — DB 스냅샷으로 게임을 되살려 다시 호스트가 된다
        NET.mySeat=0;
        if(row.status==='playing'&&row.snapshot){ G=row.snapshot; netHostStart(true); }
        else renderSetup();
      } else {
        netSend('intent', { t:'claim', clientId:netClientId(), name:myName });
      }
    });
  }catch(e){
    NET.err=e.message; NET.status='idle'; NET.on=false;
    // 방이 사라졌거나 코드가 틀렸으면 저장된 세션을 버린다 — 남겨두면 새로고침마다 같은 실패를 반복한다.
    // 일시적 네트워크 오류는 세션을 남겨 설정 화면의 "이어서" 버튼으로 다시 시도할 수 있게 한다.
    if(/찾을 수 없|not found|제한되었습니다/.test(e.message||'')) netClearSession();
    renderSetup();
  }
}

/* ── 공개방 목록 — 대기 중 + 최근 2분 내 활동(호스트 하트비트 45초)만 살아 있는 방으로 본다 ── */
async function netListPublicRooms(){
  if(!netConfigured()) return [];
  try{
    const { data }=await netClient().from('public_rooms').select('*')
      .eq('map_id', NET_MAP_ID).order('updated_at', {ascending:false}).limit(20);
    NET.pubRooms=(data||[]).filter(r=>Date.now()-new Date(r.updated_at).getTime()<120000);
  }catch(e){ NET.pubRooms=NET.pubRooms||[]; }
  return NET.pubRooms;
}

function netSaveSession(){ try{ lsSet('pr1897_net_room', JSON.stringify({code:NET.room.code, name:NET.myName})); }catch(e){} }
function netSavedSession(){ try{ return JSON.parse(lsGet('pr1897_net_room')||'null'); }catch(e){ return null; } }
function netClearSession(){ lsDel('pr1897_net_room'); }

/* ── 채널 연결 ── */
function netConnect(onReady){
  const cid=netClientId();
  const chan=netClient().channel('room:'+NET.room.code, {
    config:{ presence:{ key:cid }, private:true, broadcast:{ self:false } },
  });
  chan
    .on('broadcast', { event:'intent' }, ({payload})=>{ if(NET.host) netOnIntent(payload); })
    .on('broadcast', { event:'snapshot' }, ({payload})=>{ if(!NET.host) netOnSnapshot(payload); })
    .on('broadcast', { event:'fx' }, ({payload})=>{ if(!NET.host) netOnFx(payload); })
    .on('broadcast', { event:'chat' }, ({payload})=>netOnChat(payload))
    .on('broadcast', { event:'room' }, ({payload})=>netOnRoom(payload))
    .on('presence', { event:'sync' }, ()=>{
      NET.presence=Object.keys(chan.presenceState());
      netCheckHostTakeover();   // 호스트가 사라졌는가 (게스트 관점)
      netCheckGuestOff();       // 게스트가 사라졌는가 (호스트 관점)
      netUiRefresh();
    })
    .subscribe(async (st)=>{
      if(st==='SUBSCRIBED'){
        NET.connected=true; NET.reconnN=0; clearTimeout(NET.reconnT); NET.reconnT=0;
        if(/다시 연결하는 중/.test(NET.err||'')) NET.err='';
        await chan.track({ at:Date.now() });
        if(onReady){ const f=onReady; onReady=null; f(); }
        netUiRefresh();
      } else if(st==='CHANNEL_ERROR'||st==='TIMED_OUT'||st==='CLOSED'){
        NET.connected=false;
        netScheduleReconnect();
      }
    });
  NET.chan=chan;
}
function netSend(event, payload){ if(NET.chan) NET.chan.send({ type:'broadcast', event, payload }); }

/* ── 호스트: intent 처리 ──
   게스트가 보낸 값은 전부 의심한다: ① 같은 intent 중복 도착(더블클릭·재전송) 제거
   ② 현재 pending에 대해 인자가 유효한지 검증 ③ 예외는 격리 — 불량 intent가 호스트 게임을 죽이면 안 된다 */
const NET_SEEN_IDS=[];
function netOnIntent(m){
  if(!m||!m.t) return;
  if(m.id){
    if(NET_SEEN_IDS.includes(m.id)) return;
    NET_SEEN_IDS.push(m.id);
    if(NET_SEEN_IDS.length>80) NET_SEEN_IDS.shift();
  }
  try{
    if(m.t==='claim'){ netHostClaim(m); return; }
    if(NET.status!=='playing'||!G) return;
    const seat=NET.room.seats.findIndex(s=>s.clientId===m.clientId);
    if(seat<0) return;
    const pd=G.pending;
    if(m.t==='reportDone'){ if(pd&&pd.type==='report') actReportDone(seat); return; }
    if(!pd||pd.player!==seat) return;   // 그 사람 차례가 아니면 무시
    if(m.t==='mayor'&&pd.type==='mayorPlace'){ netApplyMayor(seat, m); return; }
    if(m.t!=='act') return;
    if(!netValidIntent(pd, seat, m.fn, m.args||[])) return;
    // 함수 화이트리스트 — 게스트가 보낸 이름을 그대로 호출하지 않는다
    const FNS={ actSettler, actBuild, actCraftBonus, actTrade, actCaptain, actStorage };
    if(m.fn==='pickRole'){ pickRole(seat, m.args[1]); return; }   // pi는 좌석에서 — 게스트 값 안 믿음
    const fn=FNS[m.fn];
    if(fn) fn.apply(null, m.args||[]);
  }catch(e){
    console.error('intent 처리 실패', e, m);
    log('⚠️ 원격 행동 처리에 실패했습니다: '+e.message);
    render();
  }
}
/* 현재 pending 기준으로 intent 인자가 말이 되는지 — 낡은(중복) 요청과 조작된 요청을 걸러낸다 */
function netValidIntent(pd, seat, fn, a){
  const p=P(seat);
  switch(fn){
    case 'pickRole':   return pd.type==='pickRole' && !!G.roles[a[1]] && G.roles[a[1]].takenBy===null;
    case 'actSettler':
      if(pd.type!=='settler') return false;
      if(a[0]==='display') return G.supply.display[a[1]]!==undefined;
      if(a[0]==='quarry')  return settlerCanQuarry(seat);
      if(a[0]==='deck')    return !pd.haciendaUsed && occB(p,'b_hac');
      return a[0]==='skip';
    case 'actBuild':   return pd.type==='builder' && (a[0]==='skip' || canBuild(p, a[0], seat===G.phase.chooser));
    case 'actCraftBonus': return pd.type==='craftBonus' && G.phase.bonusOptions.includes(a[0]);
    case 'actTrade':   return pd.type==='trader' && (a[0]==='skip' || sellableTypes(p).includes(a[0]));
    case 'actCaptain':
      if(pd.type!=='captain') return false;
      if(a[0]==='ship')  return !!(pd.opts&&pd.opts[a[1]]);
      if(a[0]==='wharf') return pd.wharfOK && p.goods[a[1]]>0;
      return a[0]==='pass' && pd.mayPass;
    case 'actStorage':
      return pd.type==='storage' && Array.isArray(a[0]) && a[0].length<=pd.cap
        && a[0].every(t=>GTYPES.includes(t)) && (a[1]===null||GTYPES.includes(a[1]));
    default: return false;
  }
}
/* 게스트의 일꾼 배치 결과를 검증 후 반영 — 일꾼 총량이 보존돼야 한다 */
function netApplyMayor(seat, m){
  const p=P(seat);
  const before=totalWorkersOf(p);
  let used=0;
  const land=(m.land||[]).map(w=>w?1:0);
  for(const w of land) used+=w;
  const bldW={};
  for(const b of p.buildings){
    const w=Math.max(0, Math.min(BUILDINGS[b.id].slots, (m.bld&&m.bld[b.id])|0));
    bldW[b.id]=w; used+=w;
  }
  if(used>before) return;   // 없는 일꾼을 만들어내려는 요청 — 무시
  p.land.forEach((l,i)=>{ l.w=land[i]||0; });
  p.buildings.forEach(b=>{ b.w=bldW[b.id]; });
  p.stored=before-used;
  log(pname(p)+' — 일꾼 배치 완료 (보관 '+p.stored+'개)');
  toast(pname(p)+' — 일꾼 배치 완료', 'pboard-'+p.i, false, PCOLOR[p.i]);
  actMayorDone();
}
/* 호스트: 좌석 배정 (신규 참가·재접속 겸용) */
async function netHostClaim(m){
  const seats=NET.room.seats;
  let seat=seats.findIndex(s=>s.clientId===m.clientId);        // 같은 탭 재접속(F5)
  if(seat<0) seat=seats.findIndex(s=>s.kind==='human'&&!s.clientId);  // 빈 친구 자리
  if(seat<0) return;   // 자리 없음 (조용히 무시 — 게스트는 room 브로드캐스트를 못 받으면 대기 표시)
  seats[seat]={...seats[seat], clientId:m.clientId, name:uniqueName(m.name||'게스트', netTakenNames(seat))};
  await netUpdateRoom({ seats });
  netSend('room', NET.room);
  if(NET.status==='playing'&&G){
    // 진행 중 재입장: 이름 반영 + 최신 상태 전달
    if(G.players[seat]) G.players[seat].name=seats[seat].name;
    netPushState();
  }
  netUiRefresh();
}
async function netUpdateRoom(patch){
  Object.assign(NET.room, patch);
  const sb=netClient();
  const row={};
  if(patch.seats) row.seats=patch.seats;
  if(patch.status) row.status=patch.status;
  if(patch.snapshot!==undefined) row.snapshot=patch.snapshot;
  await sb.from('rooms').update(row).eq('id', NET.room.id);
}

/* ── 방 메타 수신 (게스트) ── */
function netOnRoom(room){
  // 호스트가 방을 닫음 — 통지 없이 두면 게스트는 재연결만 반복하다 실패한다
  if(room.status==='finished'&&!NET.host){ netLeave('호스트가 방을 닫아 게임이 종료되었습니다.'); return; }
  NET.room=room;
  const cid=netClientId();
  /* 이중 호스트 방지 — 내가 호스트인데 방이 다른 호스트를 가리키면(승계 직후 옛 호스트 복귀)
     게스트로 강등한다. broadcast는 self=false라 이 통지는 항상 남이 보낸 것이다. */
  if(NET.host&&room.host_client_id&&room.host_client_id!==cid){
    NET.host=false; NET.rev=0;
    netStopHeartbeat();
    clearTimeout(NET.saveT);                    // 디바운스된 낡은 snapshot이 새 호스트의 DB 기록을 덮지 않게
    clearTimeout(aiTimer);                      // 걸려 있던 엔진(AI·phaseEnd) 타이머 중단 — 이제 새 호스트가 굴린다
    for(const k in NET.orig) globalThis[k]=NET.orig[k];   // fx 중계 훅 원복 (안 풀면 게스트인데 fx를 계속 쏜다)
    NET.orig={};
    netWrapActs();
  }
  NET.mySeat=room.seats.findIndex(s=>s.clientId===cid);
  // 호스트가 중복을 피해 이름을 바꿨을 수 있다 — 내 화면의 이름도 그 값으로 맞춘다
  if(NET.mySeat>=0&&room.seats[NET.mySeat].name){ NET.myName=room.seats[NET.mySeat].name; setupName=NET.myName; }
  if(room.status==='playing'&&NET.status!=='playing'){ NET.status='playing'; netGuestStart(); }
  netCheckHostTakeover();
  netCheckGuestOff();
  netUiRefresh();
}

/* ── 게임 시작 ── */
function netHostStart(resume){
  NET.status='playing';
  netStopHeartbeat();
  if(!resume){
    const seats=NET.room.seats;
    netUpdateRoom({ status:'playing' });
    newGame(seats.map(s=>({ name:s.name||'빈 자리', ai:s.kind==='ai' })));
  }
  netSend('room', NET.room);
  netHookFx();
  if(resume){ render(); schedule(); }
  netPushState();
}
function netGuestStart(){
  netWrapActs();
  rdReset();
  // 첫 snapshot이 오기 전까지는 DB 스냅샷으로라도 그린다 (덱은 가려서)
  if(!G&&NET.room.snapshot) G=netStripDeck(NET.room.snapshot);
  if(G) render();
}
function uiNetStartGame(){
  // 시작 조건(쇼케이스와 동일): AI 좌석이거나, 착석자가 "실제 접속 중"이어야 한다 —
  // 나갔다 안 돌아온 좌석은 미준비로 취급 (그 사람 차례에 게임이 멈춘다)
  const notReady=NET.room.seats.filter(s=>!(s.kind==='ai'||(s.clientId&&NET.presence.includes(s.clientId)))).length;
  if(notReady>0){ NET.err='모든 자리가 차야 시작할 수 있어요. 빈자리는 [⇆] 버튼으로 BOT으로 바꿀 수 있습니다.'; netUiRefresh(); return; }
  NET.err='';
  netHostStart(false);
}
/* 대기실: 빈 친구 자리 ↔ AI 전환 (호스트 전용)
   접속이 끊긴(나가버린) 좌석도 전환 가능 — 대기실 좌석 행의 [⇆] 버튼이 끊긴 좌석에도
   보이므로, 여기서 clientId만 보고 거부하면 버튼이 눌러도 조용히 무시된다 */
async function uiNetToggleSeat(i){
  const s=NET.room.seats[i];
  if(!s) return;
  if(s.clientId&&NET.presence.includes(s.clientId)) return;   // 접속 중인 사람 자리는 못 바꾼다
  const toAi=s.kind!=='ai';
  // 봇 이름은 테마 이름 중 이 방에서 아직 안 쓰인 것 — 전환 순서가 어떻든 중복되지 않는다
  const used=NET.room.seats.filter(x=>x.kind==='ai').map(x=>x.name);
  const botName=NET_AI_NAMES.find(n=>!used.includes(n))||NET_AI_NAMES[i%4];
  NET.room.seats[i]={...s, kind:toAi?'ai':'human', name:toAi?botName:'', clientId:null};
  await netUpdateRoom({ seats:NET.room.seats });
  netSend('room', NET.room);
  netUiRefresh();
}

/* ── 상태 동기화 ── */
function netStripDeck(g){
  if(!g||!g.supply) return g;
  return {...g, supply:{...g.supply, deck:g.supply.deck.map(()=>'?')}};  // 길이만 남기고 내용은 가린다
}
function netPushState(){
  if(!NET.on||!NET.host||!G) return;
  NET.rev++;
  const g=netStripDeck(G);
  netSend('snapshot', { rev:NET.rev, from:netClientId(), g:{...g, log:G.log.slice(-150)} });
  // DB에는 완전한 상태를 저장 (호스트 재접속·복구용). 디바운스 1초 — 매 행동마다 쓰지 않는다
  clearTimeout(NET.saveT);
  NET.saveT=setTimeout(()=>{ netUpdateRoom({ snapshot:G, status:G&&G.over?'playing':NET.room.status }); }, 1000);
}
function netOnSnapshot(m){
  if(!m||m.rev<=NET.rev) return;   // 역순 도착 무시
  // 호스트가 보낸 것만 반영 — 채널 참가자(게스트)도 브로드캐스트는 쏠 수 있다
  if(NET.room&&NET.room.host_client_id&&m.from!==NET.room.host_client_id) return;
  NET.rev=m.rev;
  G=m.g;
  if(NET.status!=='playing'){ NET.status='playing'; netWrapActs(); rdReset(); }
  render();
}

/* ── 연출 중계 — 호스트의 토스트·팝·스플래시를 게스트도 그대로 본다 ── */
function netHookFx(){
  if(NET.orig.toast) return;   // 이미 감쌈
  const fwd=(name)=>{
    NET.orig[name]=globalThis[name];
    globalThis[name]=function(...a){ netSend('fx', { fn:name, args:a }); return NET.orig[name].apply(null, a); };
  };
  ['toast','phaseFlash','markFxKeys','markPanelFx'].forEach(fwd);
  NET.orig.roleSplash=globalThis.roleSplash;
  globalThis.roleSplash=function(roleId, p){
    netSend('fx', { fn:'roleSplash', args:[roleId, {i:p.i, name:p.name}] });
    return NET.orig.roleSplash(roleId, p);
  };
}
function netOnFx(m){
  if(!m||!m.fn) return;
  const OK={ toast, phaseFlash, markFxKeys, markPanelFx, roleSplash };
  const fn=OK[m.fn];
  if(fn) try{ fn.apply(null, m.args||[]); }catch(e){}
}

/* ── 게스트: 행동 진입점을 intent 전송으로 감싼다 ── */
function netWrapActs(){
  if(NET.host||NET.orig.actBuild) return;
  const cid=netClientId();
  const mid=()=>crypto.randomUUID();   // 멱등성 키 — 재전송·더블클릭 중복을 호스트가 걸러낸다
  const wrap=(name)=>{
    NET.orig[name]=globalThis[name];
    globalThis[name]=function(...args){
      netSend('intent', { t:'act', id:mid(), clientId:cid, fn:name, args });
    };
  };
  ['pickRole','actSettler','actBuild','actCraftBonus','actTrade','actCaptain','actStorage'].forEach(wrap);
  NET.orig.actReportDone=globalThis.actReportDone;
  globalThis.actReportDone=function(){ netSend('intent', { t:'reportDone', id:mid(), clientId:cid }); };
  // 일꾼 배치: 로컬에서 자유롭게 토글한 결과를 통째로 보낸다 (호스트가 총량 검증)
  NET.orig.actMayorDone=globalThis.actMayorDone;
  globalThis.actMayorDone=function(){
    const p=P(G.pending.player);
    const bld={}; p.buildings.forEach(b=>bld[b.id]=b.w);
    netSend('intent', { t:'mayor', id:mid(), clientId:cid, land:p.land.map(l=>l.w), bld, stored:p.stored });
  };
}

/* ══ 연결 끊김 처리 (aos_showcase와 같은 방식) ══ */

/* ① 순단 자동 재연결 — 채널이 끊기면 같은 방 코드로 다시 붙는다 (호스트는 복귀, 게스트는 재입장) */
function netScheduleReconnect(){
  if(!NET.on||NET.reconnT) return;
  if(NET.reconnN>=MAX_RECONNECT){
    NET.err='연결이 끊어졌습니다. 새로고침하면 다시 시도합니다.';
    netUiRefresh(); return;
  }
  NET.reconnN++;
  NET.err='연결이 끊겼습니다. 다시 연결하는 중…';
  netUiRefresh();
  NET.reconnT=setTimeout(function(){
    NET.reconnT=0;
    if(!NET.on||NET.connected) return;
    const name=NET.myName;
    try{ if(NET.chan) netClient().removeChannel(NET.chan); }catch(e){}
    NET.chan=null;
    netConnect(function(){ if(!NET.host) netSend('intent', { t:'claim', clientId:netClientId(), name:name }); });
  }, RECONNECT_DELAY);
}

/* ② 호스트 이탈 → 게스트에게 승계를 묻는다 (6초 유예 · 후계자 = 접속 중인 최소 좌석) */
function netHostAbsent(){
  const h=NET.room&&NET.room.host_client_id;
  return !!h && NET.presence.indexOf(h)<0;
}
function netSuccessor(){
  const c=(NET.room?NET.room.seats:[]).filter(s=>s.kind==='human'&&s.clientId&&NET.presence.indexOf(s.clientId)>=0)
    .sort((a,b)=>a.seat-b.seat);
  return c.length?c[0].clientId:null;
}
function netClearTakeover(){
  clearTimeout(NET.takeoverT); NET.takeoverT=0;
  if(NET.takeover){ NET.takeover=null; netUiRefresh(); }
}
function netCheckHostTakeover(){
  if(NET.host||!NET.on||!NET.room) return netClearTakeover();
  if(!netHostAbsent()) return netClearTakeover();          // 호스트 복귀 — 그대로 진행
  const can=(netSuccessor()===netClientId());
  if(NET.takeover){                                        // 이미 안내 중 — 자격 변화만 갱신
    if(NET.takeover.can!==can){ NET.takeover={status:NET.room.status, can:can}; netUiRefresh(); }
    return;
  }
  if(NET.takeoverT) return;                                // 유예 대기 중
  NET.takeoverT=setTimeout(function(){
    NET.takeoverT=0;
    if(NET.host||!NET.on||!NET.room||!netHostAbsent()) return;   // 그새 복귀
    NET.takeover={status:NET.room.status, can:(netSuccessor()===netClientId())};
    netUiRefresh();
  }, HOST_TAKEOVER_DELAY);
}
/* 게스트가 "이어받기"를 고름 — 이 클라이언트가 호스트가 되어 엔진을 잇는다 */
async function uiNetTakeover(){
  if(NET.host||!NET.room||!netHostAbsent()) return netClearTakeover();
  const wasPlaying=(NET.room.status==='playing');
  const oldHost=NET.room.host_client_id;
  const oldSeatObj=NET.room.seats.find(s=>s.clientId===oldHost);
  const oldSeat=oldSeatObj?oldSeatObj.seat:undefined;
  netClearTakeover();
  // 게스트 모드에서 감쌌던 행동 진입점을 원복 — 이제 내가 직접 엔진을 돌린다
  for(const k in NET.orig) globalThis[k]=NET.orig[k];
  NET.orig={};
  NET.host=true;
  const meSeat=NET.room.seats.find(s=>s.clientId===netClientId());
  NET.mySeat=meSeat?meSeat.seat:NET.mySeat;
  // 끊긴 옛 호스트 자리는 봇으로 — 돌아오길 기다리며 게임이 멈추지 않게
  const seats=NET.room.seats.map(s=>s.clientId===oldHost?Object.assign({}, s, {kind:'ai', clientId:null}):s);
  if(wasPlaying&&G&&oldSeat!==undefined&&G.players[oldSeat]){
    G.players[oldSeat].ai=true;
    log(pname(P(oldSeat))+' — 호스트 연결이 끊겨 BOT이 이어받습니다.');
  }
  NET.room.host_client_id=netClientId(); NET.room.host_uid=NET.uid;
  await netUpdateRoom({ seats:seats, host_client_id:netClientId(), host_uid:NET.uid });
  netSend('room', NET.room);
  netHookFx();
  netHeartbeat();
  if(wasPlaying&&G){ toast('<b>호스트를 이어받았습니다</b>', null, true); schedule(); }
  else netUiRefresh();
}
/* 게스트가 "나가기"를 고름 */
function uiNetTakeoverLeave(){ netClearTakeover(); netLeave(); }

/* ③ 게스트 이탈 → 호스트에게 AI 전환을 제안 (10초 유예) */
function netOfflineSeat(){
  if(!NET.room) return null;
  return NET.room.seats.find(s=>s.kind==='human'&&s.clientId&&s.clientId!==netClientId()
    &&NET.presence.indexOf(s.clientId)<0&&NET.dismissed.indexOf(s.seat)<0)||null;
}
function netCheckGuestOff(){
  if(!NET.host||!NET.on||!NET.room||NET.room.status!=='playing'){
    clearTimeout(NET.offT); NET.offT=0;
    if(NET.offSeat){ NET.offSeat=null; netUiRefresh(); }
    return;
  }
  const off=netOfflineSeat();
  if(!off){                                   // 전원 복귀
    clearTimeout(NET.offT); NET.offT=0;
    if(NET.offSeat){ NET.offSeat=null; netUiRefresh(); }
    return;
  }
  if(NET.offSeat||NET.offT) return;           // 이미 묻는 중/대기 중
  NET.offT=setTimeout(function(){
    NET.offT=0;
    const still=netOfflineSeat();
    if(NET.host&&still){ NET.offSeat={seat:still.seat, name:still.name}; netUiRefresh(); }
  }, GUEST_GRACE);
}
/* 호스트: "계속 기다리기" — 이 좌석은 다시 묻지 않는다 (돌아오면 자동 해제) */
function uiNetKeepWaiting(seat){
  if(NET.dismissed.indexOf(seat)<0) NET.dismissed.push(seat);
  NET.offSeat=null; netUiRefresh();
}

/* ── 접속 끊긴 사람 자리 AI 대체 (호스트 전용, CLAUDE.md 필수 항목) ── */
function netSeatDisconnected(pi){
  if(!NET.on||NET.status!=='playing') return false;
  const s=NET.room.seats[pi];
  return !!s && s.kind==='human' && pi!==NET.mySeat && (!s.clientId || !NET.presence.includes(s.clientId));
}
function uiNetAiTakeover(pi){
  if(!NET.host||!G||!G.players[pi]) return;
  NET.offSeat=null; clearTimeout(NET.offT); NET.offT=0;
  const di=NET.dismissed.indexOf(pi); if(di>=0) NET.dismissed.splice(di,1);
  G.players[pi].ai=true;
  NET.room.seats[pi]={...NET.room.seats[pi], kind:'ai', clientId:null};
  netUpdateRoom({ seats:NET.room.seats });
  netSend('room', NET.room);
  log(pname(P(pi))+' — 연결이 끊겨 AI가 이어받습니다.');
  // 결과 확인 대기 중이었으면 재평가 — 이 좌석이 마지막 미확인자였다면 여기서 풀어야 안 멈춘다
  if(G.pending&&G.pending.type==='report'){ actReportDone(pi); return; }
  schedule();
}

/* ── 채팅 ── */
function netSendChat(text){
  text=String(text||'').trim().slice(0,300);
  if(!text||!NET.on) return;
  const m={ clientId:netClientId(), name:NET.myName||'나', text, at:Date.now() };
  netSend('chat', m);          // self=false — 내 화면에는 직접 넣는다
  NET.chat.push(m);
  netChatRender();
}
function netOnChat(m){
  if(!m||!m.text) return;
  NET.chat.push(m);
  if(!uiChatOpen) NET.chatUnread++;
  netChatDing();
  netChatRender();
}
function netChatDing(){
  try{
    if(!NET.audio) NET.audio=new AudioContext();
    const ctx=NET.audio; if(ctx.state==='suspended') ctx.resume();
    const t=ctx.currentTime, g=ctx.createGain();
    g.connect(ctx.destination);
    g.gain.setValueAtTime(0.0001,t);
    g.gain.exponentialRampToValueAtTime(0.06,t+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001,t+0.35);
    const o=ctx.createOscillator();
    o.type='sine'; o.frequency.setValueAtTime(880,t); o.frequency.setValueAtTime(1174.66,t+0.09);
    o.connect(g); o.start(t); o.stop(t+0.4);
  }catch(e){}
}

/* ── 대기실 하트비트 (updated_at 갱신 — 유령 방 정리 크론의 기준) ── */
function netHeartbeat(){
  netStopHeartbeat();
  NET.hbT=setInterval(()=>{ if(NET.host&&NET.status==='lobby') netClient().from('rooms').update({ updated_at:new Date().toISOString() }).eq('id', NET.room.id); }, 45000);
}
function netStopHeartbeat(){ clearInterval(NET.hbT); }

/* ── 나가기 ── msg: 나간 뒤 설정 화면에 보여줄 안내 (예: 호스트가 방을 닫음) */
async function netLeave(msg){
  netStopHeartbeat();
  clearTimeout(NET.takeoverT); clearTimeout(NET.offT); clearTimeout(NET.reconnT); clearTimeout(NET.saveT);
  try{
    if(NET.host&&NET.room){
      netSend('room', {...NET.room, status:'finished'});   // 게스트에게 "방이 닫혔다" 통지
      await netClient().from('rooms').update({ status:'finished' }).eq('id', NET.room.id);
      await netClient().from('rooms').delete().eq('id', NET.room.id);
    }
  }catch(e){}
  if(NET.chan){ try{ netClient().removeChannel(NET.chan); }catch(e){} }
  // 감쌌던 전역 함수 복구
  for(const k in NET.orig) globalThis[k]=NET.orig[k];
  NET.orig={};
  netClearSession();
  Object.assign(NET, { on:false, host:false, status:'idle', chan:null, room:null, mySeat:null, presence:[],
    chat:[], chatUnread:0, rev:0, err:msg||'', takeover:null, takeoverT:0, offSeat:null, offT:0,
    reconnT:0, reconnN:0, connected:true, dismissed:[] });
  G=null;
  renderSetup();
}
function uiNetLeave(){ if(confirm(NET.host?'방을 닫을까요? (전원 퇴장됩니다)':'방에서 나갈까요?')) netLeave(); }

/* ── 재접속 (설정 화면의 "이어서" 버튼) ── */
function uiNetResume(){
  const s=netSavedSession();
  if(s) netJoinRoom(s.code, s.name);
}

/* ── 연결 끊김 안내 HTML (게임·대기실 공용) ──
   ① 게스트: 호스트가 사라짐 → 이어받기/나가기 (후계자가 아니면 기다리라는 안내만)
   ② 호스트: 게스트가 사라짐 → BOT 전환/계속 기다리기
   ③ 내 연결이 끊김 → 재연결 중 표시 */
function netStatusHtml(){
  if(!NET.on) return '';
  if(NET.takeover){
    const playing=(NET.takeover.status==='playing');
    return '<div class="overlay netov"><div class="modal netbox">'
      +'<h3>호스트 연결이 끊겼습니다</h3>'
      +'<p>'+(playing
        ? '방을 만든 사람의 연결이 끊겨 게임이 멈춰 있습니다.'
        : '방을 만든 사람의 연결이 끊겼습니다.')
      +(NET.takeover.can
        ? '<br>내가 이어받으면 그 자리는 BOT이 맡고 게임이 계속됩니다.'
        : '<br>다른 참가자가 이어받기를 기다리는 중입니다.')+'</p>'
      +'<div class="btns">'
      +(NET.takeover.can?'<button class="aos-btnp" onclick="uiNetTakeover()">이어받아 계속하기</button>':'')
      +'<button class="aos-btns" onclick="uiNetTakeoverLeave()">나가기</button>'
      +'</div></div></div>';
  }
  if(NET.host&&NET.offSeat){
    const s=NET.offSeat;
    return '<div class="overlay netov"><div class="modal netbox">'
      +'<h3>'+esc(s.name)+'님의 연결이 끊겼습니다</h3>'
      +'<p>계속 기다리거나, 그 자리를 BOT이 이어받게 할 수 있습니다.<br>'
      +'BOT으로 바꾸면 그 사람이 돌아와도 다시 앉을 수 없습니다.</p>'
      +'<div class="btns">'
      +'<button class="aos-btnp" onclick="uiNetAiTakeover('+s.seat+')">BOT이 이어받기</button>'
      +'<button class="aos-btns" onclick="uiNetKeepWaiting('+s.seat+')">계속 기다리기</button>'
      +'</div></div></div>';
  }
  if(!NET.connected){
    return '<div class="netreconn">'+aosIcon('loader',13)+' 연결이 끊겼습니다 — 다시 연결하는 중'
      +(NET.reconnN>1?' ('+NET.reconnN+'/'+MAX_RECONNECT+')':'')+'</div>';
  }
  return '';
}

/* 화면 갱신 — 대기실이면 대기실을, 게임 중이면 게임을 다시 그린다 */
function netUiRefresh(){
  if(NET.status==='lobby'||NET.status==='connecting') renderSetup();
  else if(G) render();
  netChatRender();
}

/* 대기실에서 내 이름 바꾸기 — 호스트는 좌석을 직접 고치고, 게스트는 claim을 다시 보낸다
   (같은 clientId의 claim은 좌석 유지 + 이름 갱신으로 처리된다) */
function uiNetRename(name){
  name=String(name||'').trim().slice(0,12)||'플레이어';
  NET.myName=name; setupName=name;
  netSaveSession();
  if(NET.host){
    name=uniqueName(name, netTakenNames(NET.mySeat));
    NET.myName=name; setupName=name;
    NET.room.seats[NET.mySeat]={...NET.room.seats[NET.mySeat], name};
    netUpdateRoom({ seats:NET.room.seats });
    netSend('room', NET.room);
    netUiRefresh();
  } else {
    netSend('intent', { t:'claim', clientId:netClientId(), name });
  }
}

/* ═══ 채팅 플로팅 위젯 — 대기실·게임 공용. render()와 무관하게 body에 직접 그린다
   (토스트와 같은 층위 — 게임 렌더가 아무리 자주 돌아도 채팅 입력이 안 끊긴다) ═══ */
let uiChatOpen=false;
function uiToggleChat(){
  uiChatOpen=!uiChatOpen;
  if(uiChatOpen) NET.chatUnread=0;
  netChatRender();
  if(uiChatOpen){ const inp=document.getElementById('pr-chat-in'); if(inp) inp.focus(); }
}
function uiChatSend(){
  const inp=document.getElementById('pr-chat-in');
  if(!inp||!inp.value.trim()) return;
  netSendChat(inp.value);
  inp.value='';
  inp.focus();
}
function uiChatKey(e){ if(e.key==='Enter'&&!e.isComposing) uiChatSend(); }
/* 대기실 인라인 채팅 입력 */
function uiLobbyChatSend(){
  const inp=document.getElementById('lb-chat-in');
  if(!inp||!inp.value.trim()) return;
  netSendChat(inp.value);
  inp.value='';
  inp.focus();
}
function uiLobbyChatKey(e){ if(e.key==='Enter'&&!e.isComposing) uiLobbyChatSend(); }
function netChatRender(){
  if(typeof document==='undefined'||!document.body||!document.getElementById) return;
  // 로컬 게임에는 채팅이 없다 — 온라인 여부를 가장 먼저 본다 (render()가 매 프레임 부르므로)
  if(!NET.on){ const old=document.getElementById('pr-chat'); if(old&&old.remove) old.remove(); return; }
  const msgsHtml=()=>NET.chat.slice(-80).map(m=>
    '<div class="cmsg"><b'+(m.clientId===netClientId()?' class="me"':'')+'>'+esc(m.name)+'</b> '+esc(m.text)+'</div>'
  ).join('');
  // 대기실: 인라인 채팅 박스가 있으면 그 목록만 갱신 (입력창은 renderLobby가 만든 그대로 유지)
  const ll=document.getElementById('lb-chat-list');
  if(ll&&ll.dataset){
    if(ll.dataset.n!==String(NET.chat.length)){
      ll.dataset.n=String(NET.chat.length);
      ll.innerHTML=msgsHtml()||'<div class="cempty">대기실 채팅</div>';
      ll.scrollTop=ll.scrollHeight;
    }
    const fab=document.getElementById('pr-chat'); if(fab) fab.remove();  // 대기실에선 플로팅 버튼 숨김
    return;
  }
  let host=document.getElementById('pr-chat');
  const show=(NET.status==='playing');   // 플로팅 위젯은 게임 중에만 (대기실은 위 인라인 박스)
  if(!show){ if(host) host.remove(); return; }
  if(!host){
    host=document.createElement('div');
    host.id='pr-chat';
    document.body.appendChild(host);
  }
  const msgs=NET.chat.slice(-80).map(m=>
    '<div class="cmsg"><b'+(m.clientId===netClientId()?' class="me"':'')+'>'+esc(m.name)+'</b> '+esc(m.text)+'</div>'
  ).join('')||'<div class="cempty">아직 메시지가 없습니다</div>';
  // 입력 중 리렌더로 input이 갈리면 타이핑이 끊긴다 — 목록만 갱신하고 껍데기는 유지
  if(uiChatOpen&&document.getElementById('pr-chat-list')){
    const list=document.getElementById('pr-chat-list');
    if(list.dataset.n!==String(NET.chat.length)){
      list.dataset.n=String(NET.chat.length);
      list.innerHTML=msgs;
      list.scrollTop=list.scrollHeight;
    }
    return;
  }
  host.innerHTML=
    (uiChatOpen
      ?'<div class="cpanel">'
        +'<div class="chead"><span>💬 채팅</span><button onclick="uiToggleChat()" aria-label="채팅 닫기">✕</button></div>'
        +'<div class="clist" id="pr-chat-list" data-n="'+NET.chat.length+'">'+msgs+'</div>'
        +'<div class="cinput"><input id="pr-chat-in" maxlength="300" placeholder="메시지…" onkeydown="uiChatKey(event)">'
        +'<button onclick="uiChatSend()" aria-label="전송">➤</button></div>'
        +'</div>'
      :'')
    +'<button class="cfab" onclick="uiToggleChat()" aria-label="채팅 열기">💬'
    +(!uiChatOpen&&NET.chatUnread>0?'<span class="cbadge">'+(NET.chatUnread>9?'9+':NET.chatUnread)+'</span>':'')
    +'</button>';
  if(uiChatOpen){ const list=document.getElementById('pr-chat-list'); if(list) list.scrollTop=list.scrollHeight; }
}
