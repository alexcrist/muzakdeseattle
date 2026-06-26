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
