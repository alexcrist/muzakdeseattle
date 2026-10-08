# CLAUDE.md

This repository is Muzak Season 2: a Vite + React SPA backed by a fresh Supabase database.

## Toy Project Workflow

This is intentionally a toy project. Keep the workflow lightweight:

- Never run tests, linting, type-checking, or other automated verification.
- Never run a production build to verify changes.
- Never perform visual checking. Do not start the dev or preview server, use browser automation, or take screenshots to inspect the UI.
- Make the requested changes and stop without testing, building, or visually reviewing them.

## Commands

- `npm install` — install dependencies
- `npm run db:status` — list applied and pending migrations
- `npm run db:plan` — dry run; reports pending migrations, changes nothing
- `npm run db:deploy` — apply pending migrations
- `npm run playlists:deploy` — apply migrations, upload server secrets, deploy the playlist worker
- `npm run tidal:connect` / `npm run spotify:connect` — one-time playlist-owner authorization

The `db:*` scripts run `scripts/migrate.mjs`, which applies migrations through the Supabase Management API. It needs a personal access token in `SUPABASE_ACCESS_TOKEN` or `~/.muzak-supabase-token`, and reads the project ref out of the Supabase URL in `.env.local`. `db:link` and `db:push` still drive the Supabase CLI instead; both paths record versions in `supabase_migrations.schema_migrations`, so they stay interchangeable.

## Deployment

The app is deployed on the existing Netlify site, which builds from this repo. Pushing to `main` deploys; there is no manual upload step. Supabase credentials come from Vite environment variables:

- `NEXT_PUBLIC_SUPABASE_URL` or `VITE_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `VITE_SUPABASE_ANON_KEY`

Do not hardcode Supabase credentials in source. `public/_redirects` provides SPA fallback routing.

## No Auth

There is intentionally no login. Player identity is a player row stored in localStorage. Admin controls are openly accessible to everyone. Supabase RLS policies allow public read/write access.

## Season 2 Round Model

Do not use Season 1 round statuses or manual phase advancement.

Phases are computed from:

- `league_settings.schedule_start_date`
- `league_settings.weekly_phase_template`
- round `queue_position`
- current date in `America/Los_Angeles`

Default schedule:

- Monday-Wednesday: submission
- Thursday-Saturday: voting
- Sunday: appreciation

Phase boundaries happen at midnight Pacific. The app computes the correct phase when opened, so no client-side ticking transition or server cron is required.

Keep the queue stocked ahead of the current week. `addRound` appends at the end of the queue and derives `week_start_date` from that position, so a round added after the queue has already run dry is dated to a week that has passed and lands straight in history instead of becoming the current round.

## Round Sides

A round with at least `MIN_PLAYERS_TO_SPLIT` active players is split into two sides, so nobody has to listen to the whole league in one week.

- Sides live in `round_groups` and are assigned once, when the round becomes current. Whoever opens the app first writes them through the `assign_round_groups` RPC, which is first-writer-wins, so simultaneous clients cannot produce two different splits.
- `src/lib/groups.js` picks the split by minimising how often the same pair lands together, which keeps season-long pairings even. Do not replace it with a plain shuffle.
- Voting is scoped to your own side. A tab on the voting screen exposes the other side's songs for listening and commenting, with no vote controls and no scores. Song comments follow their song; the general round thread stays on your own side, following its author. The sidebar shows submission and vote progress for both sides, including partial ballots, without exposing song scores.
- Appreciation keeps one overall ranking, with the winner determined across both sides, but exposes each side's songs through the same Side A / Side B tabs. Its sidebar shows the final submission and voting status for every assigned player.
- Duplicate merges may not span sides, enforced in both `create_duplicate_merge` and the admin tool.
- Late joiners go to the smaller side via `join_round_group`. Sides are never rebalanced mid-round.
- Below the threshold, or before the migration is applied, the round runs as a single pool exactly as it did before.

## Voting

- Each player spends `league_settings.points_per_player` points per round, default 10. There is no per-song cap; the whole bank can go on one song.
- Players cannot score their own song. The UI omits the controls, and `src/lib/scoring.js` also discards self-votes at scoring time, so a stray row can never inflate a total.
- Songs are anonymous during voting. So are comments, behind a per-round alias from `src/lib/anonymousNames.js`. Appreciation reveals both.
- Each player sees the songs in their own order (`src/lib/listeningOrder.js`) so submission order does not bias results. Both the alias and the order are derived by hashing round plus player, so they are stable without being stored.
- Vote writes are debounced in `src/hooks/useDebouncedVotes.js`. Votes always stay attached to the original song row, including through duplicate merges.

## Surfaces

Four routes, all under `src/pages/`:

- `/` — Home: the current round, its phase, a countdown, and the submission, voting, or appreciation view from `src/pages/home/`.
- `/rounds` — queue, current round, and the past-round archive. Defined in `src/pages/QueuePage.jsx`, which exports `RoundsPage`; the filename predates the rename. Each archive card links to `/rounds/:roundId`, whose full scorecard reuses the appreciation results UI, including side rosters and final submission/voting status.
- `/players` — player directory, profile editing, and season standings. **Standings live here.** Round-by-round results live in the past-round archive rather than a standings table. There is no leaderboard page; `/leaderboard` redirects to this route.
- `/admin` — league settings, schedule editor, duplicate merge tool, and player activation. `AdminUnlock` is a slide-to-confirm gesture guarding against accidental taps, not a password.

The remaining Season 1 paths (`/queue`, `/archive`, `/history`, `/settings`) redirect into those four.

## Core Helpers

- `src/lib/schedule.js` owns Pacific-time scheduling, current round derivation, phase labels, and scored-round detection.
- `src/lib/scoring.js` owns duplicate-aware song totals and standings.
- `src/lib/groups.js` owns side assignment, balancing, and side lookup.
- `src/lib/supabase.js` owns the Supabase client and env-var guard.
- `src/lib/data.js` owns the per-page fetchers and the realtime table lists they subscribe to.
- `src/lib/mutations.js` owns every write except avatar uploads, which go through `src/lib/profilePictures.js`. No component or hook calls Supabase directly; keep it that way.
- The server-only `supabase/functions/generate-playlists/` worker owns external playlist writes and its job state. Frontend playlist requests still go through `src/lib/mutations.js`.

Keep scoring rules centralized in `src/lib/scoring.js`; duplicate handling must be identical on Home, Rounds history, and Players standings.

Standings count every past round plus the current round once it reaches appreciation. `getScoredRoundIds` in `src/lib/schedule.js` is the only place that decides which rounds those are.

## Duplicate Rules

Duplicate merges happen after voting. The app never mutates votes to merge duplicates. A merge group joins two or more song rows and chooses one canonical display song.

Scoring:

- Sum votes across all songs in the group.
- Remove votes from any submitter in that group.
- Add courtesy points equal to `submitter_count - 1`.
- Award the final merged total to every duplicate submitter.

Merges only apply within a side. Players on opposite sides never shared a voting pool, so there is no split vote for courtesy points to repair.

## Schema

The schema source of truth is `supabase/migrations/`; `SETUP.md` documents how to apply it. Keep migrations in sync with table assumptions in code.

## Automatic Listening Playlists

Supabase Cron launches `generate-playlists` at Thursday 12:05 a.m. Pacific. Two
weekly UTC slots are guarded by Pacific local time, so each connected service
runs once weekly across daylight saving changes. The worker reuses `schedule.js`
and `groups.js`; it never advances phases or rebalances existing sides.

Each split round gets separate public Side A and Side B playlists on Tidal and
Spotify. Search uses title and artist, and Gemini selects from the top five
candidates with four concurrent songs on Spotify and at most two on Tidal.
Tidal catalog calls are serialized with a 750 ms gap and shared retry waits. Successful matches survive
manual retries. Both scheduled and manual jobs create only missing playlists;
existing managed or manually linked playlists are left untouched. Songs without
matches are omitted; create the playlist with whatever matches succeeded. Admin has per-service job buttons, progress, links, and unresolved
song details. `round_playlists` remains the frontend's source of playlist links.

API keys stay in Edge Function secrets; OAuth credentials stay in Supabase Vault.
`.env.tidal.local` is the ignored local provisioning file for both services.
Automation state tables are publicly readable, worker-writable only. Public
admin requests are limited to the current round after submissions close, with
concurrency and attempt limits. No league login is added. See `SETUP.md` for
credential setup, deployment, account requirements, and free-tier cost details.

## Profile Pictures

Profile pictures use the public Supabase Storage bucket `profile-pictures`. Uploads are resized in the browser before being stored at `players/<player-id>/avatar.webp`, and the resulting public URL is saved to `players.avatar_url`.
