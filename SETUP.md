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

Follow the toy-project workflow in `CLAUDE.md`: do not run a local build, tests,
linting, type checks, or visual checks. Netlify performs the deployment build.

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

## 6. Automatic Tidal and Spotify Playlists

The `generate-playlists` Supabase Edge Function creates a **public playlist for
each side on each connected service**. A split round gets four links: TIDAL Side
A, TIDAL Side B, Spotify Side A, and Spotify Side B. A round below the split
threshold gets one playlist per service. The frontend keeps using
`round_playlists`, so links appear in voting, appreciation, and round history.

The weekly job starts Thursday at **12:05 a.m. America/Los_Angeles**. Supabase
cron uses UTC, so it evaluates `5 7,8 * * 4`; a database guard only launches the
workers at the slot that is 00:05 Pacific. The other slot is a no-op. This handles
both PST and PDT without a frequent polling cron. There is no scheduled catch-up
job: use Admin for a missed or failed run. If the weekly phase template changes,
the Thursday job still runs only after submissions have closed. It skips a
missing current round and never advances phases or changes the queue.

### Credentials and account connections

Keep server credentials in **`.env.tidal.local`** (ignored by Git, for both
services). Do not use `VITE_` or `NEXT_PUBLIC_` prefixes for any of these keys.

```dotenv
TIDAL_CLIENT_ID=...
TIDAL_CLIENT_SECRET=...
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
GEMINI_API_KEY=...
```

1. **Tidal:** create an app at <https://developer.tidal.com/dashboard>. Register
   `http://127.0.0.1:8787/callback` exactly, and enable `playlists.read` and
   `playlists.write`. Copy the client ID and secret into the file above. If login
   returns error 11102, check the saved redirect URI and enabled scopes first.
2. **Spotify:** create an app at <https://developer.spotify.com/dashboard>,
   select Web API, and register `http://127.0.0.1:8788/callback` exactly. Copy its
   client ID and secret. The developer-app owner must have Spotify Premium.
   Authorize that account, or add the playlist owner's account under Settings →
   Users Management. Ordinary listeners just use the public playlist links and
   do not need to join this developer app's allowlist.
3. **Gemini:** create an API key at <https://aistudio.google.com/api-keys> in a
   **Free Tier project without billing enabled**. The default model is
   `gemini-3.5-flash-lite`. An API key itself does not guarantee free usage if its
   project has billing enabled; there is no paid-model fallback in this worker.
4. Deploy using the existing Supabase personal access token:

   ```bash
   npm run playlists:deploy
   ```

   This applies migrations, uploads the supplied server secrets, deploys the
   Edge Function through Supabase's server-side bundler, and enables the
   configured services. It does not run verification commands. The original
   `npm run tidal:deploy` command is an alias. Either service can be omitted from
   the credentials file; its automation stays disabled until configured.
5. Authorize each playlist owner:

   ```bash
   npm run tidal:connect
   npm run spotify:connect
   ```

   Run these one at a time and open the printed URL on the **same computer**.
   Sign in to the account that should own that service's public playlists. The
   callback listener runs for ten minutes, uses OAuth state and PKCE, and saves
   the returned tokens directly into Supabase Vault. It never prints tokens.
   Run the relevant command again if access is revoked or a refresh token stops
   working. No league-wide login is added.

### Admin and matching behavior

Unlock **Admin → Listening playlists**, then use **Create** or **Create missing playlists** for the
desired service. The button is available during the current round's voting and
appreciation phases. The job continues if you close the page. Status and results
update through Supabase Realtime, with a Refresh status button as a fallback.

For each submission, the worker searches with **song title and artist**, takes
the top five candidates, and asks Gemini to choose one or report no suitable
match. The prompt includes the submitted album, version hints, note, link, and
round context. It sends no player IDs, names, scores, comments, or audio. Model
output is constrained to candidate IDs and checked before use. User-entered
fields are treated as data, not instructions. Catalog results are not stored;
only the chosen recording and a short explanation are saved for the round.

Songs are processed concurrently, four at a time per service. Services run
independently, so a Spotify error does not prevent Tidal from finishing. Worker
wall time is bounded for Supabase Free's 150-second limit. Rate-limit responses
are retried within that budget; remaining failures appear in Admin for a manual
retry. There is no recurring retry cron.

Successful matches are reused when the submission and matching configuration
have not changed. Playlists are created with the successfully matched songs;
unmatched or failed songs are omitted and listed in Admin. If no songs match,
the playlist is empty. Once created, playlists stay untouched on retries; add
any omitted songs directly in the music service.
The generated playlist order is stable and shared within each side; it cannot
represent every player's individual in-app listening order. Identical selected
tracks appear once per playlist. Song rows, duplicate merges, and votes are
never modified by playlist generation.

Jobs are locked per service and round. Public admin callers can request only the
current round, wait five minutes between attempts, and make at most eight
attempts per service per Pacific day. The worker alone writes job state and
matches. Both scheduled and manual jobs skip existing playlists per service
and side, including manually linked playlists. Their contents, names, and
visibility are never changed. Only missing playlists are created. Tidal
idempotency keys and a Spotify creation marker avoid duplicate creation after
an interrupted response. If track insertion fails after creation, repair that
playlist directly in the music service; retries leave it untouched.

The configuration is in `playlist_automation_settings`, writable only by the
backend/operator. `candidate_count` accepts 1–10; `concurrency` accepts 1–8.
`enabled = false` disables a service without deleting its OAuth connection.
The browser can read connection flags and job progress, but OAuth tokens live
only in Vault and API keys only in Edge Function secrets. The public RPC queues
a bounded job; it does not expose the secret-protected worker endpoint.

### Costs and platform requirements

- **Supabase Free:** expected incremental cost **$0**. The normal schedule invokes
  two workers per week, roughly nine invocations a month, against 500,000 free
  monthly invocations. No paid hosting service or always-on process is needed.
- **Gemini Free Tier:** expected **$0** within the project's available quota. Free
  limits vary; lower concurrency or use a later manual retry if the quota is
  exhausted. This integration never enables billing or upgrades plans.
- **If a paid Gemini key is supplied:** at the published Gemini 3.5 Flash-Lite
  prices of $0.30/million input tokens and $2.50/million output tokens, 20 songs
  per week across both services, 2,000 input tokens and 1,024 output tokens per
  song/service, would cost approximately **$0.55/month**, before retries. This is
  an estimate, not a billing cap. Free-tier prompts may be used to improve
  Google's products; consult its pricing/data-use terms.
- **Spotify:** the developer-app owner needs an existing Premium subscription.
  There is no new hosting charge for this integration; if the owner lacks
  Premium, the account requirement must be resolved separately.
- Tidal's published developer terms restrict AI use of its content, and its
  guidelines list games/quizzes as requiring written approval. Confirm that
  your use is permitted before enabling this integration for ongoing use.

References (consulted October 8, 2026):

- [Supabase scheduled functions](https://supabase.com/docs/guides/functions/schedule-functions)
- [Supabase invocation allowances](https://supabase.com/docs/guides/platform/manage-your-usage/edge-function-invocations)
- [Supabase runtime limits](https://supabase.com/docs/guides/functions/limits)
- [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Tidal API](https://tidal-music.github.io/tidal-api-reference/)
- [Tidal authorization](https://developer.tidal.com/documentation/api-sdk/api-sdk-authorization)
- [Tidal developer guidelines](https://developer.tidal.com/documentation/guidelines/guidelines-developer-guidelines)
- [Spotify development-mode requirements](https://developer.spotify.com/documentation/web-api/concepts/quota-modes)
- [Spotify redirect URIs](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri)
