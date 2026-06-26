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

## Core Helpers

- `src/lib/schedule.js` owns Pacific-time scheduling, current round derivation, phase labels, and scored-round detection.
- `src/lib/scoring.js` owns duplicate-aware song totals and leaderboards.
- `src/lib/supabase.js` owns the Supabase client and env-var guard.

Keep scoring rules centralized in `src/lib/scoring.js`; duplicate handling must be identical on Home, Rounds history, and Leaderboard.

## Duplicate Rules

Duplicate merges happen after voting. The app never mutates votes to merge duplicates. A merge group joins two or more song rows and chooses one canonical display song.

Scoring:

- Sum votes across all songs in the group.
- Remove votes from any submitter in that group.
- Add courtesy points equal to `submitter_count - 1`.
- Award the final merged total to every duplicate submitter.

## Schema

The full Season 2 SQL lives in `SETUP.md`. Keep that setup SQL in sync with table assumptions in code.
