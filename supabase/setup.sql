-- ============================================================
-- 푸에르토리코 1897 온라인 멀티플레이 — Supabase 초기 설정
-- (aos_showcase의 검증된 스키마를 이 게임 전용 프로젝트에 맞게 가져옴)
-- 실행: Supabase 대시보드 → SQL Editor → 전체 붙여넣기 → Run
-- 여러 번 실행해도 안전(idempotent)하게 작성됨.
--
-- ⚠️ 전제: 대시보드 → Authentication → Sign In / Up → Anonymous sign-ins 켜기.
--    클라이언트가 signInAnonymously로 세션을 얻어야 아래 정책(to authenticated)을 통과한다.
-- ============================================================

-- 방 테이블: 방 목록·좌석·최신 게임 스냅샷(재접속용)
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,           -- 6자리 초대 코드 (혼동 문자 I/O/0/1 제외)
  title text,
  is_public boolean not null default false,
  map_id text not null,
  status text not null default 'waiting'
    check (status in ('waiting', 'playing', 'finished')),
  seats jsonb not null default '[]',   -- [{seat, name, kind:'human'|'ai', clientId|null, uid|null}]
  host_client_id text,
  host_uid uuid,                       -- 방을 만든 익명 사용자의 auth.uid
  participant_uids uuid[] not null default '{}',  -- 이 방에 앉은 적 있는 uid들 (RLS 판정 축)
  snapshot jsonb,                      -- 최신 게임 스냅샷 (G 전체 — 호스트 재접속·복구용)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.rooms to anon, authenticated;

create index if not exists rooms_participant_uids_idx
  on public.rooms using gin (participant_uids);

-- ── RLS: uid 기반 ──
alter table public.rooms enable row level security;

-- SELECT: 공개·대기 방 + 내가 참가한 방만 (푸에르토리코는 공개방을 안 쓰지만 규칙은 동일하게)
drop policy if exists "rooms_select" on public.rooms;
create policy "rooms_select" on public.rooms
  for select to anon, authenticated
  using (
    (is_public and status = 'waiting')
    or (auth.uid() is not null and auth.uid() = any(participant_uids))
  );

-- INSERT: 로그인한 사용자만, 반드시 자기 uid로만
drop policy if exists "rooms_insert" on public.rooms;
create policy "rooms_insert" on public.rooms
  for insert to authenticated
  with check (
    auth.uid() is not null
    and host_uid = auth.uid()
    and participant_uids @> array[auth.uid()]
  );

-- UPDATE: 그 방의 참가자만. with check로 참가자 목록이 줄어들지 않게 막는다
drop policy if exists "rooms_update" on public.rooms;
create policy "rooms_update" on public.rooms
  for update to authenticated
  using (auth.uid() = any(participant_uids))
  with check (participant_uids @> array[auth.uid()]);

-- DELETE: 호스트만, 끝난 방만
drop policy if exists "rooms_delete_finished" on public.rooms;
create policy "rooms_delete_finished" on public.rooms
  for delete to authenticated
  using (status = 'finished' and auth.uid() = host_uid);

-- updated_at 자동 갱신
create or replace function public.set_updated_at()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists rooms_updated_at on public.rooms;
create trigger rooms_updated_at
  before update on public.rooms
  for each row execute function public.set_updated_at();

-- ── 코드 입장 RPC — "참가자여야 채널에 들어가는데, 들어가야 참가자가 된다"의 고리를 끊는다 ──
create or replace function public.join_room(p_code text)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rooms;
  u uuid := auth.uid();
begin
  if u is null then
    raise exception '로그인이 필요합니다' using errcode = '28000';
  end if;

  select * into r from public.rooms where code = upper(btrim(p_code));
  if not found then
    raise exception '방을 찾을 수 없습니다' using errcode = 'P0002';
  end if;

  if not (u = any(r.participant_uids)) then
    update public.rooms
       set participant_uids = participant_uids || u
     where id = r.id
    returning * into r;
  end if;

  return r;
end;
$$;

revoke execute on function public.join_room(text) from public, anon;
grant execute on function public.join_room(text) to authenticated;

-- ── Realtime 프라이빗 채널 정책 — 방 참가자만 room:{코드} 채널에서 송수신 ──
drop policy if exists "room participants can receive" on realtime.messages;
create policy "room participants can receive"
on realtime.messages
for select
to authenticated
using (
  exists (
    select 1
      from public.rooms r
     where 'room:' || r.code = (select realtime.topic())
       and auth.uid() = any(r.participant_uids)
       and realtime.messages.extension in ('broadcast', 'presence')
  )
);

drop policy if exists "room participants can send" on realtime.messages;
create policy "room participants can send"
on realtime.messages
for insert
to authenticated
with check (
  exists (
    select 1
      from public.rooms r
     where 'room:' || r.code = (select realtime.topic())
       and auth.uid() = any(r.participant_uids)
       and realtime.messages.extension in ('broadcast', 'presence')
  )
);

-- ── 남용 방지 제약 (서버측 상한 — UI 캡은 우회 가능하므로) ──
alter table public.rooms drop constraint if exists rooms_code_format;
alter table public.rooms add constraint rooms_code_format
  check (code ~ '^[A-Z2-9]{6,8}$');

alter table public.rooms drop constraint if exists rooms_title_len;
alter table public.rooms add constraint rooms_title_len
  check (length(title) <= 60);

alter table public.rooms drop constraint if exists rooms_map_id_len;
alter table public.rooms add constraint rooms_map_id_len
  check (length(map_id) <= 40);

alter table public.rooms drop constraint if exists rooms_seats_shape;
alter table public.rooms add constraint rooms_seats_shape
  check (
    jsonb_typeof(seats) = 'array'
    and jsonb_array_length(seats) <= 8
    and pg_column_size(seats) <= 8192
  );

alter table public.rooms drop constraint if exists rooms_snapshot_size;
alter table public.rooms add constraint rooms_snapshot_size
  check (pg_column_size(snapshot) <= 262144);

-- 방 생성 폭주 방지 (분당 20개 — 정상 사용이 절대 닿지 않는 총량 상한)
create or replace function public.enforce_room_creation_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent_count int;
begin
  select count(*) into recent_count
  from public.rooms
  where created_at > now() - interval '1 minute';

  if recent_count >= 20 then
    raise exception '방 생성이 일시적으로 제한되었습니다. 잠시 후 다시 시도해 주세요.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists rooms_rate_limit on public.rooms;
create trigger rooms_rate_limit
  before insert on public.rooms
  for each row execute function public.enforce_room_creation_rate_limit();

-- ── 오래된 방 자동 정리 (pg_cron — 1시간마다) ──
create extension if not exists pg_cron;

create or replace function public.cleanup_stale_rooms()
returns void language sql
security definer
set search_path = ''
as $$
  delete from public.rooms
  where updated_at < now() - case
    when status in ('waiting', 'finished') then interval '30 minutes'
    else interval '6 hours'
  end;
$$;

-- SECURITY DEFINER 함수의 REST RPC 노출 차단 — 아니면 anon이 임의 시점에 방을 강제 삭제할 수 있다
revoke execute on function public.cleanup_stale_rooms() from anon, authenticated, public;
revoke execute on function public.enforce_room_creation_rate_limit() from anon, authenticated, public;

select cron.schedule(
  'cleanup-stale-rooms',
  '0 * * * *',
  $$ select public.cleanup_stale_rooms(); $$
);
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
