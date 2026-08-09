/* ═══════════════════════════ 온라인 설정 ═══════════════════════════ */
/* 이 게임 전용 Supabase 프로젝트 (puerto-rico-1897, 서울) — 스키마는 supabase/ 참고.
   anon(publishable) 키는 클라이언트 공개 전제의 키 — 접근 제어는 전부 RLS가 담당한다. */
const NET_SUPABASE_URL='https://cpdvwgwxkqhcsqfxzdec.supabase.co';
const NET_SUPABASE_KEY='sb_publishable_XMjzrIPnMnnIUl812YZjNw_9CZu0Y_w';
const NET_MAP_ID='pr1897';
/* 온라인 기능 사용 가능 여부 — vendor 번들이 로드됐고 설정이 있어야 한다.
   (헤드리스 테스트·번들 미로드 환경에서는 온라인 UI가 조용히 숨는다) */
function netConfigured(){
  return typeof supabase!=='undefined' && !!NET_SUPABASE_URL && !!NET_SUPABASE_KEY;
}
