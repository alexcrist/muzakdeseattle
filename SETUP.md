# Muzak Season 2 Setup

Season 2 should use a fresh Supabase project. Keep the old Supabase project online for the Season 1 time capsule, then point the current Netlify site at the new Season 2 credentials.

## 1. Create The Season 2 Supabase Project

1. Go to Supabase and create a new project.
2. Put its URL and anon key in `.env.local` (see step 2 below) — the migration script reads the project ref from there.
3. Apply the migrations with `npm run db:deploy`, described under [Applying Migrations](#applying-migrations).

The schema source of truth is `supabase/migrations/`. The initial migration creates the Season 2 tables, storage bucket, realtime publication, and public RLS policies. Later migrations keep general round comments, duplicate merging, and round side splitting in sync.

Apply migrations before deploying app code that depends on them. Until `round_groups` exists the app reads an empty side list and runs every round as a single pool, so an un-migrated database degrades rather than breaking.

The Supabase CLI is the alternative path: `npx supabase login`, then `npm run db:link -- --project-ref your-project-ref` and `npm run db:push`. It needs the database password as well as a token, which is why `db:deploy` exists.

If an existing Season 2 database was created manually from an older setup doc, either path still works; the baseline migration is written to be idempotent for already-created tables, triggers, policies, storage, and realtime setup.

Do not commit database passwords or Supabase access tokens.

## Applying Migrations

Migrations run through the Supabase Management API, which needs only a personal access token. No database password, no connection string, no pooler configuration.

Create a token at <https://supabase.com/dashboard/account/tokens> (it starts with `sbp_`) and save it to `~/.muzak-supabase-token`, or export it as `SUPABASE_ACCESS_TOKEN`. Then:

```bash
npm run db:status   # applied vs pending
npm run db:plan     # dry run, changes nothing
npm run db:deploy   # apply pending migrations
```

`scripts/migrate.mjs` applies each pending file in filename order and records it in `supabase_migrations.schema_migrations`, the same table the Supabase CLI uses, so `supabase db push` remains interchangeable with this script. A migration that fails stops the run and is not recorded, so re-running retries it.

The script targets whichever project `VITE_SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) in `.env.local` points at — it parses the ref out of that URL rather than taking a flag. Check that file before deploying against an unfamiliar checkout.

Note that API keys — `anon`, `service_role`, `sb_publishable_`, `sb_secret_` — **cannot** run migrations. They authenticate to PostgREST, which exposes no DDL. Only a `sbp_` personal access token works here.

Migrations should stay idempotent (`create table if not exists`, `create or replace function`, `drop policy if exists`) so that re-applying the full set against an already-provisioned database is harmless.

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

Netlify builds from this repo, so pushing to `main` deploys. There is no manual upload step.

Build locally first to catch a broken build before it reaches the site:

```bash
npm install
npm run build
```

Netlify reads its build settings from `netlify.toml`. Environment variables set in the Netlify UI are baked in at build time, so changing one requires a redeploy to take effect.

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

Keep a few rounds queued ahead of the current week. Each round is dated by its position in the queue, so one added after the queue has run dry is dated to a week that already passed and goes straight to history rather than becoming the current round.

Default schedule:

- Monday-Wednesday: submissions
- Thursday-Saturday: voting
- Sunday: appreciation

Phases change at midnight Pacific time.
