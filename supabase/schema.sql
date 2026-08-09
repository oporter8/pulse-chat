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
