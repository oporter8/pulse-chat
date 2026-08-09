# Pulse Chat

A realtime direct-messaging app built with Next.js, TypeScript, React, and Supabase.

## What works

- Email/password signup and login
- Unique usernames
- Search for users
- Start or reopen 1-to-1 DMs
- Realtime incoming messages with Supabase Realtime
- Conversation list with latest-message previews
- Row Level Security so only conversation members can read messages
- Responsive desktop/mobile UI

## 1. Install Node.js

Use Node.js 22 or newer.

Check:

```bash
node -v
npm -v
```

## 2. Create a Supabase project

Create a project in the Supabase dashboard.

Then open:

**SQL Editor -> New query**

Paste the entire contents of:

```text
supabase/schema.sql
```

and run it.

## 3. Add environment variables

Copy:

```text
.env.example
```

to:

```text
.env.local
```

Fill in:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

Find these values in your Supabase project's API settings.

Do NOT commit `.env.local` to GitHub.

## 4. Install and run

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## 5. Test realtime chat

1. Create two different accounts.
2. Use two browsers or one normal window + one private window.
3. Sign into a different account in each.
4. Search for the other username.
5. Start a DM.
6. Send messages between the windows.

Messages should appear without refreshing.

## 6. Upload to GitHub

Unzip this project, open the project folder in VS Code, then:

```bash
git init
git add .
git commit -m "Initial realtime chat app"
git branch -M main
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

You can also create a GitHub repository and upload the unzipped files through GitHub's web interface.

## 7. Deploy

A common setup is:

**GitHub -> Vercel -> Supabase**

When deploying, add the same two environment variables to your hosting provider.

## Important security note

The browser receives only the Supabase public/publishable key. Database access is protected by the Row Level Security policies in `supabase/schema.sql`.

Never place a Supabase `service_role` or secret key in a `NEXT_PUBLIC_*` variable or commit it to GitHub.

## Next features to build

- Group chats
- Typing indicators
- Presence/online status
- Read receipts
- Image/file uploads
- Message editing/deleting UI
- Emoji reactions
- Profile pictures
## Realtime presence + typing update

This version adds:

- Online/offline indicators using Supabase Presence
- Typing indicators using Supabase Broadcast
- Private Realtime channels protected by RLS

After your original `schema.sql` has already been run, open:

```text
supabase/realtime.sql
```

Copy the entire file into **Supabase -> SQL Editor -> New query** and run it.

Then restart the local app:

```bash
npm run dev
```

Test with two accounts in two browser windows.

### Important

"Online" means the user currently has Pulse Chat open and connected. It is not a permanent last-seen system.


## Settings

The chat sidebar now includes a Settings menu with:

- Username changes
- System, dark, and light themes
- Account email display
- Sign out

Username changes use the existing `profiles` update RLS policy from `schema.sql`.

## Public deployment

See `DEPLOY.md` for the exact GitHub + Vercel deployment steps. No school-email restriction is built into Pulse Chat.
