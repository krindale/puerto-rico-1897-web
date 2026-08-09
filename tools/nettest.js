/* 온라인 동기화 루프백 테스트 — `node tools/nettest.js`
   호스트·게스트 게임을 각각 독립된 vm 컨텍스트로 띄우고, Supabase 대신 메모리 버스로 연결해
   2인 온라인 게임을 끝까지 돌린다. 실제 네트워크 없이 다음을 검증한다:
   - 방 생성 → 코드 참가 → 좌석 배정 → 게임 시작의 대기실 흐름
   - 게스트 행동(intent) → 호스트 적용 → snapshot 브로드캐스트 → 게스트 반영
   - 게스트에게 가는 snapshot의 농장 덱 가림('?')
   - 채팅 왕복
   전송 계층(진짜 Supabase 채널)은 여기서 검증되지 않는다 — 그건 실제 두 브라우저로 확인할 것. */
'use strict';
const fs=require('fs'), path=require('path'), vm=require('vm');
const ROOT=process.argv[2]||path.join(__dirname,'..');

/* ── 메모리 버스 + 가짜 rooms 테이블 ── */
const DB={ rooms:new Map() };            // code → row
const CHANNELS={};                        // code → [채널 인스턴스들]
const PRES={};                            // code → Set(clientId) — presence 흉내
let uidN=0;

function fakeSupabaseFor(label){
  return { createClient(){ return {
    auth:{
      async getSession(){ return { data:{ session:null } }; },
      async signInAnonymously(){ return { data:{ user:{ id:'uid-'+label+'-'+(++uidN) } }, error:null }; },
    },
    channel(name, opts){
      const code=name.replace('room:','');
      const key=opts&&opts.config&&opts.config.presence?opts.config.presence.key:label;
      const syncAll=()=>setImmediate(()=>{ (CHANNELS[code]||[]).forEach(o=>{ if(o.handlers.presence) o.handlers.presence(); }); });
      const ch={ code, key, handlers:{}, label,
        on(type, filt, cb){ ch.handlers[type==='presence'?'presence':filt.event]=cb; return ch; },
        subscribe(cb){ (CHANNELS[code]=CHANNELS[code]||[]).push(ch); if(cb) cb('SUBSCRIBED'); return ch; },
        async track(){ (PRES[code]=PRES[code]||new Set()).add(key); syncAll(); },
        presenceState(){ const o={}; (PRES[code]||new Set()).forEach(k=>o[k]=[{}]); return o; },
        send({event, payload}){  // self=false — 다른 쪽에만 전달
          const msg=JSON.parse(JSON.stringify(payload));  // 실제 전송처럼 구조 복사 (참조 공유 버그 검출)
          setImmediate(()=>{ (CHANNELS[code]||[]).forEach(o=>{ if(o!==ch&&o.handlers[event]) o.handlers[event]({ payload:msg }); }); });
        },
      };
      return ch;
    },
    removeChannel(ch){
      const a=CHANNELS[ch.code]||[]; const i=a.indexOf(ch); if(i>=0) a.splice(i,1);
      if(PRES[ch.code]) PRES[ch.code].delete(ch.key);
    },
    from(){ return {
      insert(row){ return { select(){ return { async single(){
        row.id='room-'+row.code; DB.rooms.set(row.code, row); return { data:JSON.parse(JSON.stringify(row)), error:null };
      } }; } }; },
      update(patch){ return { async eq(_k, id){
        for(const r of DB.rooms.values()) if(r.id===id) Object.assign(r, JSON.parse(JSON.stringify(patch)));
        return { error:null };
      } }; },
      delete(){ return { async eq(_k, id){ for(const [c,r] of DB.rooms) if(r.id===id) DB.rooms.delete(c); return { error:null }; } }; },
    }; },
    async rpc(_fn, { p_code }){
      const r=DB.rooms.get(p_code);
      return r?{ data:JSON.parse(JSON.stringify(r)), error:null }:{ data:null, error:{ message:'방을 찾을 수 없습니다' } };
    },
  }; } };
}

/* ── 게임 클라이언트 샌드박스 ── */
function makeClient(label){
  function makeEl(){ return { innerHTML:'', className:'', id:'', style:{setProperty(){},removeProperty(){}},
    children:{length:0}, clientWidth:1400, scrollTop:0, scrollHeight:0, firstElementChild:null,
    appendChild(){}, replaceChild(){}, remove(){}, classList:{toggle(){},add(){},remove(){}}, onclick:null, dataset:{}, focus(){}, value:'' }; }
  const els={};
  const sandbox={
    console,
    document:{ getElementById(id){ if(!(id in els)) els[id]=makeEl(); return els[id]; },
      createElement(){ const e=makeEl(); e.firstElementChild=makeEl(); return e; },
      addEventListener(){}, body:Object.assign(makeEl(),{ appendChild(){} }), lastModified:'01/01/2026' },
    innerWidth:1400, innerHeight:900,
    localStorage:(()=>{ const m={}; return { getItem:k=>(k in m?m[k]:null), setItem:(k,v)=>{m[k]=String(v);}, removeItem:k=>{delete m[k];} }; })(),
    sessionStorage:(()=>{ const m={}; return { getItem:k=>(k in m?m[k]:null), setItem:(k,v)=>{m[k]=String(v);}, removeItem:k=>{delete m[k];} }; })(),
    crypto:{ randomUUID:()=>label+'-'+Math.random().toString(36).slice(2) },
    alert(){}, confirm(){ return true; },
    setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms||0,1)), clearTimeout,
    setInterval:()=>0, clearInterval(){},
    setImmediate,
    navigator:{ clipboard:{ writeText(){} } },
    AudioContext:undefined,
    supabase:fakeSupabaseFor(label),
  };
  sandbox.window={ addEventListener(){}, self:{}, top:{}, parent:{ postMessage(){} } };
  sandbox.window.self=sandbox.window; sandbox.window.top=sandbox.window;
  sandbox.globalThis=sandbox;
  const ctx=vm.createContext(sandbox);
  const html=fs.readFileSync(path.join(ROOT,'game.html'),'utf8');
  const files=[...html.matchAll(/<script src="(js\/[^"]+)"/g)].map(m=>m[1]).filter(f=>!f.startsWith('js/vendor/'));
  for(const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'), ctx, { filename:label+':'+f });
  return { ctx, run:(code)=>vm.runInContext(code, ctx), label };
}

const host=makeClient('H');
const guest=makeClient('G');

(async ()=>{
  /* 1. 호스트: 2인 방 생성 (나 + 친구 자리) */
  host.run("setupName='호스트'; netCreateRoom('호스트', 2, ['me','human'])");
  await until(()=>host.run("NET.status==='lobby'"), '호스트 대기실 진입');
  const code=host.run('NET.room.code');
  console.log('방 생성:', code);

  /* 2. 게스트: 코드로 참가 → 좌석 배정 */
  guest.run("netJoinRoom('"+code+"', '게스트')");
  await until(()=>guest.run('NET.mySeat===1'), '게스트 좌석 배정');
  await until(()=>host.run("NET.room.seats[1].clientId!==null"), '호스트 쪽 좌석 반영');
  console.log('게스트 참가 완료 — 좌석 1');

  /* 3. 채팅 왕복 */
  guest.run("netSendChat('안녕하세요!')");
  await until(()=>host.run("NET.chat.some(m=>m.text==='안녕하세요!')"), '채팅 게스트→호스트');
  host.run("NET.myName='호스트'; netSendChat('환영합니다')");
  await until(()=>guest.run("NET.chat.some(m=>m.text==='환영합니다')"), '채팅 호스트→게스트');
  console.log('채팅 왕복 OK');

  /* 4. 게임 시작 → 완주 (양쪽 사람 좌석을 AI 로직으로 자동 진행) */
  host.run('uiNetStartGame()');
  await until(()=>guest.run('!!G && NET.status==="playing"'), '게스트 게임 시작 수신');

  const t0=Date.now();
  let deckMaskedChecked=false;
  while(true){
    if(Date.now()-t0>90000){ console.error('90초 내 종료 실패 — host pending:', host.run('G&&G.pending&&G.pending.type'), 'guest rev:', guest.run('NET.rev')); process.exit(1); }
    const over=host.run('!!(G&&G.over)');
    if(over){
      await until(()=>guest.run('!!(G&&G.over)'), '게스트 종료 동기화');
      break;
    }
    // 게스트 덱 가림 검증 (게임 중 1회)
    if(!deckMaskedChecked && guest.run('!!(G&&G.supply&&G.supply.deck&&G.supply.deck.length)')){
      const masked=guest.run("G.supply.deck.every(t=>t==='?')");
      if(!masked){ console.error('FAIL: 게스트 snapshot에 덱 내용이 노출됨'); process.exit(1); }
      deckMaskedChecked=true;
      console.log('게스트 덱 가림 OK (길이만 보임)');
    }
    // 호스트 좌석(0) 차례 → 호스트 쪽 AI 로직으로 / report → 호스트가 확인
    host.run("(function(){ const pd=G&&G.pending; if(!pd) return;"
      +" if(pd.type==='report'){ actReportDone(); return; }"
      +" if(pd.player===0 && !G.players[0].ai) aiDecide(); })()");
    // 게스트 좌석(1) 차례 → 게스트 쪽 AI 로직 (감싼 진입점이 intent를 보낸다).
    // 같은 pending(rev)에는 한 번만 행동 — 실제 UI도 클릭은 한 번이다 (중복은 호스트 dedup이 막지만)
    guest.run("(function(){ const pd=G&&G.pending; if(!pd) return;"
      +" const key=NET.rev+':'+pd.type+':'+pd.player;"
      +" if(globalThis.__acted===key) return;"
      +" if(pd.player===1 && NET.mySeat===1 && !G.players[1].ai){ globalThis.__acted=key; aiDecide(); } })()");
    await sleep(3);
  }
  const hostScore=host.run('G.scores.map(s=>s.name+" "+s.total).join(" / ")');
  const guestScore=guest.run('G.scores.map(s=>s.name+" "+s.total).join(" / ")');
  if(hostScore!==guestScore){ console.error('FAIL: 최종 점수 불일치\n host:', hostScore, '\n guest:', guestScore); process.exit(1); }
  console.log('게임 완주 — 라운드', host.run('G.round'), '· 점수:', hostScore);
  console.log('NETTEST OK');
  process.exit(0);
})().catch(e=>{ console.error('FAIL:', e); process.exit(1); });

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
async function until(fn, what){
  const t0=Date.now();
  while(!fn()){
    if(Date.now()-t0>8000) throw new Error('시간 초과: '+what);
    await sleep(5);
  }
}
