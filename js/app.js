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
  /* 예약과 발동 사이에 게임이 통째로 바뀔 수 있다 (새 게임·온라인 복귀).
     타이머를 걸 때의 G를 기억해 두고, 발동 시점에 그대로인지 확인한다 —
     예전에는 봇 차례 중에 [새 게임]을 누르면 이전 게임의 봇 타이머가 살아남아
     새 게임의 내 첫 차례에 aiDecide()를 돌려 역할을 대신 골라버렸다.
     (schedule 맨 위에서 무조건 clearTimeout 하는 방법도 있지만, 그러면 온라인에서
      호스트가 굴리던 엔진 타이머까지 끊겨 진행이 멈춘다 — 실제로 루프백 테스트가 잡았다.) */
  const gAtSchedule=G;
  if(pd.type==='phaseEnd'){
    // 단계 마무리 일시정지 — 직렬화된 pending이므로 새로고침해도 여기서 타이머가 다시 걸린다
    clearTimeout(aiTimer);
    const short=(pd.id==='settler'||pd.id==='mayor'||pd.id==='builder');  // 결과 창 없는 단계
    aiTimer=setTimeout(()=>{ if(G!==gAtSchedule) return; actPhaseEnd(); }, short?PHASE_END_HOLD_SHORT:PHASE_END_HOLD);
    return;
  }
  const p=(pd.player!==undefined)?P(pd.player):null;
  if(p && p.ai){
    clearTimeout(aiTimer);
    // 봇은 일정한 1.5초 리듬으로 움직인다 — 여기에 이펙트 대기를 얹지 않는다 (게임이 굼떠진다).
    // 이펙트를 기다리는 건 "사람 차례 UI가 뜰 때"(FX_HOLD 홀드)와 "단계 끝"(phaseEnd)뿐.
    aiTimer=setTimeout(()=>{ if(G!==gAtSchedule) return;
      try{ aiDecide(); }catch(e){ console.error(e); log('⚠️ AI 오류: '+e.message); render(); } }, 1500);
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
