-- Pulse Chat Realtime authorization.
-- Run in Supabase SQL Editor if Presence/typing reports Unauthorized.
-- Persistent messages/files remain protected by their own table/storage RLS policies.

drop policy if exists "pulse presence receive" on realtime.messages;
drop policy if exists "pulse presence send" on realtime.messages;
drop policy if exists "pulse conversation broadcast receive" on realtime.messages;
drop policy if exists "pulse conversation broadcast send" on realtime.messages;
drop policy if exists "pulse realtime read" on realtime.messages;
drop policy if exists "pulse realtime write" on realtime.messages;

create policy "pulse realtime read"
on realtime.messages
for select
to authenticated
using (true);

create policy "pulse realtime write"
on realtime.messages
for insert
to authenticated
with check (true);
