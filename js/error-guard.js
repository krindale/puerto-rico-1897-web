/* 전역 오류 안전망 — 반드시 다른 모든 스크립트보다 먼저 로드할 것 (game.html의 첫 <script>) */
/* 스크립트가 통째로 죽으면 화면에는 배경만 남는다 — 그 상태로 끝내지 않고 이유를 화면에 띄운다.
   (브라우저가 저장소 접근을 막거나, 확장 프로그램이 스크립트를 건드리는 경우가 실제로 있었다)
   본 스크립트보다 먼저 등록해야 본 스크립트의 사고도 잡을 수 있다. */
window.addEventListener('error', function(e){
  if(!e.message) return;                     // 이미지 로드 실패 등 리소스 오류는 각자 폴백이 있다
  const app=document.getElementById('app');
  if(!app || app.children.length) return;    // 화면이 이미 그려졌으면 건드리지 않는다
  const where=String(e.filename||'').split('/').pop()+' '+e.lineno+'행';
  app.innerHTML='<div class="setup"><h2>화면을 그리지 못했습니다</h2>'
    +'<div class="lead">브라우저가 아래 오류로 게임 스크립트를 중단했습니다.</div>'
    +'<pre style="white-space:pre-wrap;font-size:13px;color:var(--accent-deep);background:#f0e9d8;'
    +'border:1px solid var(--line);padding:12px;border-radius:3px">'
    +String(e.message).replace(/</g,'&lt;')+'\n'+where+'</pre>'
    +'<div class="hint">이 파일을 <b>다른 브라우저</b>로 열거나, 브라우저의 <b>사이트 데이터(쿠키) 차단</b> 설정을 풀면 해결되는 경우가 많습니다.</div></div>';
});
