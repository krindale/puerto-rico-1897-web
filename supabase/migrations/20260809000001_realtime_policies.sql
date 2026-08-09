-- realtime.messages는 프로젝트 생성 직후엔 없다 (Realtime 서비스가 뜬 뒤 생김) — 그래서 별도 마이그레이션
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

