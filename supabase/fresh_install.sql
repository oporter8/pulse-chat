-- Pulse Chat v5 fresh install
-- Run this on a NEW Supabase project only.
-- For an existing Pulse database, run v5_migration.sql instead.

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
-- v5 additive upgrade
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
