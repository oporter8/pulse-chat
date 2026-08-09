# Tiger Chat v9 — START HERE

The v9 paywall patch is installed in this project.

1. Keep your existing `.env.local`.
2. Add the Cash App Stripe keys plus `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, and `PAYPAL_ENV` locally and in Vercel.
3. Run `supabase/v9_migration.sql` once in Supabase SQL Editor.
4. Configure the Stripe webhook for Cash App at `https://thefhsnews.com/api/billing/webhook`; PayPal/Venmo use server-side capture routes.
5. Run `npm install` and `npm run build`.
6. Read `V9_SETUP.md` for testing and admin free-access controls.

Do not run `fresh_install.sql` over the existing database.
