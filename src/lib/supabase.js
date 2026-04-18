import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────
// REPLACE THESE TWO VALUES after setting up Supabase
// See SETUP.md for instructions
// ─────────────────────────────────────────────
const SUPABASE_URL = 'https://sirddgginqwotoopveoz.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpcmRkZ2dpbnF3b3Rvb3B2ZW96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNDE2MzgsImV4cCI6MjA5MDgxNzYzOH0.LJ3UoI0TFbjGAaNcBS54axU1v8sW6qMhPQo8KpRN0i4'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ─────────────────────────────────────────────
// SUPABASE SQL SETUP
// Copy and run this entire block in your Supabase
// SQL Editor (supabase.com → your project → SQL Editor)
// ─────────────────────────────────────────────
//
// -- PLAYERS
// create table players (
//   id uuid primary key default gen_random_uuid(),
//   name text unique not null,
//   created_at timestamptz default now()
// );
//
// -- LEAGUE SETTINGS (single row)
// create table league_settings (
//   id int primary key default 1,
//   league_name text default 'Music League',
//   points_per_player int default 10,
//   default_submission_hours int default 48,
//   default_voting_hours int default 48,
//   is_paused boolean default false,
//   paused_at timestamptz
// );
// insert into league_settings (id) values (1);
//
// -- ROUNDS
// create table rounds (
//   id uuid primary key default gen_random_uuid(),
//   theme_name text not null,
//   theme_description text not null,
//   queue_position int not null default 0,
//   status text not null default 'pending',
//   submission_deadline timestamptz,
//   voting_deadline timestamptz,
//   submitted_by_player_id uuid references players(id),
//   created_at timestamptz default now()
// );
//
// -- SONGS
// create table songs (
//   id uuid primary key default gen_random_uuid(),
//   round_id uuid references rounds(id) on delete cascade,
//   player_id uuid references players(id),
//   artist text not null,
//   title text not null,
//   album text,
//   link text,
//   submitter_note text,
//   created_at timestamptz default now(),
//   unique(round_id, player_id)
// );
//
// -- VOTES
// create table votes (
//   id uuid primary key default gen_random_uuid(),
//   round_id uuid references rounds(id) on delete cascade,
//   song_id uuid references songs(id) on delete cascade,
//   voter_player_id uuid references players(id),
//   points int not null default 0,
//   created_at timestamptz default now(),
//   unique(song_id, voter_player_id)
// );
//
// -- COMMENTS
// create table comments (
//   id uuid primary key default gen_random_uuid(),
//   round_id uuid references rounds(id) on delete cascade,
//   song_id uuid references songs(id) on delete cascade,
//   player_id uuid references players(id),
//   body text not null,
//   created_at timestamptz default now()
// );
//
// -- Enable Row Level Security (RLS) and allow all access
// -- (since we have no auth, we allow public read/write)
// alter table players enable row level security;
// alter table league_settings enable row level security;
// alter table rounds enable row level security;
// alter table songs enable row level security;
// alter table votes enable row level security;
// alter table comments enable row level security;
//
// create policy "public access" on players for all using (true) with check (true);
// create policy "public access" on league_settings for all using (true) with check (true);
// create policy "public access" on rounds for all using (true) with check (true);
// create policy "public access" on songs for all using (true) with check (true);
// create policy "public access" on votes for all using (true) with check (true);
// create policy "public access" on comments for all using (true) with check (true);
