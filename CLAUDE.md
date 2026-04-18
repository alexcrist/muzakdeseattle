# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm install` — install dependencies
- `npm run dev` — start Vite dev server
- `npm run build` — produce a `dist/` folder (this is what ships to Netlify)
- `npm run preview` — serve the built `dist/` locally

There is no test runner, no linter, and no type-checker configured. Don't suggest running tests or lint — they do not exist.

## Deployment model

Deployment is manual: run `npm run build`, then drag the `dist/` folder into Netlify's deploy drop zone. `public/_redirects` provides the SPA fallback for client-side routing. `SETUP.md` is a non-technical end-user walkthrough of the full Supabase + Netlify setup — treat it as user-facing docs, not developer docs.

## Architecture

### Stack
Vite + React 18 SPA backed by Supabase (Postgres + Realtime). `react-router-dom` v6 for routing, `@dnd-kit/*` for drag-and-drop in the round queue. No server code — the frontend talks directly to Supabase.

### No auth, public RLS
There is no login. Player identity is just a name + UUID stored in `localStorage` via `src/lib/identity.js`. All Supabase tables have `using (true) with check (true)` RLS policies — any client can read or write any row. **Do not add authorization logic assuming a session** and do not recommend moving secrets server-side without first discussing it — the "anon key in source" pattern is intentional for this deploy model (see `src/lib/supabase.js`).

### Round state machine
Rounds move through `pending → submission → voting → complete`. Transitions happen **client-side** in `tickRoundTransitions()` (`src/lib/rounds.js`), which runs on page load and every 60s from `App.jsx`. Any connected client can advance a round when its deadline passes; when none are connected, rounds stall until someone opens the app. This is a known behavior, not a bug (see the SETUP.md troubleshooting entry). Pause/unpause works by recording `paused_at` on `league_settings` and, on unpause, shifting every active round's deadlines forward by the elapsed pause duration.

### App shell and contexts
`src/App.jsx` owns two contexts: `PlayerContext` (current local player) and `SettingsContext` (the single `league_settings` row, id=1). Both are loaded before routing mounts; settings are kept fresh via a Supabase Realtime subscription. If no player is stored, the app renders `JoinScreen` instead of the router. `HomePage` is a dispatcher — it picks `SubmissionPhase`, `VotingPhase`, `ResultsPhase`, or `WaitingState` based on the current round's status, and auto-surfaces unseen results using a `ml_seen_results` localStorage key.

### Realtime
Pages that need live data subscribe to `postgres_changes` on the relevant table (e.g. `rounds`, `league_settings`) and re-fetch on any change. Follow this pattern rather than hand-rolling polling.

### Schema
The canonical schema lives in two places: `SETUP.md` (the copy users paste into Supabase) and the comment block at the bottom of `src/lib/supabase.js`. **Keep these two in sync** when adding columns or tables — existing installs won't auto-migrate, so any schema change is also a manual migration step users have to run.

### Flavor text
All user-facing copy lives in `src/lib/flavor.js` as a single `FLAVOR` object. Edit strings there rather than inlining copy in components — users are told this file is the one place to customize tone.
