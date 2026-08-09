-- Pulse Chat v9 — $3 one-time access paywall
-- Run ONCE after v8_migration.sql on an existing Pulse database.
-- Preserves all existing users, chats, messages, admin roles, and v8 state.

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Access grants
-- -----------------------------------------------------------------------------
create table if not exists public.app_access (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  access_type text not null,
  granted_at timestamptz not null default now(),
  granted_by uuid references public.profiles(id) on delete set null,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  payment_provider text,
  payment_reference text,
  amount_paid_cents integer,
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint app_access_type_check check (access_type in ('paid', 'comped')),
  constraint app_access_amount_check check (amount_paid_cents is null or amount_paid_cents >= 0)
);

create index if not exists app_access_active_idx
  on public.app_access(user_id, revoked_at);

-- Wallet-provider compatibility when upgrading from the earlier Stripe-only v9 patch.
alter table public.app_access
  add column if not exists payment_provider text,
  add column if not exists payment_reference text;

create unique index if not exists app_access_payment_reference_unique
  on public.app_access(payment_provider, payment_reference)
  where payment_provider is not null and payment_reference is not null;

-- Existing app admins never pay. The row also makes their status obvious in the
-- admin UI, while has_app_access() still treats all app_admins as an override.
insert into public.app_access (user_id, access_type, granted_by)
select a.user_id, 'comped', a.user_id
from public.app_admins a
on conflict (user_id) do nothing;

alter table public.app_access enable row level security;

drop policy if exists "Users can read own access and admins can read all" on public.app_access;
create policy "Users can read own access and admins can read all"
  on public.app_access for select to authenticated
  using (user_id = auth.uid() or public.is_app_admin());

revoke all on public.app_access from anon, authenticated;
grant select on public.app_access to authenticated;

create or replace function public.has_app_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    exists (
      select 1 from public.app_admins a
      where a.user_id = auth.uid()
    )
    or exists (
      select 1 from public.app_access aa
      where aa.user_id = auth.uid()
        and aa.revoked_at is null
        and aa.access_type in ('paid', 'comped')
    )
  );
$$;

revoke all on function public.has_app_access() from public;
grant execute on function public.has_app_access() to authenticated;

-- -----------------------------------------------------------------------------
-- Make the paywall enforceable at the database layer, not just in React.
-- -----------------------------------------------------------------------------
create or replace function public.is_conversation_member(target_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_app_access() and exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = target_conversation
      and cm.user_id = auth.uid()
  );
$$;
revoke all on function public.is_conversation_member(uuid) from public;
grant execute on function public.is_conversation_member(uuid) to authenticated;

create or replace function public.is_conversation_admin(target_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_app_access() and exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = target_conversation
      and cm.user_id = auth.uid()
      and cm.role in ('owner', 'admin')
  );
$$;
revoke all on function public.is_conversation_admin(uuid) from public;
grant execute on function public.is_conversation_admin(uuid) to authenticated;

-- Unpaid users may read their own profile so the auth/paywall experience can
-- identify them, but cannot use profile search to browse the app.
drop policy if exists "Authenticated users can search profiles" on public.profiles;
create policy "Authenticated users can search profiles"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_app_access());

-- Membership state should not be writable until access is active.
drop policy if exists "Members can update their own membership" on public.conversation_members;
create policy "Members can update their own membership"
  on public.conversation_members for update to authenticated
  using (user_id = auth.uid() and public.has_app_access())
  with check (user_id = auth.uid() and public.has_app_access());

-- Sending already flows through can_send_to_conversation(), which calls the
-- access-aware is_conversation_member(). Recreate it explicitly for clarity.
drop policy if exists "Members can send messages as themselves" on public.messages;
create policy "Members can send messages as themselves"
  on public.messages for insert to authenticated
  with check (
    public.has_app_access()
    and sender_id = auth.uid()
    and public.can_send_to_conversation(conversation_id)
  );

-- Keep admin soft-delete behavior while ensuring ordinary senders are paid/comped.
drop policy if exists "Senders can update their own messages" on public.messages;
drop policy if exists "Senders and app admins can update messages" on public.messages;
create policy "Senders and app admins can update messages"
  on public.messages for update to authenticated
  using (
    public.is_app_admin()
    or (
      public.has_app_access()
      and sender_id = auth.uid()
      and public.is_conversation_member(conversation_id)
    )
  )
  with check (
    public.is_app_admin()
    or (
      public.has_app_access()
      and sender_id = auth.uid()
      and public.is_conversation_member(conversation_id)
    )
  );

-- -----------------------------------------------------------------------------
-- Security-definer RPCs that directly touch membership rows must also check the
-- paywall, because security-definer functions can bypass ordinary RLS.
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
  if v_current_user is null then raise exception 'Not authenticated'; end if;
  if not public.has_app_access() then raise exception 'Paid access required'; end if;
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
end;
$$;
revoke all on function public.start_dm(uuid) from public;
grant execute on function public.start_dm(uuid) to authenticated;

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
  if not public.has_app_access() then raise exception 'Paid access required'; end if;

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
  if v_current_user is null then raise exception 'Not authenticated'; end if;
  if not public.has_app_access() then raise exception 'Paid access required'; end if;

  if char_length(v_clean_name) < 1 or char_length(v_clean_name) > 60 then
    raise exception 'Group name must be 1-60 characters';
  end if;

  insert into public.conversations (kind, name, created_by)
  values ('group', v_clean_name, v_current_user)
  returning id into v_conversation;

  insert into public.conversation_members (conversation_id, user_id, role)
  values (v_conversation, v_current_user, 'owner');

  for v_member in select distinct unnest(coalesce(member_ids, array[]::uuid[]))
  loop
    if v_member <> v_current_user and exists (select 1 from public.profiles where id = v_member) then
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

-- Keep the v8 return type exactly the same to avoid PostgreSQL OUT-parameter
-- replacement errors.
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
  where public.has_app_access()
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
  where public.has_app_access()
    and m.deleted_at is null
    and (mine.cleared_at is null or m.created_at>mine.cleared_at)
    and char_length(trim(coalesce(search_text,'')))>=2
    and strpos(lower(coalesce(m.body,'')),lower(trim(search_text)))>0
  order by m.created_at desc
  limit least(greatest(coalesce(result_limit,50),1),100);
$$;
revoke all on function public.search_my_messages(text,integer) from public;
grant execute on function public.search_my_messages(text,integer) to authenticated;

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
  where p.id = target_user
    and (p.id = auth.uid() or public.has_app_access());
$$;
revoke all on function public.get_profile_card(uuid) from public;
grant execute on function public.get_profile_card(uuid) to authenticated;
