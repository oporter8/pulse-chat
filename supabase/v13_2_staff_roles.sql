-- Tiger Chat v13.2 — staff roles, community badges, and moderation hierarchy
-- Run once after v13/v13.1 migrations.

alter table public.profiles
  add column if not exists staff_role text,
  add column if not exists community_roles text[] not null default '{}'::text[];

alter table public.profiles drop constraint if exists profiles_staff_role_check;
alter table public.profiles add constraint profiles_staff_role_check
  check (staff_role is null or staff_role in ('owner','admin','moderator'));

alter table public.profiles drop constraint if exists profiles_community_roles_check;
alter table public.profiles add constraint profiles_community_roles_check
  check (community_roles <@ array['beta_tester','developer','helper','contributor','event_team','verified']::text[]);

-- Migrate existing legacy app_admins into the new hierarchy.
update public.profiles p
set staff_role = coalesce(p.staff_role, 'admin')
where exists (select 1 from public.app_admins a where a.user_id = p.id);

-- Promote exactly one existing admin to Owner. Prefer the account already using an OWNER tag,
-- otherwise the oldest existing app admin. Existing explicit owners are preserved.
do $$
declare
  owner_exists boolean;
  owner_candidate uuid;
begin
  select exists(select 1 from public.profiles where staff_role='owner') into owner_exists;
  if not owner_exists then
    select p.id into owner_candidate
    from public.profiles p
    join public.app_admins a on a.user_id=p.id
    order by case when upper(coalesce(p.admin_tag,''))='OWNER' then 0 else 1 end, p.created_at asc
    limit 1;
    if owner_candidate is not null then
      update public.profiles set staff_role='owner' where id=owner_candidate;
    end if;
  end if;
end $$;

create or replace function public.my_staff_role()
returns text
language sql
stable
security definer
set search_path=public
as $$
  select p.staff_role from public.profiles p where p.id=auth.uid();
$$;
revoke all on function public.my_staff_role() from public;
grant execute on function public.my_staff_role() to authenticated;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid() and p.staff_role in ('owner','admin','moderator'));
$$;
revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to authenticated;

create or replace function public.is_app_owner()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid() and p.staff_role='owner');
$$;
revoke all on function public.is_app_owner() from public;
grant execute on function public.is_app_owner() to authenticated;

-- Only the owner can edit the legacy owner badge directly.
create or replace function public.set_my_admin_tag(new_tag text)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_tag text := trim(new_tag);
begin
  if not public.is_app_owner() then raise exception 'Owner access required'; end if;
  if v_tag !~ '^[A-Za-z0-9 _-]{1,16}$' then
    raise exception 'Tag must be 1-16 characters using letters, numbers, spaces, _ or -';
  end if;
  update public.profiles set admin_tag=v_tag where id=auth.uid();
end;
$$;
revoke all on function public.set_my_admin_tag(text) from public;
grant execute on function public.set_my_admin_tag(text) to authenticated;

-- Prevent normal authenticated clients from granting themselves protected status.
create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.role() <> 'service_role' then
    if new.staff_role is distinct from old.staff_role
       or new.community_roles is distinct from old.community_roles
       or new.supporter is distinct from old.supporter
       or new.supporter_since is distinct from old.supporter_since
       or new.supporter_label is distinct from old.supporter_label then
      raise exception 'Privileged profile fields can only be changed by Tiger Chat staff services';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_privileged_fields on public.profiles;
create trigger protect_profile_privileged_fields
before update on public.profiles
for each row execute function public.protect_profile_privileged_fields();

-- Add staff/community badges to safe public profile cards.
drop function if exists public.get_profile_card(uuid);
create function public.get_profile_card(target_user uuid)
returns table (
  id uuid,
  username text,
  display_name text,
  bio text,
  avatar_path text,
  admin_tag text,
  status_text text,
  last_active_at timestamptz,
  created_at timestamptz,
  staff_role text,
  community_roles text[]
)
language sql
stable
security definer
set search_path=public
as $$
  select p.id,p.username,p.display_name,p.bio,p.avatar_path,p.admin_tag,p.status_text,
         case when p.id=auth.uid() or p.show_online_status then p.last_active_at else null end,
         p.created_at,p.staff_role,p.community_roles
  from public.profiles p
  where p.id=target_user;
$$;
revoke all on function public.get_profile_card(uuid) from public;
grant execute on function public.get_profile_card(uuid) to authenticated;

-- Add badge fields to group/member rendering.
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
  last_active_at timestamptz,
  profile_staff_role text,
  profile_community_roles text[]
)
language sql
stable
security definer
set search_path=public
as $$
  select cm.conversation_id,cm.user_id,cm.role,cm.joined_at,
         case when cm.user_id=auth.uid() or p.show_read_receipts then cm.last_read_at else null end,
         case when cm.user_id=auth.uid() then cm.muted_until else null end,
         p.id,p.username,p.display_name,p.bio,p.avatar_path,p.created_at,p.admin_tag,p.status_text,
         case when cm.user_id=auth.uid() or p.show_online_status then p.last_active_at else null end,
         p.staff_role,p.community_roles
  from public.conversation_members cm
  join public.profiles p on p.id=cm.user_id
  where cm.conversation_id=target_conversation and public.is_conversation_member(target_conversation)
  order by cm.joined_at;
$$;
revoke all on function public.get_conversation_members(uuid) from public;
grant execute on function public.get_conversation_members(uuid) to authenticated;
