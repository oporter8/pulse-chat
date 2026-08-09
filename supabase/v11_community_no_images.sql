-- Tiger Chat v11 — Community + Supporter feature pack (image-free)
-- Additive/idempotent migration for v8/v9/v10 installs.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Image-free profile + supporter preferences
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists supporter boolean not null default false,
  add column if not exists supporter_since timestamptz,
  add column if not exists supporter_label text not null default 'SUPPORTER',
  add column if not exists profile_emoji text not null default '🐯',
  add column if not exists favorite_song text not null default '',
  add column if not exists social_link text not null default '',
  add column if not exists accent_color text not null default 'tiger',
  add column if not exists profile_frame text not null default 'none',
  add column if not exists bubble_style text not null default 'rounded',
  add column if not exists chat_density text not null default 'comfortable',
  add column if not exists font_scale integer not null default 100,
  add column if not exists custom_reactions text[] not null default array['👍','❤️','😂','🔥','😮']::text[],
  add column if not exists dnd_until timestamptz,
  add column if not exists extras_visibility text not null default 'everyone';

alter table public.profiles drop constraint if exists profiles_supporter_label_length;
alter table public.profiles add constraint profiles_supporter_label_length check (char_length(supporter_label) between 1 and 16);
alter table public.profiles drop constraint if exists profiles_profile_emoji_length;
alter table public.profiles add constraint profiles_profile_emoji_length check (char_length(profile_emoji) between 1 and 16);
alter table public.profiles drop constraint if exists profiles_favorite_song_length;
alter table public.profiles add constraint profiles_favorite_song_length check (char_length(favorite_song) <= 80);
alter table public.profiles drop constraint if exists profiles_social_link_length;
alter table public.profiles add constraint profiles_social_link_length check (char_length(social_link) <= 160);
alter table public.profiles drop constraint if exists profiles_accent_color_check;
alter table public.profiles add constraint profiles_accent_color_check check (accent_color in ('tiger','orange','gold','blue','purple','green','mono','sunset'));
alter table public.profiles drop constraint if exists profiles_frame_check;
alter table public.profiles add constraint profiles_frame_check check (profile_frame in ('none','supporter','championship','winter','spring','night'));
alter table public.profiles drop constraint if exists profiles_bubble_style_check;
alter table public.profiles add constraint profiles_bubble_style_check check (bubble_style in ('rounded','compact','square','soft'));
alter table public.profiles drop constraint if exists profiles_density_check;
alter table public.profiles add constraint profiles_density_check check (chat_density in ('comfortable','compact','spacious'));
alter table public.profiles drop constraint if exists profiles_font_scale_check;
alter table public.profiles add constraint profiles_font_scale_check check (font_scale between 85 and 125);
alter table public.profiles drop constraint if exists profiles_extras_visibility_check;
alter table public.profiles add constraint profiles_extras_visibility_check check (extras_visibility in ('everyone','close_friends','nobody'));

-- No user-generated profile/group images.
update public.profiles set avatar_path = null where avatar_path is not null;
update public.conversations set avatar_path = null where avatar_path is not null;

alter table public.profiles drop constraint if exists profiles_no_images_v11;
alter table public.profiles add constraint profiles_no_images_v11 check (avatar_path is null);
alter table public.conversations drop constraint if exists conversations_no_images_v11;
alter table public.conversations add constraint conversations_no_images_v11 check (avatar_path is null);

-- Existing referenced visual attachments are removed from chat metadata.
do $$
begin
  if to_regclass('public.message_attachments') is not null then
    delete from public.message_attachments
    where coalesce(content_type, '') like 'image/%'
       or coalesce(content_type, '') like 'video/%';
  end if;
end $$;

-- Storage upload restrictions: disable avatars; keep only text/docs/audio attachments.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    update storage.buckets
    set public = false,
        allowed_mime_types = array['application/x-tiger-chat-images-disabled']::text[]
    where id = 'avatars';

    update storage.buckets
    set allowed_mime_types = array[
      'audio/webm','audio/ogg','audio/mpeg','audio/mp4','audio/wav','audio/x-wav',
      'text/plain','text/csv','application/json','application/pdf',
      'application/zip','application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ]::text[]
    where id = 'attachments';
  end if;
end $$;

-- Prevent future image/video attachment metadata even if a client is modified.
do $$
begin
  if to_regclass('public.message_attachments') is not null then
    alter table public.message_attachments drop constraint if exists message_attachments_no_visual_media_v11;
    alter table public.message_attachments add constraint message_attachments_no_visual_media_v11
      check (
        content_type is null
        or (content_type not like 'image/%' and content_type not like 'video/%')
      );
  end if;
end $$;

-- Users may update profiles generally in older migrations, so protect supporter state.
create or replace function public.v11_protect_supporter_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = old.id and not public.is_app_admin() then
    new.supporter := old.supporter;
    new.supporter_since := old.supporter_since;
    new.supporter_label := old.supporter_label;
  end if;

  if not new.supporter then
    new.profile_frame := 'none';
  end if;

  if array_length(new.custom_reactions, 1) is null then
    new.custom_reactions := array['👍','❤️','😂','🔥','😮']::text[];
  elsif new.supporter then
    new.custom_reactions := new.custom_reactions[1:8];
  else
    new.custom_reactions := new.custom_reactions[1:5];
  end if;

  new.avatar_path := null;
  return new;
end;
$$;

drop trigger if exists v11_profiles_protect_supporter on public.profiles;
create trigger v11_profiles_protect_supporter
before update on public.profiles
for each row execute procedure public.v11_protect_supporter_fields();

-- ---------------------------------------------------------------------------
-- Support campaigns + supporter management
-- ---------------------------------------------------------------------------
create table if not exists public.support_campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Keep Tiger Chat Online',
  description text not null default 'Voluntary support helps cover hosting and operating costs.',
  goal_cents integer not null default 2500 check (goal_cents >= 0),
  raised_cents integer not null default 0 check (raised_cents >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  amount_cents integer not null check (amount_cents > 0),
  note text not null default '',
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

insert into public.support_campaigns (title, description, goal_cents, raised_cents, active)
select 'Keep Tiger Chat Online', 'Voluntary support helps cover hosting, domains, and operating costs.', 2500, 0, true
where not exists (select 1 from public.support_campaigns where active);

alter table public.support_campaigns enable row level security;
alter table public.support_contributions enable row level security;

drop policy if exists "Anyone signed in can view active support campaigns" on public.support_campaigns;
create policy "Anyone can view active support campaigns" on public.support_campaigns
for select to anon, authenticated using (active or public.is_app_admin());

drop policy if exists "Admins manage support campaigns" on public.support_campaigns;
create policy "Admins manage support campaigns" on public.support_campaigns
for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());

drop policy if exists "Users can view own contributions" on public.support_contributions;
create policy "Users can view own contributions" on public.support_contributions
for select to authenticated using (user_id = auth.uid() or public.is_app_admin());

drop policy if exists "Admins manage contributions" on public.support_contributions;
create policy "Admins manage contributions" on public.support_contributions
for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());

grant select on public.support_campaigns to anon, authenticated;
grant select on public.support_contributions to authenticated;
grant insert, update, delete on public.support_campaigns to authenticated;
grant insert, update, delete on public.support_contributions to authenticated;

-- Supporter RPC is defined after achievement tables so the achievement grant is valid.

-- ---------------------------------------------------------------------------
-- Conversation customization, folders, drafts, favorites
-- ---------------------------------------------------------------------------
alter table public.conversations
  add column if not exists description text not null default '',
  add column if not exists emoji_icon text not null default '💬',
  add column if not exists supporter_only boolean not null default false;

alter table public.conversation_members
  add column if not exists nickname text,
  add column if not exists role_label text,
  add column if not exists role_color text,
  add column if not exists favorite boolean not null default false;

alter table public.conversations drop constraint if exists conversations_description_length_v11;
alter table public.conversations add constraint conversations_description_length_v11 check (char_length(description) <= 240);
alter table public.conversations drop constraint if exists conversations_emoji_icon_length_v11;
alter table public.conversations add constraint conversations_emoji_icon_length_v11 check (char_length(emoji_icon) between 1 and 16);
alter table public.conversation_members drop constraint if exists conversation_members_nickname_length_v11;
alter table public.conversation_members add constraint conversation_members_nickname_length_v11 check (nickname is null or char_length(nickname) <= 40);
alter table public.conversation_members drop constraint if exists conversation_members_role_label_length_v11;
alter table public.conversation_members add constraint conversation_members_role_label_length_v11 check (role_label is null or char_length(role_label) <= 24);

create table if not exists public.conversation_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  theme text not null default 'default',
  bubble_style text not null default 'inherit',
  density text not null default 'inherit',
  font_scale integer not null default 100,
  updated_at timestamptz not null default now(),
  primary key (user_id, conversation_id),
  constraint conversation_preferences_theme check (theme in ('default','tiger','night','school','mono','sunset')),
  constraint conversation_preferences_bubble check (bubble_style in ('inherit','rounded','compact','square','soft')),
  constraint conversation_preferences_density check (density in ('inherit','comfortable','compact','spacious')),
  constraint conversation_preferences_font check (font_scale between 85 and 125)
);

create table if not exists public.conversation_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  emoji text not null default '📁',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint conversation_folders_name_length check (char_length(name) between 1 and 32),
  constraint conversation_folders_emoji_length check (char_length(emoji) between 1 and 16)
);

create table if not exists public.conversation_folder_members (
  folder_id uuid not null references public.conversation_folders(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (folder_id, conversation_id)
);

create table if not exists public.user_drafts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  body text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, conversation_id),
  constraint user_drafts_body_length check (char_length(body) <= 2000)
);

create table if not exists public.scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  body text not null,
  send_at timestamptz not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint scheduled_messages_body_length check (char_length(body) between 1 and 2000),
  constraint scheduled_messages_status check (status in ('pending','sent','cancelled','failed'))
);

create table if not exists public.saved_message_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  emoji text not null default '⭐',
  created_at timestamptz not null default now(),
  constraint saved_message_collections_name_length check (char_length(name) between 1 and 40)
);

create table if not exists public.saved_message_collection_items (
  collection_id uuid not null references public.saved_message_collections(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (collection_id, message_id)
);

-- RLS for personal organizer tables.
alter table public.conversation_preferences enable row level security;
alter table public.conversation_folders enable row level security;
alter table public.conversation_folder_members enable row level security;
alter table public.user_drafts enable row level security;
alter table public.scheduled_messages enable row level security;
alter table public.saved_message_collections enable row level security;
alter table public.saved_message_collection_items enable row level security;

drop policy if exists "Users manage own conversation preferences" on public.conversation_preferences;
create policy "Users manage own conversation preferences" on public.conversation_preferences for all to authenticated
using (user_id = auth.uid() and public.is_conversation_member(conversation_id))
with check (user_id = auth.uid() and public.is_conversation_member(conversation_id));

drop policy if exists "Users manage own folders" on public.conversation_folders;
create policy "Users manage own folders" on public.conversation_folders for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Users manage own folder membership" on public.conversation_folder_members;
create policy "Users manage own folder membership" on public.conversation_folder_members for all to authenticated
using (user_id = auth.uid() and public.is_conversation_member(conversation_id))
with check (
  user_id = auth.uid()
  and public.is_conversation_member(conversation_id)
  and exists (select 1 from public.conversation_folders f where f.id = folder_id and f.user_id = auth.uid())
);

drop policy if exists "Users manage own drafts" on public.user_drafts;
create policy "Users manage own drafts" on public.user_drafts for all to authenticated
using (user_id = auth.uid() and public.is_conversation_member(conversation_id))
with check (user_id = auth.uid() and public.is_conversation_member(conversation_id));

drop policy if exists "Users manage own scheduled messages" on public.scheduled_messages;
create policy "Users manage own scheduled messages" on public.scheduled_messages for all to authenticated
using (user_id = auth.uid() and public.is_conversation_member(conversation_id))
with check (user_id = auth.uid() and public.is_conversation_member(conversation_id));

drop policy if exists "Users manage own saved collections" on public.saved_message_collections;
create policy "Users manage own saved collections" on public.saved_message_collections for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Users manage own saved collection items" on public.saved_message_collection_items;
create policy "Users manage own saved collection items" on public.saved_message_collection_items for all to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and exists (select 1 from public.saved_message_collections c where c.id = collection_id and c.user_id = auth.uid())
  and exists (select 1 from public.saved_messages s where s.user_id = auth.uid() and s.message_id = saved_message_collection_items.message_id)
);

grant select, insert, update, delete on public.conversation_preferences to authenticated;
grant select, insert, update, delete on public.conversation_folders to authenticated;
grant select, insert, update, delete on public.conversation_folder_members to authenticated;
grant select, insert, update, delete on public.user_drafts to authenticated;
grant select, insert, update, delete on public.scheduled_messages to authenticated;
grant select, insert, update, delete on public.saved_message_collections to authenticated;
grant select, insert, update, delete on public.saved_message_collection_items to authenticated;

-- ---------------------------------------------------------------------------
-- Polls, events, invites and pin board
-- ---------------------------------------------------------------------------
create table if not exists public.chat_polls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  question text not null,
  multi_select boolean not null default false,
  closes_at timestamptz,
  created_at timestamptz not null default now(),
  constraint chat_polls_question_length check (char_length(question) between 1 and 180)
);

create table if not exists public.chat_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.chat_polls(id) on delete cascade,
  label text not null,
  position integer not null default 0,
  constraint chat_poll_options_label_length check (char_length(label) between 1 and 100)
);

create table if not exists public.chat_poll_votes (
  poll_id uuid not null references public.chat_polls(id) on delete cascade,
  option_id uuid not null references public.chat_poll_options(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_id, option_id, user_id)
);

create table if not exists public.group_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  details text not null default '',
  starts_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint group_events_title_length check (char_length(title) between 1 and 100),
  constraint group_events_details_length check (char_length(details) <= 500)
);

create table if not exists public.group_invites (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(12), 'hex'),
  expires_at timestamptz,
  max_uses integer,
  use_count integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint group_invites_max_uses check (max_uses is null or max_uses between 1 and 1000)
);

create table if not exists public.pinned_messages_v11 (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  pinned_by uuid not null references public.profiles(id) on delete cascade,
  pinned_at timestamptz not null default now(),
  primary key (conversation_id, message_id)
);

alter table public.chat_polls enable row level security;
alter table public.chat_poll_options enable row level security;
alter table public.chat_poll_votes enable row level security;
alter table public.group_events enable row level security;
alter table public.group_invites enable row level security;
alter table public.pinned_messages_v11 enable row level security;

drop policy if exists "Members read polls" on public.chat_polls;
create policy "Members read polls" on public.chat_polls for select to authenticated using (public.is_conversation_member(conversation_id));
drop policy if exists "Members create polls" on public.chat_polls;
create policy "Members create polls" on public.chat_polls for insert to authenticated with check (creator_id = auth.uid() and public.is_conversation_member(conversation_id));
drop policy if exists "Creators manage polls" on public.chat_polls;
create policy "Creators manage polls" on public.chat_polls for update to authenticated using (creator_id = auth.uid() or public.is_conversation_admin(conversation_id)) with check (creator_id = auth.uid() or public.is_conversation_admin(conversation_id));
drop policy if exists "Creators delete polls" on public.chat_polls;
create policy "Creators delete polls" on public.chat_polls for delete to authenticated using (creator_id = auth.uid() or public.is_conversation_admin(conversation_id));

drop policy if exists "Members read poll options" on public.chat_poll_options;
create policy "Members read poll options" on public.chat_poll_options for select to authenticated using (exists (select 1 from public.chat_polls p where p.id = poll_id and public.is_conversation_member(p.conversation_id)));
drop policy if exists "Poll creators manage options" on public.chat_poll_options;
create policy "Poll creators manage options" on public.chat_poll_options for all to authenticated
using (exists (select 1 from public.chat_polls p where p.id = poll_id and (p.creator_id = auth.uid() or public.is_conversation_admin(p.conversation_id))))
with check (exists (select 1 from public.chat_polls p where p.id = poll_id and (p.creator_id = auth.uid() or public.is_conversation_admin(p.conversation_id))));

drop policy if exists "Members read poll votes" on public.chat_poll_votes;
create policy "Members read poll votes" on public.chat_poll_votes for select to authenticated using (exists (select 1 from public.chat_polls p where p.id = poll_id and public.is_conversation_member(p.conversation_id)));
drop policy if exists "Members vote" on public.chat_poll_votes;
create policy "Members vote" on public.chat_poll_votes for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.chat_polls p where p.id = poll_id and public.is_conversation_member(p.conversation_id) and (p.closes_at is null or p.closes_at > now())));
drop policy if exists "Users remove own vote" on public.chat_poll_votes;
create policy "Users remove own vote" on public.chat_poll_votes for delete to authenticated using (user_id = auth.uid());

drop policy if exists "Members read events" on public.group_events;
create policy "Members read events" on public.group_events for select to authenticated using (public.is_conversation_member(conversation_id));
drop policy if exists "Members create events" on public.group_events;
create policy "Members create events" on public.group_events for insert to authenticated with check (creator_id = auth.uid() and public.is_conversation_member(conversation_id));
drop policy if exists "Creators manage events" on public.group_events;
create policy "Creators manage events" on public.group_events for all to authenticated using (creator_id = auth.uid() or public.is_conversation_admin(conversation_id)) with check (creator_id = auth.uid() or public.is_conversation_admin(conversation_id));

drop policy if exists "Members read invites" on public.group_invites;
create policy "Members read invites" on public.group_invites for select to authenticated using (public.is_conversation_member(conversation_id));
drop policy if exists "Admins manage invites" on public.group_invites;
create policy "Admins manage invites" on public.group_invites for all to authenticated using (public.is_conversation_admin(conversation_id)) with check (public.is_conversation_admin(conversation_id) and created_by = auth.uid());

drop policy if exists "Members read pin board" on public.pinned_messages_v11;
create policy "Members read pin board" on public.pinned_messages_v11 for select to authenticated using (public.is_conversation_member(conversation_id));
drop policy if exists "Admins manage pin board" on public.pinned_messages_v11;
create policy "Admins manage pin board" on public.pinned_messages_v11 for all to authenticated using (public.is_conversation_admin(conversation_id)) with check (public.is_conversation_admin(conversation_id) and pinned_by = auth.uid());

grant select, insert, update, delete on public.chat_polls, public.chat_poll_options, public.chat_poll_votes, public.group_events, public.group_invites, public.pinned_messages_v11 to authenticated;

create or replace function public.use_group_invite(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_row public.group_invites%rowtype;
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  select * into invite_row from public.group_invites
  where token = invite_token and active = true
    and (expires_at is null or expires_at > now())
    and (max_uses is null or use_count < max_uses)
  for update;
  if invite_row.id is null then raise exception 'Invite is invalid or expired'; end if;

  insert into public.conversation_members(conversation_id, user_id, role)
  values (invite_row.conversation_id, v_user, 'member')
  on conflict (conversation_id, user_id) do nothing;

  update public.group_invites set use_count = use_count + 1 where id = invite_row.id;
  return invite_row.conversation_id;
end;
$$;
revoke all on function public.use_group_invite(text) from public;
grant execute on function public.use_group_invite(text) to authenticated;

create or replace function public.update_group_details(target_conversation uuid, new_description text, new_emoji text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_conversation_admin(target_conversation) then raise exception 'Group admin access required'; end if;
  update public.conversations
  set description = left(coalesce(new_description,''), 240),
      emoji_icon = left(coalesce(nullif(trim(new_emoji),''),'💬'), 16),
      updated_at = now()
  where id = target_conversation and kind = 'group';
end;
$$;
revoke all on function public.update_group_details(uuid, text, text) from public;
grant execute on function public.update_group_details(uuid, text, text) to authenticated;

create or replace function public.set_my_group_nickname(target_conversation uuid, new_nickname text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversation_members
  set nickname = nullif(left(trim(coalesce(new_nickname,'')),40),'')
  where conversation_id = target_conversation and user_id = auth.uid();
  if not found then raise exception 'Not a member'; end if;
end;
$$;
revoke all on function public.set_my_group_nickname(uuid, text) from public;
grant execute on function public.set_my_group_nickname(uuid, text) to authenticated;

create or replace function public.set_group_role_style(target_conversation uuid, target_user uuid, new_label text, new_color text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_conversation_admin(target_conversation) then raise exception 'Group admin access required'; end if;
  update public.conversation_members
  set role_label = nullif(left(trim(coalesce(new_label,'')),24),''),
      role_color = nullif(left(trim(coalesce(new_color,'')),24),'')
  where conversation_id = target_conversation and user_id = target_user;
end;
$$;
revoke all on function public.set_group_role_style(uuid, uuid, text, text) from public;
grant execute on function public.set_group_role_style(uuid, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Close friends + 24-hour text notes/stories
-- ---------------------------------------------------------------------------
create table if not exists public.close_friends (
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  constraint close_friends_not_self check (user_id <> friend_id)
);

create table if not exists public.text_stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  emoji text not null default '🐯',
  audience text not null default 'everyone',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  constraint text_stories_body_length check (char_length(body) between 1 and 280),
  constraint text_stories_emoji_length check (char_length(emoji) between 1 and 16),
  constraint text_stories_audience check (audience in ('everyone','close_friends'))
);

alter table public.close_friends enable row level security;
alter table public.text_stories enable row level security;

create or replace function public.is_close_friend_of_v11(owner_user uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(select 1 from public.close_friends cf where cf.user_id = owner_user and cf.friend_id = auth.uid());
$$;
revoke all on function public.is_close_friend_of_v11(uuid) from public;
grant execute on function public.is_close_friend_of_v11(uuid) to authenticated;

drop policy if exists "Users manage close friends" on public.close_friends;
create policy "Users manage close friends" on public.close_friends for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Users read visible text stories" on public.text_stories;
create policy "Users read visible text stories" on public.text_stories for select to authenticated
using (
  expires_at > now()
  and (
    user_id = auth.uid()
    or audience = 'everyone'
    or public.is_close_friend_of_v11(text_stories.user_id)
  )
);

drop policy if exists "Users manage own text stories" on public.text_stories;
create policy "Users manage own text stories" on public.text_stories for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.close_friends, public.text_stories to authenticated;

-- ---------------------------------------------------------------------------
-- Achievements + optional DM streaks
-- ---------------------------------------------------------------------------
create table if not exists public.achievement_catalog (
  key text primary key,
  title text not null,
  description text not null,
  emoji text not null default '🏆'
);

create table if not exists public.user_achievements (
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_key text not null references public.achievement_catalog(key) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, achievement_key)
);

insert into public.achievement_catalog(key,title,description,emoji) values
  ('first_message','First Roar','Sent your first Tiger Chat message.','🐯'),
  ('chatter_100','Century','Sent 100 messages.','💯'),
  ('chatter_500','Hallway Legend','Sent 500 messages.','🏆'),
  ('supporter','Supporter','Helped support Tiger Chat.','⭐'),
  ('pollster','Poll Starter','Created a community poll.','📊'),
  ('planner','Planner','Created a group event.','📅')
on conflict (key) do update set title=excluded.title, description=excluded.description, emoji=excluded.emoji;

create table if not exists public.dm_streaks (
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  current_streak integer not null default 1,
  best_streak integer not null default 1,
  last_active_date date not null default current_date,
  updated_at timestamptz not null default now(),
  primary key (user_a, user_b),
  constraint dm_streaks_order check (user_a::text < user_b::text)
);

alter table public.achievement_catalog enable row level security;
alter table public.user_achievements enable row level security;
alter table public.dm_streaks enable row level security;

drop policy if exists "Authenticated read achievement catalog" on public.achievement_catalog;
create policy "Authenticated read achievement catalog" on public.achievement_catalog for select to authenticated using (true);
drop policy if exists "Users read own achievements" on public.user_achievements;
create policy "Users read own achievements" on public.user_achievements for select to authenticated using (user_id = auth.uid() or public.is_app_admin());
drop policy if exists "DM participants read streaks" on public.dm_streaks;
create policy "DM participants read streaks" on public.dm_streaks for select to authenticated using (auth.uid() = user_a or auth.uid() = user_b);

grant select on public.achievement_catalog, public.user_achievements, public.dm_streaks to authenticated;

create or replace function public.v11_after_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  message_count bigint;
  conv_kind text;
  other_id uuid;
  a uuid;
  b uuid;
  old_date date;
  old_streak integer;
begin
  select count(*) into message_count from public.messages where sender_id = new.sender_id and deleted_at is null;
  if message_count >= 1 then
    insert into public.user_achievements(user_id, achievement_key) values (new.sender_id,'first_message') on conflict do nothing;
  end if;
  if message_count >= 100 then
    insert into public.user_achievements(user_id, achievement_key) values (new.sender_id,'chatter_100') on conflict do nothing;
  end if;
  if message_count >= 500 then
    insert into public.user_achievements(user_id, achievement_key) values (new.sender_id,'chatter_500') on conflict do nothing;
  end if;

  select kind into conv_kind from public.conversations where id = new.conversation_id;
  if conv_kind = 'dm' then
    select cm.user_id into other_id from public.conversation_members cm
    where cm.conversation_id = new.conversation_id and cm.user_id <> new.sender_id limit 1;
    if other_id is not null then
      if new.sender_id::text < other_id::text then a := new.sender_id; b := other_id; else a := other_id; b := new.sender_id; end if;
      select last_active_date, current_streak into old_date, old_streak from public.dm_streaks where user_a=a and user_b=b;
      if not found then
        insert into public.dm_streaks(user_a,user_b,current_streak,best_streak,last_active_date) values(a,b,1,1,current_date);
      elsif old_date < current_date then
        update public.dm_streaks
        set current_streak = case when old_date = current_date - 1 then old_streak + 1 else 1 end,
            best_streak = greatest(best_streak, case when old_date = current_date - 1 then old_streak + 1 else 1 end),
            last_active_date = current_date,
            updated_at = now()
        where user_a=a and user_b=b;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists v11_messages_after_insert on public.messages;
create trigger v11_messages_after_insert after insert on public.messages
for each row execute procedure public.v11_after_message();

create or replace function public.v11_after_poll()
returns trigger language plpgsql security definer set search_path=public as $$
begin insert into public.user_achievements(user_id,achievement_key) values(new.creator_id,'pollster') on conflict do nothing; return new; end; $$;
drop trigger if exists v11_poll_achievement on public.chat_polls;
create trigger v11_poll_achievement after insert on public.chat_polls for each row execute procedure public.v11_after_poll();

create or replace function public.v11_after_event()
returns trigger language plpgsql security definer set search_path=public as $$
begin insert into public.user_achievements(user_id,achievement_key) values(new.creator_id,'planner') on conflict do nothing; return new; end; $$;
drop trigger if exists v11_event_achievement on public.group_events;
create trigger v11_event_achievement after insert on public.group_events for each row execute procedure public.v11_after_event();

-- Recreate supporter RPC now that user_achievements exists.
create or replace function public.set_supporter(target_user uuid, enabled boolean, label text default 'SUPPORTER')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_app_admin() then raise exception 'Admin access required'; end if;
  update public.profiles
  set supporter = enabled,
      supporter_since = case when enabled then coalesce(supporter_since, now()) else null end,
      supporter_label = left(coalesce(nullif(trim(label), ''), 'SUPPORTER'), 16),
      profile_frame = case when enabled then case when profile_frame = 'none' then 'supporter' else profile_frame end else 'none' end
  where id = target_user;
  if enabled then
    insert into public.user_achievements(user_id, achievement_key) values (target_user, 'supporter') on conflict do nothing;
  else
    delete from public.conversation_members cm
    using public.conversations c
    where cm.conversation_id = c.id and c.supporter_only = true and cm.user_id = target_user;
  end if;
end;
$$;
revoke all on function public.set_supporter(uuid, boolean, text) from public;
grant execute on function public.set_supporter(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Supporter Lounge
-- ---------------------------------------------------------------------------
create or replace function public.v11_supporter_membership_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  supporter_group boolean;
begin
  select supporter_only into supporter_group from public.conversations where id = new.conversation_id;
  if supporter_group and not exists (
    select 1 from public.profiles p where p.id = new.user_id and p.supporter
  ) and not exists (
    select 1 from public.app_admins a where a.user_id = new.user_id
  ) then
    raise exception 'Supporter access required';
  end if;
  return new;
end;
$$;

drop trigger if exists v11_supporter_membership_guard on public.conversation_members;
create trigger v11_supporter_membership_guard before insert or update on public.conversation_members
for each row execute procedure public.v11_supporter_membership_guard();

create or replace function public.join_supporter_lounge()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  lounge_id uuid;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.profiles p where p.id=v_user and p.supporter)
     and not exists (select 1 from public.app_admins a where a.user_id=v_user) then
    raise exception 'Supporter access required';
  end if;

  select id into lounge_id from public.conversations
  where supporter_only = true and kind='group' and name='Supporter Lounge'
  order by created_at asc limit 1;

  if lounge_id is null then
    insert into public.conversations(kind,name,description,emoji_icon,created_by,supporter_only,updated_at)
    values('group','Supporter Lounge','Private text-only lounge for Tiger Chat supporters.','⭐',v_user,true,now())
    returning id into lounge_id;
  end if;

  insert into public.conversation_members(conversation_id,user_id,role)
  values(lounge_id,v_user,'member')
  on conflict (conversation_id,user_id) do nothing;

  return lounge_id;
end;
$$;
revoke all on function public.join_supporter_lounge() from public;
grant execute on function public.join_supporter_lounge() to authenticated;

-- ---------------------------------------------------------------------------
-- Safe helper RPCs for scheduled sends + supporter admin search
-- ---------------------------------------------------------------------------
create or replace function public.send_due_scheduled_messages()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  row_item public.scheduled_messages%rowtype;
  sent_count integer := 0;
begin
  for row_item in
    select * from public.scheduled_messages
    where user_id = auth.uid() and status='pending' and send_at <= now()
    order by send_at asc
    for update skip locked
  loop
    begin
      if public.is_conversation_member(row_item.conversation_id) then
        insert into public.messages(conversation_id,sender_id,body)
        values(row_item.conversation_id,auth.uid(),row_item.body);
        update public.scheduled_messages set status='sent',sent_at=now() where id=row_item.id;
        sent_count := sent_count + 1;
      else
        update public.scheduled_messages set status='failed' where id=row_item.id;
      end if;
    exception when others then
      update public.scheduled_messages set status='failed' where id=row_item.id;
    end;
  end loop;
  return sent_count;
end;
$$;
revoke all on function public.send_due_scheduled_messages() from public;
grant execute on function public.send_due_scheduled_messages() to authenticated;

create or replace function public.search_supporter_admin(query_text text)
returns table(id uuid, username text, display_name text, supporter boolean, supporter_since timestamptz, supporter_label text)
language sql
stable
security definer
set search_path=public
as $$
  select p.id,p.username,p.display_name,p.supporter,p.supporter_since,p.supporter_label
  from public.profiles p
  where public.is_app_admin()
    and (p.username ilike '%'||coalesce(query_text,'')||'%' or p.display_name ilike '%'||coalesce(query_text,'')||'%')
  order by p.supporter desc,p.username asc
  limit 30;
$$;
revoke all on function public.search_supporter_admin(text) from public;
grant execute on function public.search_supporter_admin(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime for community features (safe to rerun)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['chat_polls','chat_poll_votes','group_events','text_stories','support_campaigns'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename=t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Clean up a label accidentally used by some SQL clients; harmless if absent.
-- v11 complete.

-- ---------------------------------------------------------------------------
-- v11 helper RPC addendum
-- ---------------------------------------------------------------------------
create or replace function public.set_conversation_favorite_v11(target_conversation uuid, enabled boolean)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.conversation_members
  set favorite = enabled
  where conversation_id = target_conversation and user_id = auth.uid();
  if not found then raise exception 'Not a member'; end if;
end;
$$;
revoke all on function public.set_conversation_favorite_v11(uuid, boolean) from public;
grant execute on function public.set_conversation_favorite_v11(uuid, boolean) to authenticated;

create or replace function public.can_view_profile_extras_v11(target_user uuid)
returns boolean
language plpgsql
stable
security definer
set search_path=public
as $$
declare visibility text;
begin
  if auth.uid() is null then return false; end if;
  if auth.uid() = target_user then return true; end if;
  select extras_visibility into visibility from public.profiles where id = target_user;
  if visibility = 'everyone' then return true; end if;
  if visibility = 'nobody' then return false; end if;
  return exists(select 1 from public.close_friends cf where cf.user_id = target_user and cf.friend_id = auth.uid());
end;
$$;
revoke all on function public.can_view_profile_extras_v11(uuid) from public;
grant execute on function public.can_view_profile_extras_v11(uuid) to authenticated;
