-- Shared listening playlists are scoped to a round side. A single side can publish
-- multiple services (for example Spotify and TIDAL) for the same listening pass.

create table if not exists round_playlists (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  group_index int not null default 0 check (group_index between 0 and 1),
  service text not null default 'Playlist',
  url text not null,
  created_at timestamptz not null default now(),
  unique (round_id, group_index, url)
);

create index if not exists round_playlists_round_group_idx
  on round_playlists (round_id, group_index, created_at);

alter table round_playlists enable row level security;

drop policy if exists "public access" on round_playlists;
create policy "public access" on round_playlists for all using (true) with check (true);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'round_playlists'
  ) then
    alter publication supabase_realtime add table public.round_playlists;
  end if;
end;
$$;
