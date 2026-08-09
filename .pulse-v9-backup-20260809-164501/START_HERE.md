# Pulse Chat v8 — START HERE

This is the full replacement project.

## Existing Pulse v7 install

1. Save your current `.env.local` somewhere safe.
2. Replace the project files with this folder.
3. Put `.env.local` back in the project root.
4. Run `supabase/v8_migration.sql` once in the Supabase SQL Editor.
5. Run:

   ```bash
   npm install
   npm run build
   ```

6. If the build passes, commit and push:

   ```bash
   git add .
   git commit -m "Upgrade Pulse Chat to v8"
   git push origin main
   ```

Do not run `supabase/fresh_install.sql` on your existing database.

Read `V8_SETUP.md` for the full feature list, environment variables, and deployment notes.
