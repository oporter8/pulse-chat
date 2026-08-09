# Tiger Chat v9.1 wallet-only paywall setup

## What this does

Tiger Chat requires a one-time $3 payment unless the user is an app admin or you grant them free access. The visible payment choices are Cash App Pay, PayPal, and Venmo.

## 1. Database

Run `supabase/v9_migration.sql` once in Supabase SQL Editor. It is written to be compatible with the earlier v9 access table and adds generic wallet payment-provider/reference fields.

## 2. Cash App Pay

Cash App Pay uses Stripe, but the Checkout Session is explicitly restricted to `cashapp`; Tiger Chat does not offer direct card entry. Add these server-only variables locally and in Vercel:

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Enable Cash App Pay in the Stripe Dashboard. Point the Stripe webhook to:

`https://thefhsnews.com/api/billing/webhook`

Listen for `checkout.session.completed` and `checkout.session.async_payment_succeeded`.

## 3. PayPal + Venmo

Create/use a PayPal Business developer app under the adult/guardian-managed merchant account required by the provider. Add:

```env
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_ENV=sandbox
```

Use `PAYPAL_ENV=live` only after sandbox testing succeeds and the merchant account is approved for live payments. The PayPal JavaScript SDK renders separate PayPal and Venmo buttons. Direct card, PayPal Credit, and Pay Later buttons are disabled.

## 4. Build

```bash
npm install
npm run build
```

## 5. Admin free access

Settings → Moderation → User Management → search account → Grant free access.

## 6. Go live

Replace test/sandbox credentials with the live credentials from the merchant accounts and redeploy Vercel. Do not put payment secrets in `NEXT_PUBLIC_` variables.
