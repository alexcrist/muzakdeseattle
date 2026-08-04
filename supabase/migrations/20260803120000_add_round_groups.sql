-- Each round is split into two sides so nobody has to listen to the whole league in one week.
-- Sides are assigned once per round and then frozen; see src/lib/groups.js for the balancing.

create table if not exists round_groups (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  group_index int not null check (group_index between 0 and 1),
  created_at timestamptz not null default now(),
  unique (round_id, player_id)
);

create index if not exists round_groups_round_idx on round_groups (round_id);

alter table round_groups enable row level security;

drop policy if exists "public access" on round_groups;
create policy "public access" on round_groups for all using (true) with check (true);

-- First writer wins. Two clients opening the app at the same moment cannot produce two
-- different splits: the loser's insert is a no-op and it re-reads the winner's assignment.
create or replace function assign_round_groups(
  p_round_id uuid,
  p_assignments jsonb
)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_existing int;
  v_inserted int;
  v_total int;
  v_distinct int;
begin
  if p_round_id is null then
    raise exception 'A round is required.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('round_groups:' || p_round_id::text));

  select count(*) into v_existing
  from round_groups
  where round_id = p_round_id;

  if v_existing > 0 then
    return 0;
  end if;

  select count(*), count(distinct (entry->>'player_id')::uuid)
  into v_total, v_distinct
  from jsonb_array_elements(p_assignments) as entry;

  if coalesce(v_total, 0) = 0 then
    raise exception 'No players to assign.' using errcode = '22023';
  end if;

  if v_total <> v_distinct then
    raise exception 'A player cannot be assigned to both sides.' using errcode = '22023';
  end if;

  insert into round_groups (round_id, player_id, group_index)
  select p_round_id, (entry->>'player_id')::uuid, (entry->>'group_index')::int
  from jsonb_array_elements(p_assignments) as entry
  on conflict (round_id, player_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

-- Late joiners land on whichever side is currently smaller.
-- Returns the side they belong to, or -1 when the round has not been split yet.
create or replace function join_round_group(
  p_round_id uuid,
  p_player_id uuid
)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_group int;
  v_existing int;
  v_side_0 int;
  v_side_1 int;
begin
  if p_round_id is null or p_player_id is null then
    raise exception 'A round and a player are required.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('round_groups:' || p_round_id::text));

  select group_index into v_group
  from round_groups
  where round_id = p_round_id
    and player_id = p_player_id;

  if found then
    return v_group;
  end if;

  select count(*) into v_existing
  from round_groups
  where round_id = p_round_id;

  if v_existing = 0 then
    return -1;
  end if;

  select
    count(*) filter (where group_index = 0),
    count(*) filter (where group_index = 1)
  into v_side_0, v_side_1
  from round_groups
  where round_id = p_round_id;

  v_group := case when v_side_0 <= v_side_1 then 0 else 1 end;

  insert into round_groups (round_id, player_id, group_index)
  values (p_round_id, p_player_id, v_group)
  on conflict (round_id, player_id) do nothing;

  return v_group;
end;
$$;

-- Duplicate merges may not span sides: two players on opposite sides never split a voting
-- pool, so there is no shared-vote unfairness for courtesy points to correct.
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
  v_side_count int;
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

  select count(distinct round_groups.group_index)
  into v_side_count
  from songs
  join round_groups
    on round_groups.round_id = songs.round_id
   and round_groups.player_id = songs.player_id
  where songs.id = any(v_song_ids);

  if coalesce(v_side_count, 0) > 1 then
    raise exception 'Songs from different sides cannot be merged.' using errcode = '22023';
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

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'round_groups'
  ) then
    alter publication supabase_realtime add table public.round_groups;
  end if;
end;
$$;
