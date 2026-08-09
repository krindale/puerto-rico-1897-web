/* ═══════════════════════════ 온라인 설정 ═══════════════════════════ */
/* aos_showcase와 같은 Supabase 프로젝트를 쓴다 (rooms 테이블·RLS·정리 크론 공유).
   anon(publishable) 키는 클라이언트 공개 전제의 키 — 접근 제어는 전부 RLS가 담당한다.
   푸에르토리코 방은 map_id='pr1897' + 항상 비공개(is_public=false)로 만들어
   쇼케이스의 공개방 목록에 섞이지 않는다. */
const NET_SUPABASE_URL='https://gklxcdgumdzgvltuyxjl.supabase.co';
const NET_SUPABASE_KEY='sb_publishable_sJiHGhjH_qy_TR8S1Bvh6A_gVAZUfZY';
const NET_MAP_ID='pr1897';
/* 온라인 기능 사용 가능 여부 — vendor 번들이 로드됐고 설정이 있어야 한다.
   (헤드리스 테스트·번들 미로드 환경에서는 온라인 UI가 조용히 숨는다) */
function netConfigured(){
  return typeof supabase!=='undefined' && !!NET_SUPABASE_URL && !!NET_SUPABASE_KEY;
}
