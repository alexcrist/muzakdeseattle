-- Public admin may request a bounded job, but only the worker can write its
-- state. OAuth credentials and the worker secret stay in Vault.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create table if not exists public.tidal_automation_settings (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default false,
  connected boolean not null default false,
  model text not null default 'gemini-3.5-flash-lite',
  candidate_count int not null default 5 check (candidate_count between 1 and 10),
  concurrency int not null default 4 check (concurrency between 1 and 8)
);
insert into public.tidal_automation_settings (id) values (1) on conflict do nothing;

create table if not exists public.tidal_playlist_jobs (
  round_id uuid primary key references public.rounds(id) on delete cascade,
  run_id uuid not null default gen_random_uuid(),
  status text not null check (status in ('queued', 'running', 'completed', 'partial', 'failed')),
  source text not null check (source in ('manual', 'scheduled')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  message text not null default '',
  total_songs int not null default 0,
  matched_songs int not null default 0,
  attempt_day date not null default (now() at time zone 'America/Los_Angeles')::date,
  attempts_today int not null default 1
);

create table if not exists public.tidal_song_matches (
  song_id uuid primary key references public.songs(id) on delete cascade,
  round_id uuid not null references public.rounds(id) on delete cascade,
  fingerprint text not null,
  status text not null check (status in ('matched', 'unmatched', 'failed')),
  track_id text,
  track_label text,
  reason text not null default '',
  updated_at timestamptz not null default now()
);
create index if not exists tidal_song_matches_round_idx on public.tidal_song_matches(round_id);

create table if not exists public.tidal_managed_playlists (
  round_id uuid not null references public.rounds(id) on delete cascade,
  group_index int not null check (group_index between 0 and 1),
  create_key uuid not null default gen_random_uuid(),
  create_payload jsonb not null,
  tidal_playlist_id text,
  url text,
  published boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (round_id, group_index)
);

do $$
declare v_table text;
begin
  foreach v_table in array array['tidal_automation_settings', 'tidal_playlist_jobs', 'tidal_song_matches', 'tidal_managed_playlists'] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('revoke all on public.%I from anon, authenticated', v_table);
    execute format('grant select on public.%I to anon, authenticated', v_table);
    execute format('grant all on public.%I to service_role', v_table);
    execute format('drop policy if exists "public read" on public.%I', v_table);
    execute format('create policy "public read" on public.%I for select using (true)', v_table);
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$$;

create or replace function public.tidal_get_oauth()
returns jsonb language sql security definer set search_path = ''
as $$
  select decrypted_secret::jsonb from vault.decrypted_secrets where name = 'tidal_oauth';
$$;

create or replace function public.tidal_save_oauth(p_credentials jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if coalesce(p_credentials->>'refresh_token', '') = '' then
    raise exception 'Tidal did not supply a refresh token. Reconnect the account.';
  end if;
  select id into v_id from vault.secrets where name = 'tidal_oauth';
  if v_id is null then
    perform vault.create_secret(p_credentials::text, 'tidal_oauth');
  else
    perform vault.update_secret(v_id, p_credentials::text);
  end if;
  update public.tidal_automation_settings set connected = true where id = 1;
end;
$$;
revoke all on function public.tidal_get_oauth() from public, anon, authenticated;
revoke all on function public.tidal_save_oauth(jsonb) from public, anon, authenticated;
grant execute on function public.tidal_get_oauth() to service_role;
grant execute on function public.tidal_save_oauth(jsonb) to service_role;

-- Internal dispatcher. The public wrapper has no arguments, so callers cannot
-- pick arbitrary rounds, endpoints, prompts, or credentials.
create or replace function public.tidal_queue_job(p_source text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_now timestamp := now() at time zone 'America/Los_Angeles';
  v_settings public.league_settings%rowtype;
  v_config public.tidal_automation_settings%rowtype;
  v_job public.tidal_playlist_jobs%rowtype;
  v_round_id uuid;
  v_week int;
  v_day text;
  v_phase text;
  v_url text;
  v_secret text;
begin
  perform pg_advisory_xact_lock(hashtext('tidal_playlist_job'));
  select * into v_config from public.tidal_automation_settings where id = 1;
  if not coalesce(v_config.enabled and v_config.connected, false) then
    return jsonb_build_object('error', 'Tidal automation needs its API keys and a connected account.');
  end if;

  select * into v_settings from public.league_settings where id = 1;
  v_day := (array['monday','tuesday','wednesday','thursday','friday','saturday','sunday'])[extract(isodow from v_now)::int];
  v_phase := coalesce(v_settings.weekly_phase_template->>v_day,
    (array['submission','submission','submission','voting','voting','voting','appreciation'])[extract(isodow from v_now)::int]);
  if v_phase not in ('voting', 'appreciation') then
    return jsonb_build_object('error', 'Playlists can only run after submissions close.');
  end if;
  v_week := floor((v_now::date - coalesce(v_settings.schedule_start_date, date_trunc('week', v_now)::date)) / 7.0)::int;
  if v_week < 0 then
    return jsonb_build_object('error', 'The season has not started.');
  end if;
  select id into v_round_id from public.rounds where not is_archived
    order by queue_position, created_at offset v_week limit 1;
  if v_round_id is null then
    return jsonb_build_object('error', 'There is no current round. Add future rounds to the queue.');
  end if;

  select * into v_job from public.tidal_playlist_jobs where round_id = v_round_id;
  if v_job.status in ('queued', 'running') and v_job.started_at > now() - interval '5 minutes' then
    return jsonb_build_object('status', v_job.status, 'round_id', v_round_id);
  end if;
  if p_source = 'scheduled' and v_job.status = 'completed' then
    return jsonb_build_object('status', 'completed', 'round_id', v_round_id);
  end if;
  if v_job.started_at > now() - interval '5 minutes' then
    return jsonb_build_object('error', 'Please wait five minutes between playlist runs.');
  end if;
  if v_job.attempt_day = v_now::date and v_job.attempts_today >= 8 then
    return jsonb_build_object('error', 'Today’s eight playlist attempts have been used. Try again tomorrow.');
  end if;
  -- Serialize use of the account's refresh token, including across a week boundary.
  if exists (select 1 from public.tidal_playlist_jobs where status in ('queued', 'running')
    and started_at > now() - interval '5 minutes') then
    return jsonb_build_object('error', 'Another playlist job is still running.');
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'tidal_function_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'tidal_job_secret';
  if v_url is null or v_secret is null then
    return jsonb_build_object('error', 'The playlist worker has not been deployed yet.');
  end if;

  insert into public.tidal_playlist_jobs (round_id, status, source)
    values (v_round_id, 'queued', p_source)
  on conflict (round_id) do update set
    run_id = gen_random_uuid(), status = 'queued', source = excluded.source,
    started_at = now(), finished_at = null, message = '',
    attempts_today = case when tidal_playlist_jobs.attempt_day = v_now::date then tidal_playlist_jobs.attempts_today + 1 else 1 end,
    attempt_day = v_now::date
  returning * into v_job;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    body := jsonb_build_object('round_id', v_round_id, 'run_id', v_job.run_id),
    timeout_milliseconds := 10000
  );
  return jsonb_build_object('status', 'queued', 'round_id', v_round_id);
end;
$$;
revoke all on function public.tidal_queue_job(text) from public, anon, authenticated;

create or replace function public.request_tidal_playlists()
returns jsonb language sql security definer set search_path = ''
as $$ select public.tidal_queue_job('manual'); $$;
revoke all on function public.request_tidal_playlists() from public;
grant execute on function public.request_tidal_playlists() to anon, authenticated;

create or replace function public.tidal_weekly_job()
returns void language plpgsql security definer set search_path = ''
as $$
declare v_now timestamp := now() at time zone 'America/Los_Angeles';
begin
  -- pg_cron is UTC. Only one of the two Thursday slots is 00:05 Pacific.
  if extract(isodow from v_now) = 4 and v_now::time >= time '00:05'
    and v_now::time < time '00:10' then
    perform public.tidal_queue_job('scheduled');
  end if;
end;
$$;
revoke all on function public.tidal_weekly_job() from public, anon, authenticated;

select cron.schedule('tidal-thursday-pacific', '5 7,8 * * 4', 'select public.tidal_weekly_job();');
