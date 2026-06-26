# Muzak Season 2 Setup

Season 2 should use a fresh Supabase project. Keep the old Supabase project online for the Season 1 time capsule, then point the current Netlify site at the new Season 2 credentials.

## 1. Create The Season 2 Supabase Project

1. Go to Supabase and create a new project.
2. Open **SQL Editor**.
3. Run this full SQL block.

```sql
create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table players (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  active boolean not null default true,
  avatar_url text,
  avatar_color text default '#ff7ab6',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table league_settings (
  id int primary key default 1 check (id = 1),
  league_name text not null default 'Muzak de Seattle',
  season_label text not null default 'Season 2',
  points_per_player int not null default 10 check (points_per_player > 0),
  weekly_phase_template jsonb not null default '{
    "monday": "submission",
    "tuesday": "submission",
    "wednesday": "submission",
    "thursday": "voting",
    "friday": "voting",
    "saturday": "voting",
    "sunday": "appreciation"
  }'::jsonb,
  schedule_start_date date not null default (date_trunc('week', now() at time zone 'America/Los_Angeles')::date),
  timezone text not null default 'America/Los_Angeles',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into league_settings (id) values (1)
on conflict (id) do nothing;

create table rounds (
  id uuid primary key default gen_random_uuid(),
  theme_name text not null,
  theme_description text not null,
  queue_position int not null default 0,
  submitted_by_player_id uuid references players(id) on delete set null,
  week_start_date date,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table songs (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  artist text not null,
  title text not null,
  album text,
  link text,
  submitter_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(round_id, player_id)
);

create table votes (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  song_id uuid not null references songs(id) on delete cascade,
  voter_player_id uuid not null references players(id) on delete cascade,
  points int not null check (points > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(song_id, voter_player_id)
);

create table comments (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  song_id uuid references songs(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table duplicate_groups (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  canonical_song_id uuid references songs(id) on delete set null,
  label text default 'Duplicate submission',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table duplicate_group_songs (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references duplicate_groups(id) on delete cascade,
  song_id uuid not null references songs(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(group_id, song_id),
  unique(song_id)
);

create trigger players_updated_at before update on players
  for each row execute function set_updated_at();
create trigger league_settings_updated_at before update on league_settings
  for each row execute function set_updated_at();
create trigger rounds_updated_at before update on rounds
  for each row execute function set_updated_at();
create trigger songs_updated_at before update on songs
  for each row execute function set_updated_at();
create trigger votes_updated_at before update on votes
  for each row execute function set_updated_at();
create trigger duplicate_groups_updated_at before update on duplicate_groups
  for each row execute function set_updated_at();

alter table players enable row level security;
alter table league_settings enable row level security;
alter table rounds enable row level security;
alter table songs enable row level security;
alter table votes enable row level security;
alter table comments enable row level security;
alter table duplicate_groups enable row level security;
alter table duplicate_group_songs enable row level security;

create policy "public access" on players for all using (true) with check (true);
create policy "public access" on league_settings for all using (true) with check (true);
create policy "public access" on rounds for all using (true) with check (true);
create policy "public access" on songs for all using (true) with check (true);
create policy "public access" on votes for all using (true) with check (true);
create policy "public access" on comments for all using (true) with check (true);
create policy "public access" on duplicate_groups for all using (true) with check (true);
create policy "public access" on duplicate_group_songs for all using (true) with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-pictures',
  'profile-pictures',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "public profile pictures read"
on storage.objects for select
using (bucket_id = 'profile-pictures');

create policy "public profile pictures insert"
on storage.objects for insert
with check (bucket_id = 'profile-pictures');

create policy "public profile pictures update"
on storage.objects for update
using (bucket_id = 'profile-pictures')
with check (bucket_id = 'profile-pictures');

create policy "public profile pictures delete"
on storage.objects for delete
using (bucket_id = 'profile-pictures');

alter publication supabase_realtime add table
  players,
  league_settings,
  rounds,
  songs,
  votes,
  comments,
  duplicate_groups,
  duplicate_group_songs;
```

For an existing Season 2 database created before general round comments, run this one-time migration:

```sql
alter table comments alter column song_id drop not null;
```

## 2. Add Supabase Credentials To Netlify

In the new Supabase project, open **Project Settings → API** and copy:

- Project URL
- anon public key

In Netlify, open the current site:

1. Go to **Site configuration → Environment variables**.
2. Add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
3. Redeploy the site.

Local development uses the same values in `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

The app also accepts `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` if those are already configured.

## 3. Build And Deploy

```bash
npm install
npm run build
```

Deploy `dist/` to the existing Netlify site, or let Netlify build from the repo if it is connected.

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

Default schedule:

- Monday-Wednesday: submissions
- Thursday-Saturday: voting
- Sunday: appreciation

Phases change at midnight Pacific time.
