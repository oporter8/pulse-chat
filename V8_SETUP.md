# Pulse Chat v8 — Setup

Pulse v8 is the full everyday-messenger polish release. It keeps the existing v7 admin/owner features and adds the normal messaging features without adding Discord-style channels or servers.

## Upgrade an existing v7 database

1. Back up your current `.env.local`.
2. Replace the app files with this v8 project.
3. In Supabase Dashboard → SQL Editor, run **only**:

   `supabase/v8_migration.sql`

   Run it once after v7. It preserves existing accounts, conversations, messages, attachments, reports, and admin data.
4. If Realtime Presence/typing is not already authorized, run `supabase/realtime.sql` too.
5. In Terminal from the project folder:

   ```bash
   npm install
   npm run build
   ```

6. Test locally if desired with `npm run dev`.
7. Commit/push after the production build succeeds.

## Fresh Supabase project only

For a completely new database, run `supabase/fresh_install.sql` instead of running each migration separately.

Do **not** run `fresh_install.sql` over the existing Pulse database.

## Environment variables

v8 adds no new environment-variable names beyond v7. Keep these in `.env.local` locally and in Vercel Environment Variables for deployed builds:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SECRET_KEY=...
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:...
```

`SUPABASE_SECRET_KEY` and `VAPID_PRIVATE_KEY` are server-only. Never prefix them with `NEXT_PUBLIC_` and never commit real values.

If you still need VAPID keys:

```bash
npm run generate:vapid
```

After changing Vercel environment variables, redeploy so the new server functions receive them.

## Authentication URLs

When `thefhsnews.com` is the production domain, set Supabase Authentication → URL Configuration to use:

- Site URL: `https://thefhsnews.com`
- Redirect URL: `https://thefhsnews.com/**`

You can also keep the previous Vercel URL and `http://localhost:3000/**` as allowed redirect URLs while testing.

## What v8 adds

- Sent / Delivered / Read message state
- Privacy-aware last seen / active now
- Pin and archive conversations
- Clear chat history locally
- Delete a conversation for yourself
- Forward messages and attachments
- Copy messages
- Save/star messages
- Tap timestamps for exact date/time
- Existing typing dots retained
- Profile cards from names/avatars
- Shared photos/files viewer
- Full-screen image viewer with zoom, keyboard navigation, and mobile swipe
- Attachment downloads
- Reply previews, including replies to older unloaded messages
- Message edit history
- Unsend for everyone
- 1 hour / 8 hour / indefinite mute
- Foreground notification sound choices
- Browser/PWA push notifications and app badging
- Persistent per-chat drafts
- Recent reaction shortcuts
- Search inside a conversation
- Photo/file search filters
- Change email/password
- Delete account
- Profile-picture center crop/zoom
- Username availability checks
- QR/profile links
- Optional message requests
- Block confirmation and blocked-user management
- Report confirmation and report-history status
- Signed-in-device management and security activity
- New-device login alerts
- 30-day stale-device enforcement plus remote device removal
- Offline/reconnecting indicator
- Optimistic message sending with retry
- Loading skeletons and better empty states
- Mobile swipe-to-reply and image swipe
- Haptic feedback where supported
- PWA install prompt plus iPhone/iPad install guidance
- Home-screen/app unread badge where supported
- Existing v7 owner badge, moderation, suspensions, reports, and admin delete retained

## Deploy

After `npm run build` succeeds:

```bash
git add .
git commit -m "Upgrade Pulse Chat to v8"
git push origin main
```

Vercel can then redeploy from `main`.
