# Pulse Chat v3 update

This update fixes Realtime authentication for private Presence/Broadcast channels and prevents typing events from sending before the conversation channel is subscribed.

## 1. Keep your existing .env.local

Do not overwrite your working `.env.local`.

## 2. Update Supabase Realtime policies

Open `supabase/realtime.sql`, copy all of it, and run it in Supabase -> SQL Editor.

## 3. Install and restart

```bash
npm install
rm -rf .next
npm run dev
```

Then sign in again in both test browser windows.
