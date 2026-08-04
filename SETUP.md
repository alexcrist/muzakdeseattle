# Muzak Season 2 Setup

Season 2 should use a fresh Supabase project. Keep the old Supabase project online for the Season 1 time capsule, then point the current Netlify site at the new Season 2 credentials.

## 1. Create The Season 2 Supabase Project

1. Go to Supabase and create a new project.
2. Log in to the Supabase CLI once:

```bash
npx supabase login
```

3. Link the local repo to the new project and apply migrations:

```bash
npm run db:link -- --project-ref your-project-ref
npm run db:push
```

The schema source of truth is `supabase/migrations/`. The initial migration creates the Season 2 tables, storage bucket, realtime publication, and public RLS policies. Later migrations keep general round comments, duplicate merging, and round side splitting in sync.

Apply migrations before deploying app code that depends on them. Until `round_groups` exists the app reads an empty side list and runs every round as a single pool, so an un-migrated database degrades rather than breaking.

If an existing Season 2 database was created manually from an older setup doc, `npm run db:push` can still be used; the baseline migration is written to be idempotent for already-created tables, triggers, policies, storage, and realtime setup.

Do not commit database passwords or Supabase access tokens.

## 2. Add Supabase Credentials

In the new Supabase project, open **Project Settings -> API** and copy:

- Project URL
- anon public key

Local development uses these values in `.env.local`:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

In Netlify:

1. Open **Site configuration -> Environment variables**.
2. Add `VITE_SUPABASE_URL`.
3. Add `VITE_SUPABASE_ANON_KEY`.
4. Redeploy the site.

The app still accepts `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for old environments, but new configuration should use the `VITE_` names.

## 3. Build And Deploy

```bash
npm install
npm run build
```

Deploy `dist/` to the existing Netlify site, or let Netlify build from the repo if it is connected.

## 4. Connect `muzakdeseattle.com`

In Netlify:

1. Open the site.
2. Go to **Domain management**.
3. Add `muzakdeseattle.com` as a custom domain.
4. Add `www.muzakdeseattle.com` as a domain alias if desired.

In Cloudflare DNS:

1. Add a `CNAME` for `www` pointing to the Netlify site hostname.
2. For the apex/root domain, use Netlify's recommended external DNS target from the Netlify domain screen. Cloudflare supports CNAME flattening for apex records, so a root CNAME can work when Netlify tells you to use one.
3. Keep Cloudflare SSL/TLS mode compatible with Netlify HTTPS. If certificate provisioning gets stuck, temporarily set the DNS records to DNS-only until Netlify finishes issuing its certificate, then re-enable proxying if desired.

Useful docs:

- Netlify custom domains: https://docs.netlify.com/manage/domains/
- Netlify external DNS: https://docs.netlify.com/manage/domains/configure-external-dns/
- Cloudflare CNAME flattening: https://developers.cloudflare.com/dns/cname-flattening/

## 5. First Season 2 Use

1. Open the site.
2. Create or pick your profile.
3. Go to **Admin** and confirm the league name, points per player, schedule start Monday, and weekly phase calendar.
4. Go to **Rounds** and add the first prompt.

Default schedule:

- Monday-Wednesday: submissions
- Thursday-Saturday: voting
- Sunday: appreciation

Phases change at midnight Pacific time.
