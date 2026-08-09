# Pulse Chat v8

Pulse Chat is a private realtime messaging app built with Next.js and Supabase. v8 focuses on everyday messenger features: DMs/groups, delivery/read states, profiles, push notifications, saved/forwarded messages, chat search/media, privacy controls, message requests, PWA support, session security, and moderation.

## Start

For an existing v7 project, read `START_HERE.md` and `V8_SETUP.md`.

```bash
npm install
npm run build
npm run dev
```

The app requires Supabase public browser credentials plus server-only Supabase/VAPID values for account administration, account deletion, Web Push, and login alerts. See `.env.example`.

## Database

- Existing v7 database: run `supabase/v8_migration.sql` once.
- Brand-new database: run `supabase/fresh_install.sql`.

Do not run the fresh-install script over an existing production database.
