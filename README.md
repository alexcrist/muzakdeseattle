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

Log in to Supabase CLI once:

```bash
npx supabase login
```

Link the project and apply migrations:

```bash
npm run db:link -- --project-ref your-project-ref
npm run db:push
```

The schema source of truth is `supabase/migrations/`. Add future schema changes as new SQL files there.
