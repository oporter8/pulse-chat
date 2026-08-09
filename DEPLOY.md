# Deploy Pulse Chat v5

## Existing Pulse project

1. Apply the v5 project files.
2. Run `supabase/v5_migration.sql` in Supabase SQL Editor.
3. Run `supabase/realtime.sql` in Supabase SQL Editor.
4. Keep your existing `.env.local`.
5. Run `npm install` and `npm run build` locally.
6. Push to `main`; Vercel will redeploy automatically.

## New Supabase project

Run `supabase/fresh_install.sql`, then `supabase/realtime.sql`.

## Vercel variables

Configure these in Production, Preview, and Development:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Never add a secret/service-role key to a `NEXT_PUBLIC_*` variable.

## Supabase Auth URL configuration

Set the Site URL to your production Vercel URL and add both production and local development redirect patterns, for example:

```text
https://your-project.vercel.app/**
http://localhost:3000/**
```

See `V5_SETUP.md` for the complete test checklist.
