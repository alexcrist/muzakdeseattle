# Muzak de Seattle

Vite + React app for Muzak Season 2, backed by Supabase.

## Setup

```bash
npm install
cp .env.example .env.local
```

Fill `.env.local` with the Supabase project URL and anon key:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Optional: add `VITE_GIPHY_API_KEY` to enable the GIF search picker in comments.

Existing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` values are still accepted for compatibility.

## Development

```bash
npm run dev
```

While the dev server is running, add a `days` query parameter to inspect the Home screen at a different point in the schedule:

```text
http://localhost:5173/?days=-1  # one day ago
http://localhost:5173/?days=-2  # two days ago
http://localhost:5173/?days=1   # one day ahead
```

The override only works in Vite development mode; production ignores it. It changes the app's clock, not its database connection, so voting, commenting, and playlist controls still write to whichever Supabase project `.env.local` configures. Automatic side assignment is disabled while a day offset is active.

## Build

```bash
npm run build
```

## Database Migrations

Save a Supabase personal access token to `~/.muzak-supabase-token`, then:

```bash
npm run db:status   # applied vs pending
npm run db:plan     # dry run, changes nothing
npm run db:deploy   # apply pending migrations
```

These target whichever project `.env.local` points at. The Supabase CLI path (`npm run db:link`, `npm run db:push`) also works but additionally needs the database password. See `SETUP.md` for both.

The schema source of truth is `supabase/migrations/`. Add future schema changes as new SQL files there.

## Docs

- `CLAUDE.md` — how the league works: scheduling, round sides, voting, and scoring rules.
- `SETUP.md` — provisioning a Supabase project, migrations, Netlify, DNS, and how to deploy each part (`web:deploy`, `db:deploy`, `playlists:deploy`).
- `docs/superpowers/specs/` — point-in-time design specs, kept as history.
