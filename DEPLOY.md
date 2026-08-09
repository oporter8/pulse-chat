# Deploy Pulse Chat v6

1. Run `supabase/v6_migration.sql` on an existing v5 database.
2. Run `supabase/realtime.sql`.
3. Run `npm install`.
4. Run `npm run generate:vapid` and configure the VAPID/server environment variables from `V6_SETUP.md`.
5. Make sure Supabase Auth allows `/reset-password` on your production URL.
6. Run `npm run build` locally.
7. Commit and push to `main` only after the build succeeds.
8. In Vercel, confirm Production has all variables from `.env.example`.

The real `.env.local`, server secret key, and VAPID private key must never be committed.
