# Tiger Chat v10 — START HERE

1. Keep your existing `.env.local`.
2. Remove any old `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` lines if you are no longer using Stripe.
3. Add `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, and `PAYPAL_ENV`.
4. Run `supabase/v10_paypal_webhook_migration.sql` once.
5. Configure the PayPal webhook at `https://thefhsnews.com/api/billing/paypal/webhook`.
6. Listen for `PAYMENT.CAPTURE.COMPLETED` and `PAYMENT.CAPTURE.DENIED`.
7. Run `npm install` and `npm run build`.
8. Read `V10_SETUP.md`.

Do not run `fresh_install.sql` over the existing database.
