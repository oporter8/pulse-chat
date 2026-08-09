-- Pulse Chat Realtime authorization (MVP)
-- Run in Supabase Dashboard -> SQL Editor.
-- Any authenticated Pulse account may connect to private Realtime topics.
-- Permanent message data remains protected by the RLS policies in schema.sql.

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
