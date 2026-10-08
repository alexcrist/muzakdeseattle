-- Share the job pipeline while keeping account connections, matches, retries,
-- and generated playlists independent for Tidal and Spotify.
do $$
declare v_old text; v_new text;
begin
  for v_old, v_new in select * from (values
    ('tidal_automation_settings', 'playlist_automation_settings'),
    ('tidal_playlist_jobs', 'playlist_jobs'),
    ('tidal_song_matches', 'playlist_song_matches'),
    ('tidal_managed_playlists', 'playlist_managed_playlists')
  ) as names(old_name, new_name) loop
    if to_regclass('public.' || v_new) is null then
      execute format('alter table public.%I rename to %I', v_old, v_new);
    end if;
    execute format('alter table public.%I add column if not exists service text not null default ''tidal'' check (service in (''tidal'', ''spotify''))', v_new);
    execute format('alter table public.%I drop constraint if exists %I', v_new, v_old || '_pkey');
  end loop;
end;
$$;

alter table public.playlist_automation_settings drop column if exists id;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'playlist_automation_settings_pkey' and conrelid = 'public.playlist_automation_settings'::regclass) then
    alter table public.playlist_automation_settings add primary key (service);
    alter table public.playlist_jobs add primary key (service, round_id);
    alter table public.playlist_song_matches add primary key (service, song_id);
    alter table public.playlist_managed_playlists add primary key (service, round_id, group_index);
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'playlist_managed_playlists' and column_name = 'tidal_playlist_id') then
    alter table public.playlist_managed_playlists rename column tidal_playlist_id to playlist_id;
  end if;
end;
$$;
insert into public.playlist_automation_settings (service) values ('spotify') on conflict do nothing;

create or replace function public.playlist_get_oauth(p_service text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  if p_service not in ('tidal', 'spotify') or p_service is null then raise exception 'Unknown music service.'; end if;
  return (select decrypted_secret::jsonb from vault.decrypted_secrets where name = p_service || '_oauth');
end;
$$;

create or replace function public.playlist_save_oauth(p_service text, p_credentials jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if p_service not in ('tidal', 'spotify') or p_service is null then raise exception 'Unknown music service.'; end if;
  if coalesce(p_credentials->>'refresh_token', '') = '' then raise exception 'The service did not supply a refresh token. Reconnect the account.'; end if;
  select id into v_id from vault.secrets where name = p_service || '_oauth';
  if v_id is null then
    perform vault.create_secret(p_credentials::text, p_service || '_oauth');
  else
    perform vault.update_secret(v_id, p_credentials::text);
  end if;
  update public.playlist_automation_settings set connected = true where service = p_service;
end;
$$;
revoke all on function public.playlist_get_oauth(text) from public, anon, authenticated;
revoke all on function public.playlist_save_oauth(text, jsonb) from public, anon, authenticated;
grant execute on function public.playlist_get_oauth(text) to service_role;
grant execute on function public.playlist_save_oauth(text, jsonb) to service_role;

-- Preserve the original setup commands during the rollout.
create or replace function public.tidal_get_oauth()
returns jsonb language sql security definer set search_path = ''
as $$ select public.playlist_get_oauth('tidal'); $$;
create or replace function public.tidal_save_oauth(p_credentials jsonb)
returns void language sql security definer set search_path = ''
as $$ select public.playlist_save_oauth('tidal', p_credentials); $$;

create or replace function public.playlist_queue_job(p_service text, p_source text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_now timestamp := now() at time zone 'America/Los_Angeles';
  v_settings public.league_settings%rowtype;
  v_config public.playlist_automation_settings%rowtype;
  v_job public.playlist_jobs%rowtype;
  v_round_id uuid;
  v_week int;
  v_day text;
  v_phase text;
  v_url text;
  v_secret text;
begin
  if p_service not in ('tidal', 'spotify') or p_service is null then raise exception 'Unknown music service.'; end if;
  if p_source not in ('scheduled', 'manual') or p_source is null then raise exception 'Unknown job source.'; end if;
  perform pg_advisory_xact_lock(hashtext('playlist_job:' || p_service));
  select * into v_config from public.playlist_automation_settings where service = p_service;
  if not coalesce(v_config.enabled and v_config.connected, false) then
    return jsonb_build_object('error', 'This service needs its API keys and a connected account.');
  end if;
  select * into v_settings from public.league_settings where id = 1;
  v_day := (array['monday','tuesday','wednesday','thursday','friday','saturday','sunday'])[extract(isodow from v_now)::int];
  v_phase := coalesce(v_settings.weekly_phase_template->>v_day,
    (array['submission','submission','submission','voting','voting','voting','appreciation'])[extract(isodow from v_now)::int]);
  if v_phase not in ('voting', 'appreciation') then
    return jsonb_build_object('error', 'Playlists can only run after submissions close.');
  end if;
  v_week := floor((v_now::date - coalesce(v_settings.schedule_start_date, date_trunc('week', v_now)::date)) / 7.0)::int;
  if v_week < 0 then return jsonb_build_object('error', 'The season has not started.'); end if;
  select id into v_round_id from public.rounds where not is_archived
    order by queue_position, created_at offset v_week limit 1;
  if v_round_id is null then
    return jsonb_build_object('error', 'There is no current round. Add future rounds to the queue.');
  end if;
  select * into v_job from public.playlist_jobs where service = p_service and round_id = v_round_id;
  if v_job.status in ('queued', 'running') and v_job.started_at > now() - interval '5 minutes' then
    return jsonb_build_object('status', v_job.status, 'round_id', v_round_id);
  end if;
  if p_source = 'scheduled' and v_job.status = 'completed' then
    return jsonb_build_object('status', 'completed', 'round_id', v_round_id);
  end if;
  if v_job.started_at > now() - interval '5 minutes' then
    return jsonb_build_object('error', 'Please wait five minutes between playlist runs for this service.');
  end if;
  if v_job.attempt_day = v_now::date and v_job.attempts_today >= 8 then
    return jsonb_build_object('error', 'Today’s eight attempts for this service have been used. Try again tomorrow.');
  end if;
  if exists (select 1 from public.playlist_jobs where service = p_service and status in ('queued', 'running')
    and started_at > now() - interval '5 minutes') then
    return jsonb_build_object('error', 'Another job for this service is still running.');
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'playlist_function_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'playlist_job_secret';
  if v_url is null or v_secret is null then return jsonb_build_object('error', 'The playlist worker has not been deployed yet.'); end if;

  insert into public.playlist_jobs (service, round_id, status, source) values (p_service, v_round_id, 'queued', p_source)
  on conflict (service, round_id) do update set
    run_id = gen_random_uuid(), status = 'queued', source = excluded.source,
    started_at = now(), finished_at = null, message = '',
    attempts_today = case when playlist_jobs.attempt_day = v_now::date then playlist_jobs.attempts_today + 1 else 1 end,
    attempt_day = v_now::date
  returning * into v_job;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    body := jsonb_build_object('service', p_service, 'round_id', v_round_id, 'run_id', v_job.run_id),
    timeout_milliseconds := 10000
  );
  return jsonb_build_object('status', 'queued', 'round_id', v_round_id);
end;
$$;
revoke all on function public.playlist_queue_job(text, text) from public, anon, authenticated;

create or replace function public.request_playlists(p_service text)
returns jsonb language sql security definer set search_path = ''
as $$ select public.playlist_queue_job(p_service, 'manual'); $$;
revoke all on function public.request_playlists(text) from public;
grant execute on function public.request_playlists(text) to anon, authenticated;

create or replace function public.tidal_queue_job(p_source text)
returns jsonb language sql security definer set search_path = ''
as $$ select public.playlist_queue_job('tidal', p_source); $$;

create or replace function public.playlist_weekly_job()
returns void language plpgsql security definer set search_path = ''
as $$
declare v_now timestamp := now() at time zone 'America/Los_Angeles';
begin
  if extract(isodow from v_now) = 4 and v_now::time >= time '00:05' and v_now::time < time '00:10' then
    perform public.playlist_queue_job('tidal', 'scheduled');
    perform public.playlist_queue_job('spotify', 'scheduled');
  end if;
end;
$$;
revoke all on function public.playlist_weekly_job() from public, anon, authenticated;
do $$
begin
  if exists (select 1 from cron.job where jobname = 'tidal-thursday-pacific') then
    perform cron.unschedule('tidal-thursday-pacific');
  end if;
end;
$$;
select cron.schedule('playlists-thursday-pacific', '5 7,8 * * 4', 'select public.playlist_weekly_job();');
