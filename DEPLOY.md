# Deploy Pulse Chat publicly with Vercel

This turns the local Next.js app into a public HTTPS website while continuing to use the same Supabase project.

## Before deploying

Make sure your local project contains `.env.local` with:

```env
NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_PROJECT_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

Do not commit `.env.local`. It is already ignored by `.gitignore`.

## Option A: GitHub + Vercel dashboard

1. Push the project to a GitHub repository.
2. Sign in to Vercel and choose **Add New -> Project**.
3. Import the GitHub repository.
4. Vercel should detect **Next.js** automatically.
5. In the project's Environment Variables, add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
6. Deploy.
7. Vercel will give you a public URL similar to:

```text
https://pulse-chat-yourname.vercel.app
```

## Option B: Vercel CLI

From the project folder:

```bash
npm install -g vercel
vercel login
vercel
```

Follow the prompts. Add the two Supabase environment variables in the Vercel project settings, then redeploy:

```bash
vercel --prod
```

## Supabase Auth production URL

After Vercel gives you the final production URL:

1. Open your Supabase project.
2. Go to **Authentication -> URL Configuration**.
3. Set **Site URL** to your production URL.
4. Add these Redirect URLs:

```text
http://localhost:3000/**
https://YOUR-VERCEL-DOMAIN.vercel.app/**
```

Keep localhost while you are still developing locally.

## Signup access

Pulse does not restrict accounts to a school email domain. Anyone who can reach the public site may create an account using the email/password signup form, subject to your Supabase Auth settings.

## Before sharing widely

For a small MVP, the current setup is fine. Before promoting it to hundreds of users, add:

- Block and report controls
- Rate limits / anti-spam controls
- Moderation tools
- Paginated message history
- Abuse monitoring
- Tighter Realtime topic authorization
- Privacy policy and basic community rules
