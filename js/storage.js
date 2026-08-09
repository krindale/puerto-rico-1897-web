/* ═══════════════════════════ 저장 ═══════════════════════════ */
/* localStorage는 "읽기만 해도" 예외가 날 수 있다 —
   file:// 로 열면 사파리는 기본적으로, 크롬도 쿠키/사이트 데이터 차단 설정이면 SecurityError를 던진다.
   예전에는 renderSetup()이 이걸 맨몸으로 읽다가 죽어서 화면이 통째로 안 그려졌다(배경만 보임).
   그래서 저장소 접근은 전부 이 세 함수를 거친다. 막혀 있으면 메모리에 담아 게임은 그대로 돌아가고,
   새로고침하면 사라진다는 것만 설정 화면에서 알려준다. */
const memStore={};        // localStorage를 못 쓸 때의 대체 저장소 (탭을 닫으면 사라짐)
let storageBlocked=false; // 한 번이라도 막힌 적이 있으면 true
function lsGet(k){
  if(k in memStore) return memStore[k];
  try{ return localStorage.getItem(k); }catch(e){ storageBlocked=true; return null; }
}
function lsSet(k,v){
  try{ localStorage.setItem(k,v); }catch(e){ storageBlocked=true; memStore[k]=v; }
}
function lsDel(k){
  try{ localStorage.removeItem(k); }catch(e){ storageBlocked=true; }
  delete memStore[k];
}
function save(){
  // 온라인 게임: 로컬 저장 대신 호스트가 snapshot을 브로드캐스트 + DB에 저장한다.
  // (로컬 키에 쓰면 혼자 하던 게임의 저장을 온라인 게임이 덮어쓴다)
  if(typeof NET!=='undefined'&&NET.on){
    if(NET.host) netPushState();
    return;
  }
  lsSet('pr1897_save', JSON.stringify(G));
}
function loadSave(){
  try{
    const s=lsGet('pr1897_save');
    if(!s) return false;
    G=JSON.parse(s);
    return true;
  }catch(e){ return false; }
}
