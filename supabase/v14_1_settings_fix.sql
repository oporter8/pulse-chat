-- Tiger Chat v14.1 — durable Settings persistence fix
-- Safe to run after v14. This restores the intended user-owned profile/preferences
-- permissions and adds dedicated RPCs so Settings does not depend on fragile
-- column-level grants in future releases.

-- Keep the profile table locked down: authenticated users may only update fields
-- that belong to their own normal profile/preferences. Staff/supporter fields are
-- intentionally excluded.
revoke update on public.profiles from authenticated;
grant update (
  username,
  display_name,
  bio,
  avatar_path,
  status_text,
  dm_privacy,
  show_read_receipts,
  show_online_status,
  notifications_enabled,
  notification_preview,
  notification_sound
) on public.profiles to authenticated;
grant select on public.profiles to authenticated;

create or replace function public.save_my_profile_v14_1(
  p_username text,
  p_display_name text,
  p_bio text,
  p_status_text text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text := lower(trim(coalesce(p_username, '')));
  v_display_name text := trim(coalesce(p_display_name, ''));
  v_bio text := trim(coalesce(p_bio, ''));
  v_status text := trim(coalesce(p_status_text, ''));
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if v_username !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'Username must be 3-20 characters using letters, numbers, or underscores';
  end if;
  if char_length(v_display_name) < 1 or char_length(v_display_name) > 40 then
    raise exception 'Display name must be 1-40 characters';
  end if;
  if char_length(v_bio) > 160 then
    raise exception 'Bio must be 160 characters or fewer';
  end if;
  if char_length(v_status) > 60 then
    raise exception 'Status must be 60 characters or fewer';
  end if;

  update public.profiles
  set username = v_username,
      display_name = v_display_name,
      bio = v_bio,
      status_text = v_status,
      avatar_path = null
  where id = auth.uid();

  if not found then
    raise exception 'Profile not found';
  end if;
end;
$$;

revoke all on function public.save_my_profile_v14_1(text,text,text,text) from public;
grant execute on function public.save_my_profile_v14_1(text,text,text,text) to authenticated;

create or replace function public.save_my_preferences_v14_1(
  p_dm_privacy text,
  p_show_read_receipts boolean,
  p_show_online_status boolean,
  p_notifications_enabled boolean,
  p_notification_preview boolean,
  p_notification_sound text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_read_receipts boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_dm_privacy not in ('everyone','requests','mutual_groups','nobody') then
    raise exception 'Invalid direct-message privacy setting';
  end if;

  if p_notification_sound not in ('default','soft','pop','none') then
    raise exception 'Invalid notification sound';
  end if;

  select show_read_receipts
  into v_old_read_receipts
  from public.profiles
  where id = auth.uid();

  if v_old_read_receipts is null then
    raise exception 'Profile not found';
  end if;

  update public.profiles
  set dm_privacy = p_dm_privacy,
      show_read_receipts = coalesce(p_show_read_receipts, true),
      show_online_status = coalesce(p_show_online_status, true),
      notifications_enabled = coalesce(p_notifications_enabled, true),
      notification_preview = coalesce(p_notification_preview, true),
      notification_sound = coalesce(p_notification_sound, 'default')
  where id = auth.uid();

  -- When read receipts are switched off, clear prior read timestamps for this user
  -- as Tiger Chat already intended to do in the client. Doing it here makes the
  -- change atomic and independent of browser-side table grants/RLS drift.
  if v_old_read_receipts and not coalesce(p_show_read_receipts, true) then
    update public.conversation_members
      set last_read_at = null
      where user_id = auth.uid();

    update public.message_receipts
      set read_at = null
      where user_id = auth.uid();
  end if;
end;
$$;

revoke all on function public.save_my_preferences_v14_1(text,boolean,boolean,boolean,boolean,text) from public;
grant execute on function public.save_my_preferences_v14_1(text,boolean,boolean,boolean,boolean,text) to authenticated;
