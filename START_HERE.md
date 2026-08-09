# Pulse Chat v6 — START HERE

This is the complete replacement project.

## 1. Preserve your current environment file

Before replacing your existing files, keep a copy of `.env.local`. Real credentials are intentionally not included here.

## 2. Upgrade the database

Because your existing Pulse database is already on v5, run this in Supabase SQL Editor:

`supabase/v6_migration.sql`

Then run:

`supabase/realtime.sql`

Do not run `fresh_install.sql` on the existing database.

## 3. Install and configure push

```bash
npm install
npm run generate:vapid
```

Add the generated VAPID values plus `SUPABASE_SECRET_KEY` to `.env.local` and Vercel. See `V6_SETUP.md` for the exact variable names and security notes.

## 4. Build before deploying

```bash
npm run build
```

Only after the build succeeds:

```bash
git add .
git commit -m "Upgrade Pulse Chat to v6"
git push origin main
```

## v6 highlights

- Password reset email + reset-password screen
- Real background Web Push notifications
- Per-device notification enrollment
- Global notification and preview preferences
- Per-chat mute
- Global conversation/message search with jump-to-message
- New-DM privacy controls
- Read-receipt privacy without breaking unread counts
- Online-status privacy
- Push replay protection and stale-subscription cleanup
- All previous v5 messaging/group/moderation/PWA/device-responsive features
