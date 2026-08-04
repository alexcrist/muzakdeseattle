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

Existing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` values are still accepted for compatibility.

## Development

```bash
npm run dev
```

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
- `SETUP.md` — provisioning a Supabase project, migrations, Netlify, and DNS.
- `docs/superpowers/specs/` — point-in-time design specs, kept as history.
