# Pulse Chat v5 upgrade

This upgrade is designed to be applied on top of the existing Pulse Chat project and Supabase database. It **does not delete existing accounts, DMs, or messages**.

## What v5 adds

- Display names, bios, and profile pictures
- Public avatar storage with per-user upload policies
- Private file/image attachments (6 MB max) with signed URLs
- Group chats with owners/admins, group names, group pictures, add/remove/leave member controls
- Replies
- Message edit + soft delete
- Emoji reactions
- Read receipts and unread counts
- Online presence + typing indicators
- Block/unblock
- User/message reporting
- Optional moderator panel through `app_admins`
- Server-side anti-spam message rate limits
- 50-message pagination instead of loading the entire history
- Responsive phone/tablet/laptop/desktop UI
- iPhone/Android safe-area support
- Installable PWA manifest, icons, and service worker
- Light/dark/system themes

## 1. Replace the v5 files

If using the patch ZIP, copy its contents into the root of your existing project and allow it to replace matching files. **Do not delete `.env.local`.**

## 2. Run the database migration

In Supabase Dashboard -> SQL Editor, open:

`supabase/v5_migration.sql`

Copy the entire file and run it once.

The migration is additive. It upgrades the existing schema, creates the new feature tables, creates Storage buckets/policies, updates the signup trigger, and enables Realtime for the new tables.

## 3. Run Realtime authorization SQL

In Supabase SQL Editor, run:

`supabase/realtime.sql`

This is the known-working authenticated private-channel policy used for Presence and typing. Persistent chat records and private attachments are still protected by their own Row Level Security policies.

## 4. Verify environment variables

Your existing `.env.local` should remain unchanged and contain:

```text
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

Vercel should have the same two variables enabled for Production, Preview, and Development.

## 5. Build locally

```bash
npm install
npm run build
```

Do not push until `npm run build` completes successfully.

## 6. Push and deploy

```bash
git add .
git commit -m "Upgrade Pulse Chat to v5"
git push origin main
```

Vercel should automatically deploy the new commit.

## 7. Test the production URL

Use two different accounts/devices and verify:

- signup/login
- user search + DM
- online/offline presence
- typing indicator
- profile picture + display name + bio
- create a group and add/remove members
- reply/edit/delete/reactions
- read receipts
- upload an image and a normal file
- block/unblock
- report a user/message
- phone navigation and back button
- add Pulse to a phone home screen

## Optional: make an account a moderator

Copy that account's UUID from Supabase -> Authentication -> Users, then run:

```sql
insert into public.app_admins (user_id)
values ('YOUR-USER-UUID')
on conflict do nothing;
```

That account will then see a **Moderation** tab inside Settings and can resolve/dismiss reports.

## Notes

- Attachments use a private `attachments` bucket and one-hour signed download URLs.
- Avatars use a public `avatars` bucket because profile pictures are intended to be visible to other users.
- The app limits normal browser uploads to 6 MB. Supabase recommends standard uploads for small files; larger-file support should use resumable uploads instead.
- Message history loads 50 messages at a time.
- Message deletion is a soft delete so realtime updates and replies stay stable.
- The service worker caches same-origin app-shell pages/assets only. Supabase API calls and private attachment URLs are not cached by it.
