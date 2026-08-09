# Pulse Chat

Pulse Chat is a responsive realtime messaging app built with Next.js, React, TypeScript, and Supabase.

## v5 features

Pulse supports direct messages, group chats, profiles/avatars/bios, online presence, typing indicators, replies, edit/delete, reactions, read receipts, private file/image attachments, blocking, reporting, moderator review, themes, pagination, and installable PWA behavior.

The UI is designed for phones, tablets, laptops, and desktop monitors. On narrow screens Pulse switches to a single-pane conversation flow with a native-style back button instead of shrinking the desktop sidebar.

## Stack

- Next.js 16
- React 19
- TypeScript
- Supabase Auth
- Supabase Postgres + RLS
- Supabase Realtime
- Supabase Storage
- Vercel

## Local development

Create `.env.local` beside `package.json`:

```text
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Then:

```bash
npm install
npm run dev
```

## Existing project upgrade

Read `V5_SETUP.md` and run `supabase/v5_migration.sql` before using the v5 UI.

## Production

Vercel should have the two `NEXT_PUBLIC_SUPABASE_*` variables configured. Supabase Auth's Site URL should point at the production Vercel domain and that domain should be included in Redirect URLs.

## Security model

- Persistent conversations/messages are protected by table RLS.
- Private attachments are protected by Storage RLS and served through signed URLs.
- Users can only update their own profile and reactions.
- Group membership management is performed through security-definer RPCs and requires group owner/admin privileges.
- DMs stop accepting new messages when either side blocks the other.
- Reports are visible to the reporter and accounts in `app_admins`.
- A database trigger enforces basic anti-spam message rate limits.

Never expose a Supabase service-role/secret key in browser code or a `NEXT_PUBLIC_*` variable.
