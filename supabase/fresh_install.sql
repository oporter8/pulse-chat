-- ============================================================================
-- schema.sql
-- ============================================================================

-- Pulse Chat database schema
-- Run this entire file in Supabase Dashboard -> SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  created_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[a-z0-9_]{3,20}$')
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create index if not exists conversation_members_user_id_idx
  on public.conversation_members(user_id);

create index if not exists messages_conversation_created_idx
  on public.messages(conversation_id, created_at);

-- Create a profile automatically when a new Auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_username text;
begin
  requested_username := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', '')));

  if requested_username !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'Invalid username';
  end if;

  insert into public.profiles (id, username)
  values (new.id, requested_username);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Helper used by row-level security.
create or replace function public.is_conversation_member(target_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = target_conversation
      and cm.user_id = auth.uid()
  );
$$;

revoke all on function public.is_conversation_member(uuid) from public;
grant execute on function public.is_conversation_member(uuid) to authenticated;

-- Create or reuse a direct-message conversation.
create or replace function public.start_dm(other_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_user uuid := auth.uid();
  existing_conversation uuid;
  new_conversation uuid;
begin
  if v_current_user is null then
    raise exception 'Not authenticated';
  end if;

  if other_user = v_current_user then
    raise exception 'You cannot start a DM with yourself';
  end if;

  if not exists (select 1 from public.profiles where id = other_user) then
    raise exception 'User not found';
  end if;

  select c.id
    into existing_conversation
  from public.conversations c
  where exists (
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

  insert into public.conversations default values
  returning id into new_conversation;

  insert into public.conversation_members (conversation_id, user_id)
  values
    (new_conversation, v_current_user),
    (new_conversation, other_user);

  return new_conversation;
end;
$$;

revoke all on function public.start_dm(uuid) from public;
grant execute on function public.start_dm(uuid) to authenticated;

-- Return the current user's DMs with the other username + latest message.
create or replace function public.get_my_conversations()
returns table (
  conversation_id uuid,
  other_user_id uuid,
  username text,
  last_message text,
  last_message_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id as conversation_id,
    other_profile.id as other_user_id,
    other_profile.username,
    latest.body as last_message,
    latest.created_at as last_message_at
  from public.conversations c
  join public.conversation_members mine
    on mine.conversation_id = c.id
   and mine.user_id = auth.uid()
  join public.conversation_members other_member
    on other_member.conversation_id = c.id
   and other_member.user_id <> auth.uid()
  join public.profiles other_profile
    on other_profile.id = other_member.user_id
  left join lateral (
    select m.body, m.created_at
    from public.messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) latest on true
  order by coalesce(latest.created_at, c.created_at) desc;
$$;

revoke all on function public.get_my_conversations() from public;
grant execute on function public.get_my_conversations() to authenticated;

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

drop policy if exists "Authenticated users can search profiles" on public.profiles;
create policy "Authenticated users can search profiles"
  on public.profiles
  for select
  to authenticated
  using (true);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "Members can read conversations" on public.conversations;
create policy "Members can read conversations"
  on public.conversations
  for select
  to authenticated
  using (public.is_conversation_member(id));

drop policy if exists "Members can read memberships" on public.conversation_members;
create policy "Members can read memberships"
  on public.conversation_members
  for select
  to authenticated
  using (public.is_conversation_member(conversation_id));

drop policy if exists "Members can read messages" on public.messages;
create policy "Members can read messages"
  on public.messages
  for select
  to authenticated
  using (public.is_conversation_member(conversation_id));

drop policy if exists "Members can send messages as themselves" on public.messages;
create policy "Members can send messages as themselves"
  on public.messages
  for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_conversation_member(conversation_id)
  );

drop policy if exists "Senders can update their own messages" on public.messages;
create policy "Senders can update their own messages"
  on public.messages
  for update
  to authenticated
  using (
    sender_id = auth.uid()
    and public.is_conversation_member(conversation_id)
  )
  with check (
    sender_id = auth.uid()
    and public.is_conversation_member(conversation_id)
  );

drop policy if exists "Senders can delete their own messages" on public.messages;
create policy "Senders can delete their own messages"
  on public.messages
  for delete
  to authenticated
  using (
    sender_id = auth.uid()
    and public.is_conversation_member(conversation_id)
  );

-- Enable messages for Postgres Changes Realtime, without failing if re-run.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end
$$;

-- ============================================================================
-- v5_migration.sql
-- ============================================================================

-- Pulse Chat v5 upgrade
-- Run this ONCE in Supabase Dashboard -> SQL Editor AFTER the existing schema.sql.
-- It preserves existing users, conversations, and messages.

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Profile + conversation upgrades
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists display_name text,
  add column if not exists bio text not null default '',
  add column if not exists avatar_path text;

update public.profiles
set display_name = username
where display_name is null;

alter table public.profiles
  alter column display_name set not null;

alter table public.profiles
  drop constraint if exists profiles_display_name_length;
alter table public.profiles
  add constraint profiles_display_name_length
  check (char_length(display_name) between 1 and 40);

alter table public.profiles
  drop constraint if exists profiles_bio_length;
alter table public.profiles
  add constraint profiles_bio_length
  check (char_length(bio) <= 160);

-- Update the Auth trigger so future signups populate the new required fields.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_username text;
  requested_display_name text;
begin
  requested_username := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', '')));
  requested_display_name := trim(coalesce(new.raw_user_meta_data ->> 'display_name', requested_username));

  if requested_username !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'Invalid username';
  end if;

  if requested_display_name = '' then
    requested_display_name := requested_username;
  end if;

  insert into public.profiles (id, username, display_name)
  values (new.id, requested_username, requested_display_name);

  return new;
end;
$$;

alter table public.conversations
  add column if not exists kind text not null default 'dm',
  add column if not exists name text,
  add column if not exists avatar_path text,
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table public.conversations
  drop constraint if exists conversations_kind_check;
alter table public.conversations
  add constraint conversations_kind_check check (kind in ('dm', 'group'));

alter table public.conversations
  drop constraint if exists conversations_name_length;
alter table public.conversations
  add constraint conversations_name_length
  check (name is null or char_length(name) between 1 and 60);

alter table public.conversation_members
  add column if not exists role text not null default 'member',
  add column if not exists last_read_at timestamptz not null default now();

alter table public.conversation_members
  drop constraint if exists conversation_members_role_check;
alter table public.conversation_members
  add constraint conversation_members_role_check check (role in ('owner', 'admin', 'member'));

alter table public.messages
  add column if not exists reply_to uuid references public.messages(id) on delete set null,
  add column if not exists deleted_at timestamptz;

alter table public.messages alter column body drop not null;
alter table public.messages alter column body set default '';
update public.messages set body = '' where body is null;

alter table public.messages
  drop constraint if exists messages_body_check;
alter table public.messages
  drop constraint if exists messages_body_length;
alter table public.messages
  add constraint messages_body_length check (char_length(coalesce(body, '')) <= 2000);

create index if not exists conversation_members_read_idx
  on public.conversation_members(conversation_id, last_read_at);
create index if not exists conversations_updated_idx
  on public.conversations(updated_at desc);
create index if not exists messages_reply_to_idx
  on public.messages(reply_to);

-- -----------------------------------------------------------------------------
-- New feature tables
-- -----------------------------------------------------------------------------
create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  uploader_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  content_type text,
  size_bytes bigint not null default 0 check (size_bytes >= 0 and size_bytes <= 6291456),
  created_at timestamptz not null default now()
);

create index if not exists message_attachments_message_idx
  on public.message_attachments(message_id);

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji),
  constraint message_reactions_emoji_length check (char_length(emoji) between 1 and 16)
);

create index if not exists message_reactions_message_idx
  on public.message_reactions(message_id);

create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);

create table if not exists public.app_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid references public.profiles(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  reason text not null,
  details text not null default '',
  status text not null default 'open',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  constraint reports_reason_check check (reason in ('spam', 'harassment', 'impersonation', 'inappropriate', 'other')),
  constraint reports_status_check check (status in ('open', 'resolved', 'dismissed')),
  constraint reports_details_length check (char_length(details) <= 1000)
);

create index if not exists reports_status_created_idx
  on public.reports(status, created_at desc);

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_admins a where a.user_id = auth.uid()
  );
$$;

revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to authenticated;

create or replace function public.is_conversation_admin(target_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = target_conversation
      and cm.user_id = auth.uid()
      and cm.role in ('owner', 'admin')
  );
$$;

revoke all on function public.is_conversation_admin(uuid) from public;
grant execute on function public.is_conversation_admin(uuid) to authenticated;

create or replace function public.can_send_to_conversation(target_conversation uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_other uuid;
begin
  if not public.is_conversation_member(target_conversation) then
    return false;
  end if;

  select c.kind into v_kind
  from public.conversations c
  where c.id = target_conversation;

  if v_kind <> 'dm' then
    return true;
  end if;

  select cm.user_id into v_other
  from public.conversation_members cm
  where cm.conversation_id = target_conversation
    and cm.user_id <> auth.uid()
  limit 1;

  if v_other is null then
    return false;
  end if;

  return not exists (
    select 1
    from public.blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = v_other)
       or (b.blocker_id = v_other and b.blocked_id = auth.uid())
  );
end;
$$;

revoke all on function public.can_send_to_conversation(uuid) from public;
grant execute on function public.can_send_to_conversation(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- DM + group RPCs
-- -----------------------------------------------------------------------------
create or replace function public.start_dm(other_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_user uuid := auth.uid();
  existing_conversation uuid;
  new_conversation uuid;
begin
  if v_current_user is null then
    raise exception 'Not authenticated';
  end if;

  if other_user = v_current_user then
    raise exception 'You cannot start a DM with yourself';
  end if;

  if not exists (select 1 from public.profiles where id = other_user) then
    raise exception 'User not found';
  end if;

  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = v_current_user and b.blocked_id = other_user)
       or (b.blocker_id = other_user and b.blocked_id = v_current_user)
  ) then
    raise exception 'This direct message is unavailable';
  end if;

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

create or replace function public.create_group(group_name text, member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_user uuid := auth.uid();
  v_conversation uuid;
  v_member uuid;
  v_clean_name text := trim(group_name);
begin
  if v_current_user is null then
    raise exception 'Not authenticated';
  end if;

  if char_length(v_clean_name) < 1 or char_length(v_clean_name) > 60 then
    raise exception 'Group name must be 1-60 characters';
  end if;

  insert into public.conversations (kind, name, created_by)
  values ('group', v_clean_name, v_current_user)
  returning id into v_conversation;

  insert into public.conversation_members (conversation_id, user_id, role)
  values (v_conversation, v_current_user, 'owner');

  for v_member in
    select distinct unnest(coalesce(member_ids, array[]::uuid[]))
  loop
    if v_member <> v_current_user
       and exists (select 1 from public.profiles where id = v_member) then
      insert into public.conversation_members (conversation_id, user_id, role)
      values (v_conversation, v_member, 'member')
      on conflict do nothing;
    end if;
  end loop;

  if (select count(*) from public.conversation_members where conversation_id = v_conversation) < 2 then
    raise exception 'Add at least one other person to the group';
  end if;

  return v_conversation;
end;
$$;

revoke all on function public.create_group(text, uuid[]) from public;
grant execute on function public.create_group(text, uuid[]) to authenticated;

create or replace function public.add_group_member(target_conversation uuid, target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_conversation_admin(target_conversation) then
    raise exception 'Only group admins can add members';
  end if;

  if not exists (
    select 1 from public.conversations c
    where c.id = target_conversation and c.kind = 'group'
  ) then
    raise exception 'Not a group conversation';
  end if;

  insert into public.conversation_members (conversation_id, user_id, role)
  values (target_conversation, target_user, 'member')
  on conflict do nothing;
end;
$$;

revoke all on function public.add_group_member(uuid, uuid) from public;
grant execute on function public.add_group_member(uuid, uuid) to authenticated;

create or replace function public.remove_group_member(target_conversation uuid, target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_role text;
begin
  if target_user = auth.uid() then
    select role into v_target_role
    from public.conversation_members
    where conversation_id = target_conversation and user_id = auth.uid();

    if v_target_role = 'owner' then
      update public.conversation_members
      set role = 'owner'
      where conversation_id = target_conversation
        and user_id = (
          select cm.user_id
          from public.conversation_members cm
          where cm.conversation_id = target_conversation
            and cm.user_id <> auth.uid()
          order by case cm.role when 'admin' then 0 else 1 end, cm.joined_at
          limit 1
        );
    end if;

    delete from public.conversation_members
    where conversation_id = target_conversation and user_id = auth.uid();
    return;
  end if;

  if not public.is_conversation_admin(target_conversation) then
    raise exception 'Only group admins can remove members';
  end if;

  select role into v_target_role
  from public.conversation_members
  where conversation_id = target_conversation and user_id = target_user;

  if v_target_role = 'owner' then
    raise exception 'The group owner cannot be removed';
  end if;

  delete from public.conversation_members
  where conversation_id = target_conversation and user_id = target_user;
end;
$$;

revoke all on function public.remove_group_member(uuid, uuid) from public;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;

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
        and unread.created_at > mine.last_read_at
    ) as unread_count,
    (
      select count(*) from public.conversation_members count_members
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

-- Keep conversation ordering current.
create or replace function public.touch_conversation_after_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists touch_conversation_on_message on public.messages;
create trigger touch_conversation_on_message
  after insert on public.messages
  for each row execute function public.touch_conversation_after_message();

-- Basic anti-spam protection: max 12 messages in 10 seconds and 80 in 5 minutes.
create or replace function public.enforce_message_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    select count(*) from public.messages m
    where m.sender_id = new.sender_id
      and m.created_at > now() - interval '10 seconds'
  ) >= 12 then
    raise exception 'You are sending messages too quickly. Try again in a few seconds.';
  end if;

  if (
    select count(*) from public.messages m
    where m.sender_id = new.sender_id
      and m.created_at > now() - interval '5 minutes'
  ) >= 80 then
    raise exception 'Message rate limit reached. Try again shortly.';
  end if;

  return new;
end;
$$;

drop trigger if exists message_rate_limit on public.messages;
create trigger message_rate_limit
  before insert on public.messages
  for each row execute function public.enforce_message_rate_limit();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.message_attachments enable row level security;
alter table public.message_reactions enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.app_admins enable row level security;

-- Conversations can be updated only by group admins.
drop policy if exists "Group admins can update conversations" on public.conversations;
create policy "Group admins can update conversations"
  on public.conversations for update to authenticated
  using (kind = 'group' and public.is_conversation_admin(id))
  with check (kind = 'group' and public.is_conversation_admin(id));

-- Members can update their own read state.
drop policy if exists "Members can update their own membership" on public.conversation_members;
create policy "Members can update their own membership"
  on public.conversation_members for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Replace send policy so blocks are respected.
drop policy if exists "Members can send messages as themselves" on public.messages;
create policy "Members can send messages as themselves"
  on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.can_send_to_conversation(conversation_id)
  );

-- Attachments metadata.
drop policy if exists "Members can read attachment metadata" on public.message_attachments;
create policy "Members can read attachment metadata"
  on public.message_attachments for select to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and public.is_conversation_member(m.conversation_id)
    )
  );

drop policy if exists "Members can add attachment metadata" on public.message_attachments;
create policy "Members can add attachment metadata"
  on public.message_attachments for insert to authenticated
  with check (
    uploader_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_id
        and m.sender_id = auth.uid()
        and public.is_conversation_member(m.conversation_id)
    )
  );

drop policy if exists "Uploaders can delete attachment metadata" on public.message_attachments;
create policy "Uploaders can delete attachment metadata"
  on public.message_attachments for delete to authenticated
  using (uploader_id = auth.uid());

-- Reactions.
drop policy if exists "Members can read reactions" on public.message_reactions;
create policy "Members can read reactions"
  on public.message_reactions for select to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and public.is_conversation_member(m.conversation_id)
    )
  );

drop policy if exists "Members can add their reactions" on public.message_reactions;
create policy "Members can add their reactions"
  on public.message_reactions for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_id
        and public.is_conversation_member(m.conversation_id)
    )
  );

drop policy if exists "Users can remove their reactions" on public.message_reactions;
create policy "Users can remove their reactions"
  on public.message_reactions for delete to authenticated
  using (user_id = auth.uid());

-- Blocks.
drop policy if exists "Users can view their blocks" on public.blocks;
create policy "Users can view their blocks"
  on public.blocks for select to authenticated
  using (blocker_id = auth.uid());

drop policy if exists "Users can create blocks" on public.blocks;
create policy "Users can create blocks"
  on public.blocks for insert to authenticated
  with check (blocker_id = auth.uid() and blocked_id <> auth.uid());

drop policy if exists "Users can remove blocks" on public.blocks;
create policy "Users can remove blocks"
  on public.blocks for delete to authenticated
  using (blocker_id = auth.uid());

-- Reports + admin moderation.
drop policy if exists "Users can create reports" on public.reports;
create policy "Users can create reports"
  on public.reports for insert to authenticated
  with check (reporter_id = auth.uid());

drop policy if exists "Users can view own reports and admins can view all" on public.reports;
create policy "Users can view own reports and admins can view all"
  on public.reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_app_admin());

drop policy if exists "Admins can update reports" on public.reports;
create policy "Admins can update reports"
  on public.reports for update to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists "Users can see own admin status" on public.app_admins;
create policy "Users can see own admin status"
  on public.app_admins for select to authenticated
  using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Storage buckets + RLS
-- Public avatars, private conversation attachments.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars', 'avatars', true, 2097152,
  array['image/jpeg','image/png','image/webp','image/gif']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 6291456)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

-- Avatar uploads live at <user-id>/filename.ext.
drop policy if exists "Users can upload own avatar" on storage.objects;
create policy "Users can upload own avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "Users can update own avatar" on storage.objects;
create policy "Users can update own avatar"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and owner_id = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "Users can delete own avatar" on storage.objects;
create policy "Users can delete own avatar"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and owner_id = (select auth.uid()::text)
  );

-- Attachments live at <conversation-id>/<user-id>/filename.
drop policy if exists "Conversation members can read attachments" on storage.objects;
create policy "Conversation members can read attachments"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'attachments'
    and case
      when (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
      then public.is_conversation_member(((storage.foldername(name))[1])::uuid)
      else false
    end
  );

drop policy if exists "Conversation members can upload attachments" on storage.objects;
create policy "Conversation members can upload attachments"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[2] = (select auth.uid()::text)
    and case
      when (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
      then public.is_conversation_member(((storage.foldername(name))[1])::uuid)
      else false
    end
  );

drop policy if exists "Users can delete own attachments" on storage.objects;
create policy "Users can delete own attachments"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'attachments'
    and owner_id = (select auth.uid()::text)
  );

-- -----------------------------------------------------------------------------
-- Realtime publication for v5 tables.
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['message_attachments', 'message_reactions', 'conversation_members']
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

-- Helpful grants for projects with restrictive Data API defaults.
grant select, update on public.profiles to authenticated;
grant select, update on public.conversations to authenticated;
grant select, update on public.conversation_members to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
grant select, insert, delete on public.message_attachments to authenticated;
grant select, insert, delete on public.message_reactions to authenticated;
grant select, insert, delete on public.blocks to authenticated;
grant select, insert, update on public.reports to authenticated;
grant select on public.app_admins to authenticated;

-- To make yourself an app moderator later, copy your user UUID from
-- Supabase -> Authentication -> Users and run:
-- insert into public.app_admins (user_id) values ('YOUR-USER-UUID') on conflict do nothing;

-- ============================================================================
-- v6_migration.sql
-- ============================================================================

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

-- ============================================================================
-- v7_migration.sql
-- ============================================================================

-- Pulse Chat v7 owner/admin upgrade
-- Run ONCE after v6_migration.sql on the existing Pulse database.

alter table public.profiles
  add column if not exists admin_tag text;

alter table public.profiles
  drop constraint if exists profiles_admin_tag_check;
alter table public.profiles
  add constraint profiles_admin_tag_check
  check (
    admin_tag is null
    or (
      char_length(admin_tag) between 1 and 16
      and admin_tag ~ '^[A-Za-z0-9 _-]+$'
    )
  );


-- Keep future signups compatible with the owner rule too.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_username text;
  requested_display_name text;
  v_owner boolean := lower(coalesce(new.email, '')) = lower('owensporter@icloud.com');
begin
  requested_username := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', '')));
  requested_display_name := trim(coalesce(new.raw_user_meta_data ->> 'display_name', requested_username));

  if requested_username !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'Invalid username';
  end if;

  if requested_display_name = '' then
    requested_display_name := requested_username;
  end if;

  insert into public.profiles (id, username, display_name, admin_tag)
  values (new.id, requested_username, requested_display_name, case when v_owner then 'OWNER' else null end);

  if v_owner then
    insert into public.app_admins (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

-- Designate the requested account as the Pulse owner.
insert into public.app_admins (user_id)
select p.id
from public.profiles p
join auth.users u on u.id = p.id
where lower(u.email) = lower('owensporter@icloud.com')
on conflict (user_id) do nothing;

update public.profiles p
set admin_tag = coalesce(p.admin_tag, 'OWNER')
from auth.users u
where u.id = p.id
  and lower(u.email) = lower('owensporter@icloud.com');

-- Clients may edit normal profile/preferences fields but not admin_tag directly.
revoke update on public.profiles from authenticated;
grant update (
  username,
  display_name,
  bio,
  avatar_path,
  dm_privacy,
  show_read_receipts,
  show_online_status,
  notifications_enabled,
  notification_preview
) on public.profiles to authenticated;
grant select on public.profiles to authenticated;

create or replace function public.set_my_admin_tag(new_tag text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tag text := trim(new_tag);
begin
  if not public.is_app_admin() then
    raise exception 'Admin access required';
  end if;

  if v_tag !~ '^[A-Za-z0-9 _-]{1,16}$' then
    raise exception 'Tag must be 1-16 characters using letters, numbers, spaces, _ or -';
  end if;

  update public.profiles
  set admin_tag = v_tag
  where id = auth.uid();
end;
$$;

revoke all on function public.set_my_admin_tag(text) from public;
grant execute on function public.set_my_admin_tag(text) to authenticated;

-- Add the public admin tag to the member RPC.
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
  admin_tag text
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
    p.created_at as profile_created_at,
    p.admin_tag
  from public.conversation_members cm
  join public.profiles p on p.id = cm.user_id
  where cm.conversation_id = target_conversation
    and public.is_conversation_member(target_conversation)
  order by cm.joined_at;
$$;

revoke all on function public.get_conversation_members(uuid) from public;
grant execute on function public.get_conversation_members(uuid) to authenticated;

-- App admins can soft-delete any message using the existing UI.
drop policy if exists "Senders can update their own messages" on public.messages;
drop policy if exists "Senders and app admins can update messages" on public.messages;
create policy "Senders and app admins can update messages"
  on public.messages for update to authenticated
  using (
    (
      sender_id = auth.uid()
      and public.is_conversation_member(conversation_id)
    )
    or public.is_app_admin()
  )
  with check (
    (
      sender_id = auth.uid()
      and public.is_conversation_member(conversation_id)
    )
    or public.is_app_admin()
  );

-- ============================================================================
-- v8_migration.sql
-- ============================================================================

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

