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
