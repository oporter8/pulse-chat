-- Pulse Chat v6 upgrade
-- Run this ONCE after v5_migration.sql on an existing Pulse Chat v5 database.
-- Adds password-flow support in the UI, privacy controls, message search,
-- per-chat notification mute state, and Web Push subscription storage.

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Privacy + notification preferences
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists dm_privacy text not null default 'everyone',
  add column if not exists show_read_receipts boolean not null default true,
  add column if not exists show_online_status boolean not null default true,
  add column if not exists notifications_enabled boolean not null default true,
  add column if not exists notification_preview boolean not null default true;

alter table public.profiles
  drop constraint if exists profiles_dm_privacy_check;
alter table public.profiles
  add constraint profiles_dm_privacy_check
  check (dm_privacy in ('everyone', 'mutual_groups', 'nobody'));

-- Separate unread tracking from visible read receipts. last_seen_at always moves
-- forward for the current user; last_read_at is only published when that user
-- allows read receipts.
alter table public.conversation_members
  add column if not exists last_seen_at timestamptz,
  add column if not exists muted_until timestamptz;

update public.conversation_members
set last_seen_at = coalesce(last_seen_at, last_read_at, joined_at, now())
where last_seen_at is null;

alter table public.conversation_members
  alter column last_seen_at set default now(),
  alter column last_seen_at set not null,
  alter column last_read_at drop not null;

create index if not exists conversation_members_seen_idx
  on public.conversation_members(conversation_id, last_seen_at);

-- -----------------------------------------------------------------------------
-- Web Push subscriptions. Endpoints and encryption keys are private device data.
-- The browser can manage only its own user's rows. Delivery reads happen only
-- from the server-side service-role route.
-- -----------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "Users can read own push subscriptions" on public.push_subscriptions;
create policy "Users can read own push subscriptions"
  on public.push_subscriptions for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can create own push subscriptions" on public.push_subscriptions;
create policy "Users can create own push subscriptions"
  on public.push_subscriptions for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can update own push subscriptions" on public.push_subscriptions;
create policy "Users can update own push subscriptions"
  on public.push_subscriptions for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can delete own push subscriptions" on public.push_subscriptions;
create policy "Users can delete own push subscriptions"
  on public.push_subscriptions for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- Server-only idempotency ledger. A message may trigger Web Push only once,
-- which prevents an authenticated sender from replaying the delivery endpoint.
create table if not exists public.push_dispatches (
  message_id uuid primary key references public.messages(id) on delete cascade,
  dispatched_at timestamptz not null default now()
);

alter table public.push_dispatches enable row level security;
revoke all on public.push_dispatches from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Direct-message privacy. Existing DMs remain accessible; the preference only
-- controls creation of a new direct-message conversation.
-- -----------------------------------------------------------------------------
create or replace function public.start_dm(other_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_user uuid := auth.uid();
  v_privacy text;
  existing_conversation uuid;
  new_conversation uuid;
begin
  if v_current_user is null then
    raise exception 'Not authenticated';
  end if;

  if other_user = v_current_user then
    raise exception 'You cannot start a DM with yourself';
  end if;

  select p.dm_privacy into v_privacy
  from public.profiles p
  where p.id = other_user;

  if v_privacy is null then
    raise exception 'User not found';
  end if;

  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = v_current_user and b.blocked_id = other_user)
       or (b.blocker_id = other_user and b.blocked_id = v_current_user)
  ) then
    raise exception 'This direct message is unavailable';
  end if;

  -- Reuse an existing DM before applying the target's new-DM preference.
  select c.id
    into existing_conversation
  from public.conversations c
  where c.kind = 'dm'
    and exists (
      select 1 from public.conversation_members a
      where a.conversation_id = c.id and a.user_id = v_current_user
    )
    and exists (
      select 1 from public.conversation_members b
      where b.conversation_id = c.id and b.user_id = other_user
    )
    and (
      select count(*)
      from public.conversation_members all_members
      where all_members.conversation_id = c.id
    ) = 2
  limit 1;

  if existing_conversation is not null then
    return existing_conversation;
  end if;

  if v_privacy = 'nobody' then
    raise exception 'This person is not accepting new direct messages';
  end if;

  if v_privacy = 'mutual_groups' and not exists (
    select 1
    from public.conversations shared
    join public.conversation_members mine
      on mine.conversation_id = shared.id
     and mine.user_id = v_current_user
    join public.conversation_members theirs
      on theirs.conversation_id = shared.id
     and theirs.user_id = other_user
    where shared.kind = 'group'
  ) then
    raise exception 'This person only accepts new DMs from shared groups';
  end if;

  insert into public.conversations (kind, created_by)
  values ('dm', v_current_user)
  returning id into new_conversation;

  insert into public.conversation_members (conversation_id, user_id, role)
  values
    (new_conversation, v_current_user, 'member'),
    (new_conversation, other_user, 'member');

  return new_conversation;
end;
$$;

revoke all on function public.start_dm(uuid) from public;
grant execute on function public.start_dm(uuid) to authenticated;

-- Keep the v5 return shape, but count unread messages from private last_seen_at
-- instead of the read-receipt timestamp.
create or replace function public.get_my_conversations()
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
    case
      when c.kind = 'group' then coalesce(c.name, 'Group chat')
      else coalesce(other_profile.display_name, other_profile.username, 'Unknown user')
    end as title,
    case when c.kind = 'group' then c.avatar_path else other_profile.avatar_path end as avatar_path,
    case when c.kind = 'dm' then other_profile.id else null end as other_user_id,
    case
      when latest.deleted_at is not null then 'Message deleted'
      when coalesce(latest.body, '') <> '' then latest.body
      when latest.id is not null then 'Attachment'
      else null
    end as last_message,
    latest.created_at as last_message_at,
    (
      select count(*)
      from public.messages unread
      where unread.conversation_id = c.id
        and unread.sender_id <> auth.uid()
        and unread.created_at > mine.last_seen_at
    ) as unread_count,
    (
      select count(*)
      from public.conversation_members count_members
      where count_members.conversation_id = c.id
    ) as member_count
  from public.conversations c
  join public.conversation_members mine
    on mine.conversation_id = c.id
   and mine.user_id = auth.uid()
  left join lateral (
    select p.id, p.username, p.display_name, p.avatar_path
    from public.conversation_members om
    join public.profiles p on p.id = om.user_id
    where om.conversation_id = c.id
      and om.user_id <> auth.uid()
    order by om.joined_at
    limit 1
  ) other_profile on true
  left join lateral (
    select m.id, m.body, m.created_at, m.deleted_at
    from public.messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) latest on true
  order by coalesce(latest.created_at, c.updated_at, c.created_at) desc;
$$;

revoke all on function public.get_my_conversations() from public;
grant execute on function public.get_my_conversations() to authenticated;

-- Return conversation members while suppressing another member's read timestamp
-- when they have disabled read receipts.
create or replace function public.get_conversation_members(target_conversation uuid)
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
  profile_created_at timestamptz
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
    case
      when cm.user_id = auth.uid() or p.show_read_receipts then cm.last_read_at
      else null
    end as last_read_at,
    case when cm.user_id = auth.uid() then cm.muted_until else null end as muted_until,
    p.id as profile_id,
    p.username,
    p.display_name,
    p.bio,
    p.avatar_path,
    p.created_at as profile_created_at
  from public.conversation_members cm
  join public.profiles p on p.id = cm.user_id
  where cm.conversation_id = target_conversation
    and public.is_conversation_member(target_conversation)
  order by cm.joined_at;
$$;

revoke all on function public.get_conversation_members(uuid) from public;
grant execute on function public.get_conversation_members(uuid) to authenticated;

-- Literal substring search over messages in conversations the caller belongs to.
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
  select
    m.id as message_id,
    c.id as conversation_id,
    c.kind as conversation_kind,
    case
      when c.kind = 'group' then coalesce(c.name, 'Group chat')
      else coalesce(other_profile.display_name, other_profile.username, 'Unknown user')
    end as conversation_title,
    m.sender_id,
    coalesce(sender.display_name, sender.username, 'User') as sender_name,
    coalesce(m.body, '') as body,
    m.created_at
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  join public.conversation_members mine
    on mine.conversation_id = c.id
   and mine.user_id = auth.uid()
  join public.profiles sender on sender.id = m.sender_id
  left join lateral (
    select p.username, p.display_name
    from public.conversation_members om
    join public.profiles p on p.id = om.user_id
    where om.conversation_id = c.id
      and om.user_id <> auth.uid()
    order by om.joined_at
    limit 1
  ) other_profile on true
  where m.deleted_at is null
    and char_length(trim(coalesce(search_text, ''))) >= 2
    and strpos(lower(coalesce(m.body, '')), lower(trim(search_text))) > 0
  order by m.created_at desc
  limit least(greatest(coalesce(result_limit, 50), 1), 100);
$$;

revoke all on function public.search_my_messages(text, integer) from public;
grant execute on function public.search_my_messages(text, integer) to authenticated;

-- Harden membership updates: clients need only read-state and mute columns.
-- RLS still restricts those writes to the caller's own membership row.
revoke update on public.conversation_members from authenticated;
grant update (last_read_at, last_seen_at, muted_until) on public.conversation_members to authenticated;

-- Existing policy remains valid, but recreate it so the intent is explicit.
drop policy if exists "Members can update their own membership" on public.conversation_members;
create policy "Members can update their own membership"
  on public.conversation_members for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Profile preference columns use the existing own-profile update RLS policy.
grant select, update on public.profiles to authenticated;
