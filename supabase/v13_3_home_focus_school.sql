-- Tiger Chat v13.3 — Home dashboard, Focus Mode, School Schedule, Beta Labs
-- Requires v13.2.

create table if not exists public.dashboard_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  widget_order text[] not null default array['focus','school','messages','quick','beta']::text[],
  hidden_widgets text[] not null default '{}'::text[],
  updated_at timestamptz not null default now(),
  constraint dashboard_widget_order_check check (widget_order <@ array['messages','school','focus','quick','beta']::text[]),
  constraint dashboard_hidden_widgets_check check (hidden_widgets <@ array['messages','school','focus','quick','beta']::text[])
);

create table if not exists public.focus_sessions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  active_until timestamptz,
  mode text not null default 'favorites',
  allowed_conversation_ids uuid[] not null default '{}'::uuid[],
  hide_non_priority boolean not null default true,
  mute_notifications boolean not null default true,
  label text not null default 'Focus',
  updated_at timestamptz not null default now(),
  constraint focus_mode_check check (mode in ('favorites','selected','mute_only')),
  constraint focus_label_length check (char_length(label) between 1 and 32)
);

create table if not exists public.school_schedule_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default true,
  schedule_name text not null default 'School',
  anchor_date date not null default current_date,
  anchor_day text not null default 'A',
  cycle_days text[] not null default array['A','B']::text[],
  skip_weekends boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint school_schedule_name_length check (char_length(schedule_name) between 1 and 40),
  constraint school_anchor_day_check check (anchor_day in ('A','B')),
  constraint school_cycle_days_check check (cycle_days = array['A','B']::text[])
);

create table if not exists public.school_schedule_classes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  cycle_day text not null,
  period_label text not null default '',
  class_name text not null,
  start_time time,
  end_time time,
  room text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint school_class_cycle_check check (cycle_day in ('A','B')),
  constraint school_class_name_length check (char_length(class_name) between 1 and 80),
  constraint school_class_period_length check (char_length(period_label) <= 24),
  constraint school_class_room_length check (char_length(room) <= 40)
);
create index if not exists school_schedule_classes_user_day_idx on public.school_schedule_classes(user_id,cycle_day,position);

create table if not exists public.school_schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  exception_date date not null,
  kind text not null default 'no_school',
  forced_day text,
  note text not null default '',
  created_at timestamptz not null default now(),
  unique(user_id, exception_date),
  constraint school_exception_kind_check check (kind in ('no_school','force_day')),
  constraint school_exception_forced_day_check check ((kind='no_school' and forced_day is null) or (kind='force_day' and forced_day in ('A','B'))),
  constraint school_exception_note_length check (char_length(note) <= 80)
);

create table if not exists public.user_beta_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enabled_features text[] not null default '{}'::text[],
  updated_at timestamptz not null default now(),
  constraint beta_feature_keys_check check (enabled_features <@ array['compact_home','focus_nav_status','schedule_countdown']::text[])
);

create or replace function public.is_beta_eligible()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1 from public.profiles p
    where p.id=auth.uid()
      and (
        p.staff_role in ('owner','admin')
        or 'beta_tester'=any(coalesce(p.community_roles,'{}'::text[]))
      )
  );
$$;
revoke all on function public.is_beta_eligible() from public;
grant execute on function public.is_beta_eligible() to authenticated;

alter table public.dashboard_preferences enable row level security;
alter table public.focus_sessions enable row level security;
alter table public.school_schedule_settings enable row level security;
alter table public.school_schedule_classes enable row level security;
alter table public.school_schedule_exceptions enable row level security;
alter table public.user_beta_preferences enable row level security;

drop policy if exists "Users manage own dashboard preferences" on public.dashboard_preferences;
create policy "Users manage own dashboard preferences" on public.dashboard_preferences for all to authenticated
  using (user_id=auth.uid()) with check (user_id=auth.uid());

drop policy if exists "Users manage own focus session" on public.focus_sessions;
create policy "Users manage own focus session" on public.focus_sessions for all to authenticated
  using (user_id=auth.uid()) with check (user_id=auth.uid());

drop policy if exists "Users manage own school settings" on public.school_schedule_settings;
create policy "Users manage own school settings" on public.school_schedule_settings for all to authenticated
  using (user_id=auth.uid()) with check (user_id=auth.uid());

drop policy if exists "Users manage own school classes" on public.school_schedule_classes;
create policy "Users manage own school classes" on public.school_schedule_classes for all to authenticated
  using (user_id=auth.uid()) with check (user_id=auth.uid());

drop policy if exists "Users manage own school exceptions" on public.school_schedule_exceptions;
create policy "Users manage own school exceptions" on public.school_schedule_exceptions for all to authenticated
  using (user_id=auth.uid()) with check (user_id=auth.uid());

drop policy if exists "Beta users manage own lab preferences" on public.user_beta_preferences;
create policy "Beta users manage own lab preferences" on public.user_beta_preferences for all to authenticated
  using (user_id=auth.uid() and public.is_beta_eligible())
  with check (user_id=auth.uid() and public.is_beta_eligible());

grant select,insert,update,delete on public.dashboard_preferences to authenticated;
grant select,insert,update,delete on public.focus_sessions to authenticated;
grant select,insert,update,delete on public.school_schedule_settings to authenticated;
grant select,insert,update,delete on public.school_schedule_classes to authenticated;
grant select,insert,update,delete on public.school_schedule_exceptions to authenticated;
grant select,insert,update,delete on public.user_beta_preferences to authenticated;

create or replace function public.tiger_v13_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'version', 13.3,
    'legal_acceptance', exists(select 1 from information_schema.tables where table_schema='public' and table_name='legal_acceptances'),
    'themes', exists(select 1 from information_schema.tables where table_schema='public' and table_name='user_themes'),
    'v11_ready', exists(select 1 from information_schema.tables where table_schema='public' and table_name='chat_polls'),
    'dashboard', exists(select 1 from information_schema.tables where table_schema='public' and table_name='dashboard_preferences'),
    'focus', exists(select 1 from information_schema.tables where table_schema='public' and table_name='focus_sessions'),
    'school_schedule', exists(select 1 from information_schema.tables where table_schema='public' and table_name='school_schedule_settings'),
    'beta_labs', exists(select 1 from information_schema.tables where table_schema='public' and table_name='user_beta_preferences')
  );
$$;
revoke all on function public.tiger_v13_status() from public;
grant execute on function public.tiger_v13_status() to authenticated;
