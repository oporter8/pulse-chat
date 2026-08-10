-- Tiger Chat v14 — professional appearance modes
-- Run this file in Supabase Dashboard -> SQL Editor.

create table if not exists public.user_appearance_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  mode text not null default 'bright',
  updated_at timestamptz not null default now(),
  constraint user_appearance_settings_mode_check check (mode in ('bright','green','blue'))
);

alter table public.user_appearance_settings enable row level security;

drop policy if exists "Users can read their appearance" on public.user_appearance_settings;
create policy "Users can read their appearance"
  on public.user_appearance_settings for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can create their appearance" on public.user_appearance_settings;
create policy "Users can create their appearance"
  on public.user_appearance_settings for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can update their appearance" on public.user_appearance_settings;
create policy "Users can update their appearance"
  on public.user_appearance_settings for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update on public.user_appearance_settings to authenticated;

-- Give existing users the new professional Bright mode by default.
insert into public.user_appearance_settings (user_id, mode)
select p.id, 'bright'
from public.profiles p
on conflict (user_id) do nothing;

create or replace function public.tiger_v14_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'version', '14',
    'appearance_modes', jsonb_build_array('bright','green','blue'),
    'professional_ui', true
  );
$$;

revoke all on function public.tiger_v14_status() from public;
grant execute on function public.tiger_v14_status() to authenticated;
