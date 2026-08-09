# Pulse Chat v5 — FULL REPLACEMENT

This folder is meant to replace the contents of your current Pulse Chat project.

## IMPORTANT FIRST
Before replacing your old project, copy your existing `.env.local` somewhere safe.
This ZIP intentionally does NOT contain your real Supabase credentials.

After replacing the project files, put your `.env.local` back in the project root.

It must contain:

NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key

## EXISTING SUPABASE PROJECT
Because you already have Pulse Chat accounts/messages, use ONLY:

`supabase/v5_migration.sql`

Run the entire file in Supabase Dashboard -> SQL Editor.

The migration included here already drops the old `get_my_conversations()` function
before recreating it with the v5 return type.

Then run:

`supabase/realtime.sql`

DO NOT run `supabase/fresh_install.sql` on your existing database.
That file is only for a brand-new Supabase project.

## LOCAL INSTALL / TEST

From Terminal inside this folder:

```bash
npm install
npm run build
```

Do not deploy until `npm run build` succeeds.

Then test locally if you want:

```bash
npm run dev
```

## GITHUB / VERCEL

If this folder is replacing your existing Git-tracked project, keep the existing
`.git` directory when replacing files.

Then:

```bash
git add .
git commit -m "Upgrade Pulse Chat to v5"
git push origin main
```

Vercel should redeploy automatically.

## INCLUDED V5 FEATURES

- Responsive phone / tablet / laptop / desktop chat layout
- PWA / home-screen support
- Profile avatars
- Display names and bios
- Direct messages
- Group chats
- Group member management
- Typing status
- Online presence
- Replies
- Edit and delete messages
- Emoji reactions
- Read receipts / unread state
- Image and file attachments
- Blocking
- Reporting
- Moderator/report tooling
- Expanded settings
- Light / dark / system themes
- Supabase RLS / storage / realtime migration

## FILES THAT SHOULD EXIST

- app/page.tsx
- app/chat/page.tsx
- app/layout.tsx
- app/globals.css
- app/manifest.ts
- app/pwa-register.tsx
- components/chat/*
- lib/supabase.ts
- lib/chat-types.ts
- lib/chat-utils.ts
- public/sw.js
- public/icons/*
- supabase/v5_migration.sql
- supabase/realtime.sql
- supabase/fresh_install.sql
- package.json
- tsconfig.json
