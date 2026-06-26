# Muzak de Seattle

Vite + React app for Muzak Season 2, backed by Supabase.

## Setup

```bash
npm install
cp .env.example .env.local
```

Fill `.env.local` with the Supabase project URL and publishable key.

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

Add future schema changes as SQL files in `supabase/migrations/`.
