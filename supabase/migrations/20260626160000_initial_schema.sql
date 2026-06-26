create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  active boolean not null default true,
  avatar_url text,
  avatar_color text default '#ff7ab6',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists league_settings (
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

create table if not exists rounds (
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

create table if not exists songs (
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

create table if not exists votes (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  song_id uuid not null references songs(id) on delete cascade,
  voter_player_id uuid not null references players(id) on delete cascade,
  points int not null check (points > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(song_id, voter_player_id)
);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  song_id uuid references songs(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists duplicate_groups (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  canonical_song_id uuid references songs(id) on delete set null,
  label text default 'Duplicate submission',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists duplicate_group_songs (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references duplicate_groups(id) on delete cascade,
  song_id uuid not null references songs(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(group_id, song_id),
  unique(song_id)
);

create or replace function create_duplicate_merge(
  p_round_id uuid,
  p_song_ids uuid[],
  p_canonical_song_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_song_ids uuid[];
  v_canonical_song_id uuid;
  v_group_id uuid;
  v_selected_count int;
  v_round_song_count int;
  v_grouped_count int;
begin
  select array_agg(distinct selected.song_id)
  into v_song_ids
  from unnest(p_song_ids) as selected(song_id)
  where selected.song_id is not null;

  v_selected_count := coalesce(array_length(v_song_ids, 1), 0);

  if v_selected_count < 2 then
    raise exception 'Pick at least two songs to merge.' using errcode = '22023';
  end if;

  select count(*)
  into v_round_song_count
  from songs
  where id = any(v_song_ids)
    and round_id = p_round_id;

  if v_round_song_count <> v_selected_count then
    raise exception 'All selected songs must belong to the selected round.' using errcode = '22023';
  end if;

  v_canonical_song_id := coalesce(p_canonical_song_id, v_song_ids[1]);

  if not v_canonical_song_id = any(v_song_ids) then
    raise exception 'Canonical song must be one of the selected songs.' using errcode = '22023';
  end if;

  select count(*)
  into v_grouped_count
  from duplicate_group_songs
  where song_id = any(v_song_ids);

  if v_grouped_count > 0 then
    raise exception 'One or more selected songs is already merged.' using errcode = '23505';
  end if;

  insert into duplicate_groups (round_id, canonical_song_id, label)
  values (p_round_id, v_canonical_song_id, 'Duplicate submission')
  returning id into v_group_id;

  insert into duplicate_group_songs (group_id, song_id)
  select v_group_id, selected.song_id
  from unnest(v_song_ids) as selected(song_id);

  return v_group_id;
end;
$$;

drop trigger if exists players_updated_at on players;
create trigger players_updated_at before update on players
  for each row execute function set_updated_at();

drop trigger if exists league_settings_updated_at on league_settings;
create trigger league_settings_updated_at before update on league_settings
  for each row execute function set_updated_at();

drop trigger if exists rounds_updated_at on rounds;
create trigger rounds_updated_at before update on rounds
  for each row execute function set_updated_at();

drop trigger if exists songs_updated_at on songs;
create trigger songs_updated_at before update on songs
  for each row execute function set_updated_at();

drop trigger if exists votes_updated_at on votes;
create trigger votes_updated_at before update on votes
  for each row execute function set_updated_at();

drop trigger if exists duplicate_groups_updated_at on duplicate_groups;
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

drop policy if exists "public access" on players;
create policy "public access" on players for all using (true) with check (true);

drop policy if exists "public access" on league_settings;
create policy "public access" on league_settings for all using (true) with check (true);

drop policy if exists "public access" on rounds;
create policy "public access" on rounds for all using (true) with check (true);

drop policy if exists "public access" on songs;
create policy "public access" on songs for all using (true) with check (true);

drop policy if exists "public access" on votes;
create policy "public access" on votes for all using (true) with check (true);

drop policy if exists "public access" on comments;
create policy "public access" on comments for all using (true) with check (true);

drop policy if exists "public access" on duplicate_groups;
create policy "public access" on duplicate_groups for all using (true) with check (true);

drop policy if exists "public access" on duplicate_group_songs;
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

drop policy if exists "public profile pictures read" on storage.objects;
create policy "public profile pictures read"
on storage.objects for select
using (bucket_id = 'profile-pictures');

drop policy if exists "public profile pictures insert" on storage.objects;
create policy "public profile pictures insert"
on storage.objects for insert
with check (bucket_id = 'profile-pictures');

drop policy if exists "public profile pictures update" on storage.objects;
create policy "public profile pictures update"
on storage.objects for update
using (bucket_id = 'profile-pictures')
with check (bucket_id = 'profile-pictures');

drop policy if exists "public profile pictures delete" on storage.objects;
create policy "public profile pictures delete"
on storage.objects for delete
using (bucket_id = 'profile-pictures');

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'players',
    'league_settings',
    'rounds',
    'songs',
    'votes',
    'comments',
    'duplicate_groups',
    'duplicate_group_songs'
  ] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;
