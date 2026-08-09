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
};

const NET_CODE_CHARS='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  // I/O/0/1 제외 (구두로 불러줘도 안 헷갈림)
/* 1897 카리브 배경에 어울리는 스페인풍 이름 — 게임 몰입용 (사용자 요청) */
const NET_AI_NAMES=['AI 미겔','AI 카르멘','AI 디에고','AI 로시타'];

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
    let ai=0;
    const seats=[{seat:0, name:myName, kind:'human', clientId:cid, uid:NET.uid}];
    for(let i=1;i<n;i++){
      const isAi=seatKinds[i]==='ai';
      seats.push({seat:i, name:isAi?NET_AI_NAMES[ai++%4]:'', kind:isAi?'ai':'human', clientId:null});
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

/* ── 코드로 참가 (게스트) ── */
async function netJoinRoom(code, myName){
  NET.err=''; NET.status='connecting'; NET.myName=myName; renderSetup();
  try{
    await netAuth();
    const sb=netClient();
    const { data:row, error }=await sb.rpc('join_room', { p_code:code });
    if(error) throw new Error(error.message||'방을 찾을 수 없습니다');
    if(row.map_id!==NET_MAP_ID) throw new Error('이 코드는 푸에르토리코 방이 아닙니다.');
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
  }catch(e){ NET.err=e.message; NET.status='idle'; NET.on=false; renderSetup(); }
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
    .on('presence', { event:'sync' }, ()=>{ NET.presence=Object.keys(chan.presenceState()); netUiRefresh(); })
    .subscribe(async (st)=>{
      if(st==='SUBSCRIBED'){ await chan.track({ at:Date.now() }); if(onReady){ const f=onReady; onReady=null; f(); } }
      else if(st==='CHANNEL_ERROR'||st==='TIMED_OUT'){ NET.err='연결이 끊겼습니다. 잠시 후 자동 재연결합니다.'; netUiRefresh(); }
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
    if(m.t==='reportDone'){ if(pd&&pd.type==='report') actReportDone(); return; }
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
  seats[seat]={...seats[seat], clientId:m.clientId, name:(m.name||'게스트').slice(0,12)};
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
  NET.room=room;
  const cid=netClientId();
  NET.mySeat=room.seats.findIndex(s=>s.clientId===cid);
  if(room.status==='playing'&&NET.status!=='playing'){ NET.status='playing'; netGuestStart(); }
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
/* 대기실: 빈 친구 자리 ↔ AI 전환 (호스트 전용) */
async function uiNetToggleSeat(i){
  const s=NET.room.seats[i];
  if(!s||s.clientId) return;   // 사람이 앉은 자리는 못 바꾼다
  const toAi=s.kind!=='ai';
  NET.room.seats[i]={...s, kind:toAi?'ai':'human', name:toAi?NET_AI_NAMES[i%4]:'', clientId:null};
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
  netSend('snapshot', { rev:NET.rev, g:{...g, log:G.log.slice(-150)} });
  // DB에는 완전한 상태를 저장 (호스트 재접속·복구용). 디바운스 1초 — 매 행동마다 쓰지 않는다
  clearTimeout(NET.saveT);
  NET.saveT=setTimeout(()=>{ netUpdateRoom({ snapshot:G, status:G&&G.over?'playing':NET.room.status }); }, 1000);
}
function netOnSnapshot(m){
  if(!m||m.rev<=NET.rev) return;   // 역순 도착 무시
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

/* ── 접속 끊긴 사람 자리 AI 대체 (호스트 전용, CLAUDE.md 필수 항목) ── */
function netSeatDisconnected(pi){
  if(!NET.on||NET.status!=='playing') return false;
  const s=NET.room.seats[pi];
  return !!s && s.kind==='human' && pi!==NET.mySeat && (!s.clientId || !NET.presence.includes(s.clientId));
}
function uiNetAiTakeover(pi){
  if(!NET.host||!G||!G.players[pi]) return;
  G.players[pi].ai=true;
  NET.room.seats[pi]={...NET.room.seats[pi], kind:'ai', clientId:null};
  netUpdateRoom({ seats:NET.room.seats });
  netSend('room', NET.room);
  log(pname(P(pi))+' — 연결이 끊겨 AI가 이어받습니다.');
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

/* ── 나가기 ── */
async function netLeave(){
  netStopHeartbeat();
  try{
    if(NET.host&&NET.room){
      await netClient().from('rooms').update({ status:'finished' }).eq('id', NET.room.id);
      await netClient().from('rooms').delete().eq('id', NET.room.id);
    }
  }catch(e){}
  if(NET.chan){ try{ netClient().removeChannel(NET.chan); }catch(e){} }
  // 감쌌던 전역 함수 복구
  for(const k in NET.orig) globalThis[k]=NET.orig[k];
  NET.orig={};
  netClearSession();
  Object.assign(NET, { on:false, host:false, status:'idle', chan:null, room:null, mySeat:null, presence:[], chat:[], chatUnread:0, rev:0, err:'' });
  G=null;
  renderSetup();
}
function uiNetLeave(){ if(confirm(NET.host?'방을 닫을까요? (전원 퇴장됩니다)':'방에서 나갈까요?')) netLeave(); }

/* ── 재접속 (설정 화면의 "이어서" 버튼) ── */
function uiNetResume(){
  const s=netSavedSession();
  if(s) netJoinRoom(s.code, s.name);
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
  const msgsHtml=()=>NET.chat.slice(-80).map(m=>
    '<div class="cmsg"><b'+(m.clientId===netClientId()?' class="me"':'')+'>'+esc(m.name)+'</b> '+esc(m.text)+'</div>'
  ).join('');
  // 대기실: 인라인 채팅 박스가 있으면 그 목록만 갱신 (입력창은 renderLobby가 만든 그대로 유지)
  const ll=document.getElementById('lb-chat-list');
  if(ll){
    if(ll.dataset.n!==String(NET.chat.length)){
      ll.dataset.n=String(NET.chat.length);
      ll.innerHTML=msgsHtml()||'<div class="cempty">대기실 채팅</div>';
      ll.scrollTop=ll.scrollHeight;
    }
    const fab=document.getElementById('pr-chat'); if(fab) fab.remove();  // 대기실에선 플로팅 버튼 숨김
    return;
  }
  let host=document.getElementById('pr-chat');
  const show=NET.on&&NET.status==='playing';   // 플로팅 위젯은 게임 중에만
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
