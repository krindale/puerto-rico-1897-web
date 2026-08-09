-- 공개방 목록 뷰 — snapshot을 뺀다 (목록 조회만으로 진행 중 게임이 새지 않게).
-- security_invoker 필수: definer 뷰면 소유자 권한으로 RLS를 우회한다 (쇼케이스 리뷰에서 잡힌 함정).
-- 접근 통제는 rooms_select 정책 한 곳에 모은다 — 공개·대기 중 방은 anon도 읽을 수 있다.
create or replace view public.public_rooms
  with (security_invoker = on)
  as
  select id, code, title, is_public, map_id, status, seats,
         host_client_id, updated_at, created_at
    from public.rooms
   where is_public = true
     and status = 'waiting';

grant select on public.public_rooms to anon, authenticated;
