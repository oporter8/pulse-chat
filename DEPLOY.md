# Deploy Pulse Chat v8

1. Save your current `.env.local` before replacing the project.
2. Existing v7 database: run `supabase/v8_migration.sql` once in Supabase SQL Editor.
3. Keep the Vercel variables listed in `.env.example` configured for Production (and Preview if you use it).
4. Run:

   ```bash
   npm install
   npm run build
   ```

5. Confirm Supabase Auth URL Configuration includes your production domain and `/reset-password` redirects.
6. Commit and push only after the production build succeeds:

   ```bash
   git add .
   git commit -m "Upgrade Pulse Chat to v8"
   git push origin main
   ```

7. Verify Vercel redeploys and then test: login, a DM, push notifications, message search, and Settings → Security.

Never commit `.env.local`, `SUPABASE_SECRET_KEY`, or `VAPID_PRIVATE_KEY`.
