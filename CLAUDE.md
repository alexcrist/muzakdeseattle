# CLAUDE.md

This repository is Muzak Season 2: a Vite + React SPA backed by a fresh Supabase database.

## Commands

- `npm install` — install dependencies
- `npm run dev` — start Vite dev server
- `npm run build` — produce `dist/`
- `npm run preview` — serve the built `dist/`

There is no test runner, linter, or type-checker configured.

## Deployment

The app is deployed on the existing Netlify site. Supabase credentials come from Vite environment variables:

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

## Round Sides

A round with at least `MIN_PLAYERS_TO_SPLIT` active players is split into two sides, so nobody has to listen to the whole league in one week.

- Sides live in `round_groups` and are assigned once, when the round becomes current. Whoever opens the app first writes them through the `assign_round_groups` RPC, which is first-writer-wins, so simultaneous clients cannot produce two different splits.
- `src/lib/groups.js` picks the split by minimising how often the same pair lands together, which keeps season-long pairings even. Do not replace it with a plain shuffle.
- Submission and voting are scoped to your own side. Song comments follow their song; general round comments follow their author.
- Appreciation reveals both sides in one ranking. The winner is the top scorer across either side.
- Duplicate merges may not span sides, enforced in both `create_duplicate_merge` and the admin tool.
- Late joiners go to the smaller side via `join_round_group`. Sides are never rebalanced mid-round.
- Below the threshold, or before the migration is applied, the round runs as a single pool exactly as it did before.

## Core Helpers

- `src/lib/schedule.js` owns Pacific-time scheduling, current round derivation, phase labels, and scored-round detection.
- `src/lib/scoring.js` owns duplicate-aware song totals and leaderboards.
- `src/lib/groups.js` owns side assignment, balancing, and side lookup.
- `src/lib/supabase.js` owns the Supabase client and env-var guard.

Keep scoring rules centralized in `src/lib/scoring.js`; duplicate handling must be identical on Home, Rounds history, and Leaderboard.

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

## Profile Pictures

Profile pictures use the public Supabase Storage bucket `profile-pictures`. Uploads are resized in the browser before being stored at `players/<player-id>/avatar.webp`, and the resulting public URL is saved to `players.avatar_url`.
