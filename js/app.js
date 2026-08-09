/* ═══════════════════════════ 흐름 제어 ═══════════════════════════ */
let aiTimer=null;
function schedule(){
  render(); save();
  const pd=G.pending;
  if(!pd || pd.type==='gameOver') return;
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
