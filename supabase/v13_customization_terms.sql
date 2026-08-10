-- Tiger Chat v13: Theme Studio + versioned Terms/Privacy acceptance
-- Run AFTER v11_community_no_images.sql. Safe to re-run.

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Versioned legal acceptance
-- -----------------------------------------------------------------------------
create table if not exists public.legal_acceptances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tos_version text not null,
  privacy_version text not null,
  accepted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.legal_acceptances enable row level security;

drop policy if exists "Users can read own legal acceptance" on public.legal_acceptances;
create policy "Users can read own legal acceptance" on public.legal_acceptances for select to authenticated using (user_id = auth.uid());
drop policy if exists "Users can insert own legal acceptance" on public.legal_acceptances;
create policy "Users can insert own legal acceptance" on public.legal_acceptances for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "Users can update own legal acceptance" on public.legal_acceptances;
create policy "Users can update own legal acceptance" on public.legal_acceptances for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update on public.legal_acceptances to authenticated;

create or replace function public.v13_record_signup_legal_acceptance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tos text := trim(coalesce(new.raw_user_meta_data ->> 'tos_version', ''));
  v_privacy text := trim(coalesce(new.raw_user_meta_data ->> 'privacy_version', ''));
  v_accepted_at timestamptz;
begin
  if v_tos = '' or v_privacy = '' then return new; end if;
  begin
    v_accepted_at := coalesce((new.raw_user_meta_data ->> 'legal_accepted_at')::timestamptz, now());
  exception when others then
    v_accepted_at := now();
  end;
  insert into public.legal_acceptances (user_id, tos_version, privacy_version, accepted_at, updated_at)
  values (new.id, v_tos, v_privacy, v_accepted_at, now())
  on conflict (user_id) do update set tos_version = excluded.tos_version, privacy_version = excluded.privacy_version, accepted_at = excluded.accepted_at, updated_at = now();
  return new;
end;
$$;

drop trigger if exists tiger_v13_signup_legal_acceptance on auth.users;
create trigger tiger_v13_signup_legal_acceptance after insert on auth.users for each row execute function public.v13_record_signup_legal_acceptance();

-- -----------------------------------------------------------------------------
-- Per-user saved themes. Config is validated again by the client before applying.
-- -----------------------------------------------------------------------------
create table if not exists public.user_themes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  preset text not null default 'custom',
  config jsonb not null default '{}'::jsonb,
  custom_css text not null default '',
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_themes_name_length_v13 check (char_length(name) between 1 and 40),
  constraint user_themes_preset_length_v13 check (char_length(preset) between 1 and 32),
  constraint user_themes_css_length_v13 check (char_length(custom_css) <= 12000)
);

create unique index if not exists user_themes_one_active_v13 on public.user_themes(user_id) where is_active;
create index if not exists user_themes_user_updated_v13 on public.user_themes(user_id, updated_at desc);

alter table public.user_themes enable row level security;
drop policy if exists "Users can read own themes" on public.user_themes;
create policy "Users can read own themes" on public.user_themes for select to authenticated using (user_id = auth.uid());
drop policy if exists "Users can create own themes" on public.user_themes;
create policy "Users can create own themes" on public.user_themes for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "Users can update own themes" on public.user_themes;
create policy "Users can update own themes" on public.user_themes for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Users can delete own themes" on public.user_themes;
create policy "Users can delete own themes" on public.user_themes for delete to authenticated using (user_id = auth.uid());
grant select, insert, update, delete on public.user_themes to authenticated;

create or replace function public.activate_user_theme_v13(target_theme uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.user_themes where id = target_theme and user_id = v_user) then raise exception 'Theme not found'; end if;
  update public.user_themes set is_active = false, updated_at = now() where user_id = v_user and is_active;
  update public.user_themes set is_active = true, updated_at = now() where id = target_theme and user_id = v_user;
end;
$$;
revoke all on function public.activate_user_theme_v13(uuid) from public;
grant execute on function public.activate_user_theme_v13(uuid) to authenticated;

-- Defensive server-side filter for custom CSS. The client performs stricter validation.
create or replace function public.v13_theme_css_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare v text := lower(coalesce(new.custom_css, ''));
begin
  if char_length(new.custom_css) > 12000 then raise exception 'Custom CSS is too large'; end if;
  if v like '%@import%' or v like '%url(%' or v like '%javascript:%' or v like '%expression(%' or v like '%behavior:%' or v like '%-moz-binding%' then
    raise exception 'Remote assets and executable CSS are not allowed';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists tiger_v13_theme_css_guard on public.user_themes;
create trigger tiger_v13_theme_css_guard before insert or update on public.user_themes for each row execute function public.v13_theme_css_guard();

-- -----------------------------------------------------------------------------
-- Diagnostics helper used by the client to distinguish installed vs missing v13.
-- -----------------------------------------------------------------------------
create or replace function public.tiger_v13_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'version', 13,
    'legal_acceptance', exists(select 1 from information_schema.tables where table_schema='public' and table_name='legal_acceptances'),
    'themes', exists(select 1 from information_schema.tables where table_schema='public' and table_name='user_themes'),
    'v11_ready', exists(select 1 from information_schema.tables where table_schema='public' and table_name='chat_polls')
  );
$$;
revoke all on function public.tiger_v13_status() from public;
grant execute on function public.tiger_v13_status() to authenticated;
