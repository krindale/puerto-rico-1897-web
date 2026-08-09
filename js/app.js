/* ═══════════════════════════ 흐름 제어 ═══════════════════════════ */
/* 단계 마지막 행동 → 다음 진행 사이의 숨 고르기 (phaseEnd pending의 길이).
   결과 창이 있는 단계(생산·판매·선적)는 1초 뒤 결과 창,
   결과 창이 없는 단계(개척·모집·건설)는 0.3초 뒤 다음 역할 선택으로 넘어간다. */
const PHASE_END_HOLD=1000;
const PHASE_END_HOLD_SHORT=300;
let aiTimer=null;
function schedule(){
  render(); save();
  // 온라인 게스트는 엔진(AI·phaseEnd 타이머)을 돌리지 않는다 — 호스트가 굴리고 snapshot으로 받는다
  if(typeof NET!=='undefined'&&NET.on&&!NET.host) return;
  const pd=G.pending;
  if(!pd || pd.type==='gameOver') return;
  if(pd.type==='phaseEnd'){
    // 단계 마무리 일시정지 — 직렬화된 pending이므로 새로고침해도 여기서 타이머가 다시 걸린다
    clearTimeout(aiTimer);
    const short=(pd.id==='settler'||pd.id==='mayor'||pd.id==='builder');  // 결과 창 없는 단계
    aiTimer=setTimeout(actPhaseEnd, short?PHASE_END_HOLD_SHORT:PHASE_END_HOLD);
    return;
  }
  const p=(pd.player!==undefined)?P(pd.player):null;
  if(p && p.ai){
    clearTimeout(aiTimer);
    // 봇은 일정한 1.5초 리듬으로 움직인다 — 여기에 이펙트 대기를 얹지 않는다 (게임이 굼떠진다).
    // 이펙트를 기다리는 건 "사람 차례 UI가 뜰 때"(FX_HOLD 홀드)와 "단계 끝"(phaseEnd)뿐.
    aiTimer=setTimeout(()=>{ try{ aiDecide(); }catch(e){ console.error(e); log('⚠️ AI 오류: '+e.message); render(); } }, 1500);
  }
}

/* ═══════════════════════════ 부팅 ═══════════════════════════ */
(function(){
  if(typeof setupLoad==='function') setupLoad();   // 설정 화면 입력값 복원 (탭·이름·인원·좌석)
  /* 온라인 게임 중이었으면 자동으로 그 방에 다시 들어간다 — 온라인은 로컬 저장(pr1897_save)을
     쓰지 않으므로(호스트 snapshot이 서버에 있다) 이 경로가 없으면 새로고침·튕김에 설정 화면으로
     돌아가 버린다. 방이 이미 사라졌으면 netJoinRoom이 안내를 띄우고 설정 화면으로 떨어진다. */
  const sess=(typeof netSavedSession==='function')?netSavedSession():null;
  if(sess&&sess.code&&typeof netConfigured==='function'&&netConfigured()){
    // 세 번째 인자 true = 진행 중이던 게임만 복귀. 대기실이었으면 설정 화면 그대로 둔다.
    netJoinRoom(sess.code, sess.name||'플레이어', true);
    return;
  }
  if(loadSave() && G && !G.over){
    render();
    schedule();
  } else {
    G=null;
    renderSetup();
  }
})();
