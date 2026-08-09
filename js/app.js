/* ═══════════════════════════ 흐름 제어 ═══════════════════════════ */
const PHASE_END_HOLD=1000;  // 단계 마지막 행동 → 결과 정리 사이의 숨 고르기 (phaseEnd pending의 길이)
let aiTimer=null;
function schedule(){
  render(); save();
  const pd=G.pending;
  if(!pd || pd.type==='gameOver') return;
  if(pd.type==='phaseEnd'){
    // 단계 마무리 일시정지 — 직렬화된 pending이므로 새로고침해도 여기서 타이머가 다시 걸린다
    clearTimeout(aiTimer);
    aiTimer=setTimeout(actPhaseEnd, PHASE_END_HOLD);
    return;
  }
  const p=(pd.player!==undefined)?P(pd.player):null;
  if(p && p.ai){
    clearTimeout(aiTimer);
    aiTimer=setTimeout(()=>{ try{ aiDecide(); }catch(e){ console.error(e); log('⚠️ AI 오류: '+e.message); render(); } }, 1500);
  }
}

/* ═══════════════════════════ 부팅 ═══════════════════════════ */
(function(){
  if(loadSave() && G && !G.over){
    render();
    schedule();
  } else {
    G=null;
    renderSetup();
  }
})();
