# Tiger Chat v10 — PayPal + Venmo webhook paywall

## What changed

- Stripe/Cash App code is removed from the Tiger Chat paywall.
- The $3 one-time paywall uses PayPal Checkout.
- Eligible US users can get a standalone Venmo button through the PayPal JavaScript SDK.
- A verified PayPal webhook grants access even if the buyer closes the browser after paying.
- Existing admin/free-access overrides continue to work.

## 1. Database

Run `supabase/v10_paypal_webhook_migration.sql` once after the existing v9 migration.

## 2. Environment variables

Add locally and in Vercel:

```env
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_WEBHOOK_ID=...
PAYPAL_ENV=sandbox
```

Keep your existing Supabase and VAPID variables.

`PAYPAL_ENV=live` should only be used with live PayPal credentials and the live webhook ID.

## 3. PayPal webhook

In the PayPal Developer Dashboard, open the REST app that owns your sandbox credentials and add this webhook URL:

`https://thefhsnews.com/api/billing/paypal/webhook`

Subscribe to:

- `PAYMENT.CAPTURE.COMPLETED`
- `PAYMENT.CAPTURE.DENIED`

Copy the webhook ID into `PAYPAL_WEBHOOK_ID`.

## 4. Build

```bash
npm install
npm run build
```

## 5. Test

Use PayPal sandbox buyer accounts. The webhook verifies the PayPal signature and checks the linked Tiger Chat order, user, currency, amount, and capture before access is granted.

## 6. Admin free access

Settings → Moderation → User Management → search account → Grant free access.
