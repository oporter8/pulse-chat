# Pulse Chat v6 setup

Pulse v6 adds password recovery, full chat/message search, privacy controls, per-chat mute, and real Web Push notifications.

## Existing Pulse v5 project

1. Keep your existing `.env.local` safe.
2. Replace the project files with this v6 project.
3. In Supabase SQL Editor, run **only** `supabase/v6_migration.sql` for the database upgrade.
4. Run `supabase/realtime.sql` again. It is safe to re-run.
5. Run `npm install`.
6. Generate VAPID keys with `npm run generate:vapid`.
7. Add the server environment variables described below to `.env.local` and Vercel.
8. Confirm Supabase Authentication redirect URLs allow your production reset-password URL.
9. Run `npm run build` locally.
10. Push to GitHub after the build succeeds. Vercel will deploy from `main`.

Do **not** run `supabase/fresh_install.sql` on your current database. That file is for a brand-new Supabase project only.

## Environment variables

Keep the two variables you already have:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
```

Add these **server-only** values:

```env
SUPABASE_SECRET_KEY=your_server_secret_key
VAPID_PUBLIC_KEY=generated_public_key
VAPID_PRIVATE_KEY=generated_private_key
VAPID_SUBJECT=mailto:your-email@example.com
```

Never prefix the server secret or VAPID private key with `NEXT_PUBLIC_`, never place real secrets in GitHub, and never send them to browser code.

### Generate the VAPID pair

```bash
npm run generate:vapid
```

Copy the generated values into `.env.local` and into Vercel → Project → Settings → Environment Variables. Use an email address you control for `VAPID_SUBJECT`.

### Supabase service-role secret

Copy a Supabase server secret key (`sb_secret_…`) from Project Settings → API Keys into `SUPABASE_SECRET_KEY`. If your project only has legacy keys, the server route also accepts `SUPABASE_SERVICE_ROLE_KEY` as a fallback. It is used only inside `app/api/push/send/route.ts` to read private push subscriptions after the sender's real access token has been validated.

## Password reset redirect

For the production site, allow:

```text
https://pulse-chat-lac.vercel.app/reset-password
```

Your existing wildcard `https://pulse-chat-lac.vercel.app/**` also covers it.

For local development, allow:

```text
http://localhost:3000/reset-password
```

## Web Push behavior

- Push permission is requested only when the user clicks **Enable on this device**.
- Each browser/device stores its own subscription.
- Global notifications and message previews are controlled in Settings.
- Individual conversations can be muted from Conversation details.
- Push is suppressed while a Pulse window is actively focused; realtime UI updates still arrive.
- Signing out removes the current device's subscription so the previous account does not keep receiving notifications.
- Invalid browser subscriptions are automatically removed after a 404/410 push response.
- A server-only dispatch ledger prevents repeatedly replaying a push for the same message.

## Search

Use the search icon or `Cmd+K` / `Ctrl+K` to search:

- conversation names
- recent conversation previews
- message text across conversations you are allowed to read

Selecting an old message loads context around it and highlights the result.

## Privacy controls

Settings → Privacy includes:

- Who can create a new DM: everyone / shared-group members / nobody
- Read receipts on/off
- Online presence on/off
- Blocked-user management

Unread counts continue working even with read receipts disabled because v6 stores a private `last_seen_at` separately from the visible read-receipt timestamp.
