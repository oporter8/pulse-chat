-- Pulse Chat v8 normal-messenger polish upgrade
-- Run ONCE after v7_migration.sql on an existing Pulse database.
-- Preserves existing accounts, conversations, and messages.

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Profile polish + account preferences
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists status_text text not null default '',
  add column if not exists last_active_at timestamptz,
  add column if not exists notification_sound text not null default 'default';

alter table public.profiles drop constraint if exists profiles_status_text_length;
alter table public.profiles add constraint profiles_status_text_length check (char_length(status_text) <= 60);
alter table public.profiles drop constraint if exists profiles_notification_sound_check;
alter table public.profiles add constraint profiles_notification_sound_check
  check (notification_sound in ('default', 'soft', 'pop', 'none'));

-- Allow a true message-request option in addition to the v6 privacy modes.
alter table public.profiles drop constraint if exists profiles_dm_privacy_check;
alter table public.profiles add constraint profiles_dm_privacy_check
  check (dm_privacy in ('everyone', 'requests', 'mutual_groups', 'nobody'));

-- -----------------------------------------------------------------------------
-- Per-user conversation state
-- -----------------------------------------------------------------------------
alter table public.conversation_members
  add column if not exists pinned_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists cleared_at timestamptz,
  add column if not exists hidden_at timestamptz;

-- Extend the narrow v6 update grant with v8 user-owned fields.
revoke update on public.conversation_members from authenticated;
grant update (
  last_read_at, last_seen_at, muted_until,
  pinned_at, archived_at, cleared_at, hidden_at
) on public.conversation_members to authenticated;

-- -----------------------------------------------------------------------------
-- Message delivery state, saves, edits, forwarding
-- -----------------------------------------------------------------------------
alter table public.messages
  add column if not exists forwarded_from uuid references public.messages(id) on delete set null,
  add column if not exists client_id uuid;

create unique index if not exists messages_sender_client_id_unique
  on public.messages(sender_id, client_id)
  where client_id is not null;

create table if not exists public.message_receipts (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  delivered_at timestamptz not null default now(),
  read_at timestamptz,
  primary key (message_id, user_id)
);

create index if not exists message_receipts_user_idx on public.message_receipts(user_id, delivered_at desc);
alter table public.message_receipts enable row level security;

drop policy if exists "Conversation members can read message receipts" on public.message_receipts;
create policy "Conversation members can read message receipts"
  on public.message_receipts for select to authenticated
  using (exists (
    select 1 from public.messages m
    where m.id = message_id and public.is_conversation_member(m.conversation_id)
  ));

drop policy if exists "Users can create own message receipts" on public.message_receipts;
create policy "Users can create own message receipts"
  on public.message_receipts for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_id
        and m.sender_id <> auth.uid()
        and public.is_conversation_member(m.conversation_id)
    )
  );

drop policy if exists "Users can update own message receipts" on public.message_receipts;
create policy "Users can update own message receipts"
  on public.message_receipts for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update on public.message_receipts to authenticated;

create table if not exists public.saved_messages (
  user_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);

alter table public.saved_messages enable row level security;
drop policy if exists "Users manage own saved messages" on public.saved_messages;
create policy "Users manage own saved messages"
  on public.saved_messages for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
grant select, insert, delete on public.saved_messages to authenticated;

create table if not exists public.message_edits (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  editor_id uuid not null references public.profiles(id) on delete cascade,
  old_body text not null default '',
  edited_at timestamptz not null default now()
);
create index if not exists message_edits_message_idx on public.message_edits(message_id, edited_at desc);
alter table public.message_edits enable row level security;
drop policy if exists "Members can read edit history" on public.message_edits;
create policy "Members can read edit history"
  on public.message_edits for select to authenticated
  using (exists (
    select 1 from public.messages m
    where m.id = message_id and public.is_conversation_member(m.conversation_id)
  ));
drop policy if exists "Senders can record edit history" on public.message_edits;
create policy "Senders can record edit history"
  on public.message_edits for insert to authenticated
  with check (
    editor_id = auth.uid()
    and exists (select 1 from public.messages m where m.id = message_id and m.sender_id = auth.uid())
  );
grant select, insert on public.message_edits to authenticated;

-- -----------------------------------------------------------------------------
-- Message requests
-- -----------------------------------------------------------------------------
create table if not exists public.dm_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (sender_id, recipient_id),
  constraint dm_requests_not_self check (sender_id <> recipient_id),
  constraint dm_requests_status_check check (status in ('pending', 'accepted', 'declined'))
);
create index if not exists dm_requests_recipient_idx on public.dm_requests(recipient_id, status, created_at desc);
alter table public.dm_requests enable row level security;
drop policy if exists "Users can read own dm requests" on public.dm_requests;
create policy "Users can read own dm requests"
  on public.dm_requests for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());
revoke all on public.dm_requests from authenticated;
grant select on public.dm_requests to authenticated;

-- -----------------------------------------------------------------------------
-- App-level device/session management and security events
-- -----------------------------------------------------------------------------
create table if not exists public.device_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_key text not null,
  device_name text not null default 'Browser',
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique(user_id, device_key)
);
create index if not exists device_sessions_user_idx on public.device_sessions(user_id, last_seen_at desc);
alter table public.device_sessions enable row level security;
drop policy if exists "Users can read own devices" on public.device_sessions;
create policy "Users can read own devices" on public.device_sessions for select to authenticated using (user_id = auth.uid());
grant select on public.device_sessions to authenticated;

create table if not exists public.account_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  detail text not null default '',
  created_at timestamptz not null default now(),
  constraint account_events_type_check check (event_type in ('new_device', 'device_revoked', 'email_change', 'password_change'))
);
create index if not exists account_events_user_idx on public.account_events(user_id, created_at desc);
alter table public.account_events enable row level security;
drop policy if exists "Users can read own account events" on public.account_events;
create policy "Users can read own account events" on public.account_events for select to authenticated using (user_id = auth.uid());
grant select on public.account_events to authenticated;

create or replace function public.register_device(p_device_key text, p_device_name text, p_user_agent text)
returns table (device_id uuid, is_new boolean, allowed boolean)
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_created timestamptz;
  v_last_seen timestamptz;
  v_revoked timestamptz;
  v_new boolean := false;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if char_length(trim(coalesce(p_device_key,''))) < 12 then raise exception 'Invalid device key'; end if;

  select id, created_at, last_seen_at, revoked_at into v_id, v_created, v_last_seen, v_revoked
  from public.device_sessions where user_id = auth.uid() and device_key = p_device_key;

  if v_id is null then
    insert into public.device_sessions(user_id, device_key, device_name, user_agent)
    values (auth.uid(), p_device_key, left(coalesce(nullif(trim(p_device_name),''),'Browser'),80), left(coalesce(p_user_agent,''),500))
    returning id into v_id;
    v_new := true;
    insert into public.account_events(user_id, event_type, detail)
    values (auth.uid(), 'new_device', left(coalesce(nullif(trim(p_device_name),''),'Browser'),200));
    update public.profiles set last_active_at = now() where id = auth.uid();
    return query select v_id, true, true;
    return;
  end if;

  -- Sessions inactive for more than 30 days require a fresh sign-in/device registration.
  if v_revoked is not null or v_last_seen < now() - interval '30 days' then
    update public.device_sessions set revoked_at = coalesce(revoked_at, now()) where id = v_id;
    return query select v_id, false, false;
    return;
  end if;

  update public.device_sessions
  set last_seen_at = now(), device_name = left(coalesce(nullif(trim(p_device_name),''), device_name),80),
      user_agent = left(coalesce(p_user_agent,user_agent),500)
  where id = v_id;
  update public.profiles set last_active_at = now() where id = auth.uid();
  return query select v_id, v_new, true;
end;
$$;
revoke all on function public.register_device(text,text,text) from public;
grant execute on function public.register_device(text,text,text) to authenticated;

create or replace function public.heartbeat_device(p_device_key text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_allowed boolean;
begin
  select (revoked_at is null and last_seen_at >= now() - interval '30 days') into v_allowed
  from public.device_sessions where user_id = auth.uid() and device_key = p_device_key;
  if coalesce(v_allowed,false) then
    update public.device_sessions set last_seen_at = now() where user_id = auth.uid() and device_key = p_device_key;
    update public.profiles set last_active_at = now() where id = auth.uid();
    return true;
  end if;
  return false;
end; $$;
revoke all on function public.heartbeat_device(text) from public;
grant execute on function public.heartbeat_device(text) to authenticated;

create or replace function public.revoke_device(p_device_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.device_sessions set revoked_at = now()
  where id = p_device_id and user_id = auth.uid();
  insert into public.account_events(user_id,event_type,detail)
  values(auth.uid(),'device_revoked','A signed-in device was revoked.');
end; $$;
revoke all on function public.revoke_device(uuid) from public;
grant execute on function public.revoke_device(uuid) to authenticated;

create or replace function public.revoke_other_devices(p_current_device_key text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.device_sessions set revoked_at = now()
  where user_id = auth.uid() and device_key <> p_current_device_key and revoked_at is null;
  insert into public.account_events(user_id,event_type,detail)
  values(auth.uid(),'device_revoked','All other devices were signed out of Pulse.');
end; $$;
revoke all on function public.revoke_other_devices(text) from public;
grant execute on function public.revoke_other_devices(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Username availability
-- -----------------------------------------------------------------------------
create or replace function public.username_available(candidate text)
returns boolean language sql stable security definer set search_path = public as $$
  select candidate ~ '^[a-z0-9_]{3,20}$'
     and not exists(select 1 from public.profiles p where p.username = lower(trim(candidate)) and p.id <> auth.uid());
$$;
revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Direct-message request behavior
-- -----------------------------------------------------------------------------
create or replace function public.start_dm(other_user uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_current_user uuid := auth.uid();
  v_privacy text;
  existing_conversation uuid;
  new_conversation uuid;
begin
  if v_current_user is null then raise exception 'Not authenticated'; end if;
  if other_user = v_current_user then raise exception 'You cannot start a DM with yourself'; end if;
  select p.dm_privacy into v_privacy from public.profiles p where p.id = other_user;
  if v_privacy is null then raise exception 'User not found'; end if;

  if exists (
    select 1 from public.blocks b
    where (b.blocker_id=v_current_user and b.blocked_id=other_user)
       or (b.blocker_id=other_user and b.blocked_id=v_current_user)
  ) then raise exception 'This direct message is unavailable'; end if;

  select c.id into existing_conversation
  from public.conversations c
  where c.kind='dm'
    and exists(select 1 from public.conversation_members a where a.conversation_id=c.id and a.user_id=v_current_user)
    and exists(select 1 from public.conversation_members b where b.conversation_id=c.id and b.user_id=other_user)
    and (select count(*) from public.conversation_members x where x.conversation_id=c.id)=2
  limit 1;
  if existing_conversation is not null then return existing_conversation; end if;

  if v_privacy='nobody' then raise exception 'This person is not accepting new direct messages'; end if;
  if v_privacy='mutual_groups' and not exists (
    select 1 from public.conversations shared
    join public.conversation_members mine on mine.conversation_id=shared.id and mine.user_id=v_current_user
    join public.conversation_members theirs on theirs.conversation_id=shared.id and theirs.user_id=other_user
    where shared.kind='group'
  ) then raise exception 'This person only accepts new DMs from shared groups'; end if;

  if v_privacy='requests' then
    insert into public.dm_requests(sender_id,recipient_id,status,created_at,responded_at)
    values(v_current_user,other_user,'pending',now(),null)
    on conflict(sender_id,recipient_id) do update
      set status='pending', created_at=now(), responded_at=null;
    return null;
  end if;

  insert into public.conversations(kind,created_by) values('dm',v_current_user) returning id into new_conversation;
  insert into public.conversation_members(conversation_id,user_id,role)
  values(new_conversation,v_current_user,'member'),(new_conversation,other_user,'member');
  return new_conversation;
end; $$;
revoke all on function public.start_dm(uuid) from public;
grant execute on function public.start_dm(uuid) to authenticated;

create or replace function public.respond_dm_request(p_request_id uuid, p_accept boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  r public.dm_requests%rowtype;
  c uuid;
begin
  select * into r from public.dm_requests where id=p_request_id and recipient_id=auth.uid() and status='pending' for update;
  if r.id is null then raise exception 'Message request not found'; end if;
  update public.dm_requests set status=case when p_accept then 'accepted' else 'declined' end, responded_at=now() where id=r.id;
  if not p_accept then return null; end if;

  select conv.id into c from public.conversations conv
  where conv.kind='dm'
    and exists(select 1 from public.conversation_members a where a.conversation_id=conv.id and a.user_id=r.sender_id)
    and exists(select 1 from public.conversation_members b where b.conversation_id=conv.id and b.user_id=r.recipient_id)
    and (select count(*) from public.conversation_members x where x.conversation_id=conv.id)=2
  limit 1;
  if c is not null then return c; end if;
  insert into public.conversations(kind,created_by) values('dm',r.sender_id) returning id into c;
  insert into public.conversation_members(conversation_id,user_id,role)
  values(c,r.sender_id,'member'),(c,r.recipient_id,'member');
  return c;
end; $$;
revoke all on function public.respond_dm_request(uuid,boolean) from public;
grant execute on function public.respond_dm_request(uuid,boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- Mark receipts in one call
-- -----------------------------------------------------------------------------
create or replace function public.mark_conversation_receipts(target_conversation uuid, mark_read boolean default false)
returns void language sql security definer set search_path = public as $$
  insert into public.message_receipts(message_id,user_id,delivered_at,read_at)
  select m.id, auth.uid(), now(), case when mark_read then now() else null end
  from public.messages m
  where m.conversation_id=target_conversation
    and m.sender_id<>auth.uid()
    and m.deleted_at is null
    and public.is_conversation_member(target_conversation)
  on conflict(message_id,user_id) do update
    set delivered_at=coalesce(public.message_receipts.delivered_at,excluded.delivered_at),
        read_at=case when mark_read then coalesce(public.message_receipts.read_at,now()) else public.message_receipts.read_at end;
$$;
revoke all on function public.mark_conversation_receipts(uuid,boolean) from public;
grant execute on function public.mark_conversation_receipts(uuid,boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- Delete own account through server route uses Auth Admin; FK cascades clean app data.
-- No client-side delete-user grant is added here.
-- -----------------------------------------------------------------------------

-- =============================================================================
-- v8 final hardening / compatibility pass
-- =============================================================================

-- Conversation members now expose the normal profile-card fields used by v8.
-- last_active_at is hidden when that member disables online/last-seen visibility.
drop function if exists public.get_conversation_members(uuid);
create function public.get_conversation_members(target_conversation uuid)
returns table (
  conversation_id uuid,
  user_id uuid,
  role text,
  joined_at timestamptz,
  last_read_at timestamptz,
  muted_until timestamptz,
  profile_id uuid,
  username text,
  display_name text,
  bio text,
  avatar_path text,
  profile_created_at timestamptz,
  admin_tag text,
  status_text text,
  last_active_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    cm.conversation_id,
    cm.user_id,
    cm.role,
    cm.joined_at,
    case when cm.user_id = auth.uid() or p.show_read_receipts then cm.last_read_at else null end,
    case when cm.user_id = auth.uid() then cm.muted_until else null end,
    p.id,
    p.username,
    p.display_name,
    p.bio,
    p.avatar_path,
    p.created_at,
    p.admin_tag,
    p.status_text,
    case when cm.user_id = auth.uid() or p.show_online_status then p.last_active_at else null end
  from public.conversation_members cm
  join public.profiles p on p.id = cm.user_id
  where cm.conversation_id = target_conversation
    and public.is_conversation_member(target_conversation)
  order by cm.joined_at;
$$;
revoke all on function public.get_conversation_members(uuid) from public;
grant execute on function public.get_conversation_members(uuid) to authenticated;

-- Safe profile cards for the UI. This keeps last-seen private when requested.
create or replace function public.get_profile_card(target_user uuid)
returns table (
  id uuid,
  username text,
  display_name text,
  bio text,
  avatar_path text,
  admin_tag text,
  status_text text,
  last_active_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.bio, p.avatar_path, p.admin_tag,
         p.status_text,
         case when p.id = auth.uid() or p.show_online_status then p.last_active_at else null end,
         p.created_at
  from public.profiles p
  where p.id = target_user;
$$;
revoke all on function public.get_profile_card(uuid) from public;
grant execute on function public.get_profile_card(uuid) to authenticated;

-- Make cleared history behave like a real local clear: old messages no longer
-- appear in previews, unread counts, or search for that user.
drop function if exists public.get_my_conversations();
create function public.get_my_conversations()
returns table (
  conversation_id uuid,
  kind text,
  title text,
  avatar_path text,
  other_user_id uuid,
  last_message text,
  last_message_at timestamptz,
  unread_count bigint,
  member_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.kind,
    case when c.kind='group' then coalesce(c.name,'Group chat')
         else coalesce(other_profile.display_name,other_profile.username,'Unknown user') end,
    case when c.kind='group' then c.avatar_path else other_profile.avatar_path end,
    case when c.kind='dm' then other_profile.id else null end,
    case
      when latest.deleted_at is not null then 'Message deleted'
      when coalesce(latest.body,'') <> '' then latest.body
      when latest.id is not null then 'Attachment'
      else null
    end,
    latest.created_at,
    (
      select count(*) from public.messages unread
      where unread.conversation_id=c.id
        and unread.sender_id<>auth.uid()
        and unread.created_at>mine.last_seen_at
        and (mine.cleared_at is null or unread.created_at>mine.cleared_at)
    ),
    (select count(*) from public.conversation_members count_members where count_members.conversation_id=c.id)
  from public.conversations c
  join public.conversation_members mine on mine.conversation_id=c.id and mine.user_id=auth.uid()
  left join lateral (
    select p.id,p.username,p.display_name,p.avatar_path
    from public.conversation_members om join public.profiles p on p.id=om.user_id
    where om.conversation_id=c.id and om.user_id<>auth.uid()
    order by om.joined_at limit 1
  ) other_profile on true
  left join lateral (
    select m.id,m.body,m.created_at,m.deleted_at
    from public.messages m
    where m.conversation_id=c.id
      and (mine.cleared_at is null or m.created_at>mine.cleared_at)
    order by m.created_at desc limit 1
  ) latest on true
  order by (mine.pinned_at is not null) desc, mine.pinned_at desc nulls last,
           coalesce(latest.created_at,c.updated_at,c.created_at) desc;
$$;
revoke all on function public.get_my_conversations() from public;
grant execute on function public.get_my_conversations() to authenticated;

create or replace function public.search_my_messages(search_text text, result_limit integer default 50)
returns table (
  message_id uuid,
  conversation_id uuid,
  conversation_kind text,
  conversation_title text,
  sender_id uuid,
  sender_name text,
  body text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id,c.id,c.kind,
    case when c.kind='group' then coalesce(c.name,'Group chat')
         else coalesce(other_profile.display_name,other_profile.username,'Unknown user') end,
    m.sender_id,coalesce(sender.display_name,sender.username,'User'),coalesce(m.body,''),m.created_at
  from public.messages m
  join public.conversations c on c.id=m.conversation_id
  join public.conversation_members mine on mine.conversation_id=c.id and mine.user_id=auth.uid()
  join public.profiles sender on sender.id=m.sender_id
  left join lateral (
    select p.username,p.display_name
    from public.conversation_members om join public.profiles p on p.id=om.user_id
    where om.conversation_id=c.id and om.user_id<>auth.uid()
    order by om.joined_at limit 1
  ) other_profile on true
  where m.deleted_at is null
    and (mine.cleared_at is null or m.created_at>mine.cleared_at)
    and char_length(trim(coalesce(search_text,'')))>=2
    and strpos(lower(coalesce(m.body,'')),lower(trim(search_text)))>0
  order by m.created_at desc
  limit least(greatest(coalesce(result_limit,50),1),100);
$$;
revoke all on function public.search_my_messages(text,integer) from public;
grant execute on function public.search_my_messages(text,integer) to authenticated;

-- Edit history is recorded atomically by the database instead of trusting the UI.
create or replace function public.capture_message_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.deleted_at is null
     and new.deleted_at is null
     and coalesce(old.body,'') is distinct from coalesce(new.body,'') then
    insert into public.message_edits(message_id,editor_id,old_body)
    values(old.id,coalesce(auth.uid(),old.sender_id),coalesce(old.body,''));
  end if;
  return new;
end;
$$;
drop trigger if exists capture_message_edit_before_update on public.messages;
create trigger capture_message_edit_before_update
before update on public.messages
for each row execute function public.capture_message_edit();
revoke insert on public.message_edits from authenticated;
grant select on public.message_edits to authenticated;

-- Users may add only their own fixed-format security log entries through this RPC.
create or replace function public.record_account_event(p_event_type text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_event_type not in ('email_change','password_change') then raise exception 'Unsupported event'; end if;
  insert into public.account_events(user_id,event_type,detail)
  values(
    auth.uid(),
    p_event_type,
    case when p_event_type='email_change' then 'Email change requested.' else 'Password changed.' end
  );
end;
$$;
revoke all on function public.record_account_event(text) from public;
grant execute on function public.record_account_event(text) to authenticated;

-- Make request acceptance honor blocks created after the request was submitted.
create or replace function public.respond_dm_request(p_request_id uuid, p_accept boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.dm_requests%rowtype;
  c uuid;
begin
  select * into r from public.dm_requests
  where id=p_request_id and recipient_id=auth.uid() and status='pending' for update;
  if r.id is null then raise exception 'Message request not found'; end if;

  if exists (
    select 1 from public.blocks b
    where (b.blocker_id=r.sender_id and b.blocked_id=r.recipient_id)
       or (b.blocker_id=r.recipient_id and b.blocked_id=r.sender_id)
  ) then
    update public.dm_requests set status='declined',responded_at=now() where id=r.id;
    raise exception 'This direct message is unavailable';
  end if;

  update public.dm_requests
  set status=case when p_accept then 'accepted' else 'declined' end,responded_at=now()
  where id=r.id;
  if not p_accept then return null; end if;

  select conv.id into c from public.conversations conv
  where conv.kind='dm'
    and exists(select 1 from public.conversation_members a where a.conversation_id=conv.id and a.user_id=r.sender_id)
    and exists(select 1 from public.conversation_members b where b.conversation_id=conv.id and b.user_id=r.recipient_id)
    and (select count(*) from public.conversation_members x where x.conversation_id=conv.id)=2
  limit 1;
  if c is not null then return c; end if;
  insert into public.conversations(kind,created_by) values('dm',r.sender_id) returning id into c;
  insert into public.conversation_members(conversation_id,user_id,role)
  values(c,r.sender_id,'member'),(c,r.recipient_id,'member');
  return c;
end;
$$;
revoke all on function public.respond_dm_request(uuid,boolean) from public;
grant execute on function public.respond_dm_request(uuid,boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- Realtime publication for v8 delivery receipts + message requests.
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['message_receipts', 'dm_requests']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;
