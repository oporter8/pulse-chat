# Pulse Chat v7 — Owner/Admin upgrade

The account with email `owensporter@icloud.com` becomes the Pulse app owner/admin.

## Features
- Server-authorized admin status via `app_admins`
- Default `OWNER` badge
- Editable 1–16 character admin tag
- Badge beside admin messages and group member names
- Existing report review tools
- User search by username, display name, or email
- 24-hour, 7-day, or long-term bans
- Unban controls
- Admin delete for any message

## Existing database
Run `supabase/v7_migration.sql` after v6.

No new environment variables are required beyond v6. The admin API uses the same
`SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY` already used by Web Push.

## Build
```bash
npm install
npm run build
```

Then commit/push to GitHub and let Vercel redeploy.

Future signup: if that email does not exist yet, the upgraded signup trigger automatically assigns OWNER/admin when it registers.
