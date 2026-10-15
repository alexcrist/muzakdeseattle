-- Persist unfinished work separately from completed catalog searches.
alter table public.playlist_song_matches drop constraint if exists tidal_song_matches_status_check;
alter table public.playlist_song_matches add constraint playlist_song_matches_status_check
  check (status in ('matched', 'unmatched', 'pending', 'failed'));

alter table public.playlist_jobs drop constraint if exists tidal_playlist_jobs_source_check;
alter table public.playlist_jobs add constraint playlist_jobs_source_check
  check (source in ('manual', 'scheduled', 'resume'));
alter table public.playlist_jobs
  add column retry_pending boolean not null default false,
  add column next_retry_at timestamptz,
  add column retry_count integer not null default 0 check (retry_count between 0 and 7),
  add column creation_pending boolean not null default false;

-- Older failures have no reliable error classification. Keep them as errors,
-- never relabel them as catalog misses or automatically restart old jobs.
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
  if p_source not in ('scheduled', 'manual', 'resume') or p_source is null then raise exception 'Unknown job source.'; end if;
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
  if p_source = 'resume' then
    if not coalesce(v_job.retry_pending, false) or v_job.next_retry_at > now() then
      return jsonb_build_object('status', 'not_due');
    end if;
    if v_job.started_at > now() - interval '5 minutes' then
      return jsonb_build_object('status', 'waiting');
    end if;
    -- A lost creation response must not produce a second external playlist.
    if v_job.creation_pending then
      update public.playlist_jobs set retry_pending = false, next_retry_at = null,
        status = 'partial', finished_at = now(),
        message = 'Playlist creation was interrupted before its link was confirmed. Check the music account and save the existing link in Admin before retrying. Pending searches are not catalog misses.'
      where service = p_service and round_id = v_round_id;
      return jsonb_build_object('status', 'needs_attention');
    end if;
    if v_job.retry_count >= 7 or (v_job.attempt_day = v_now::date and v_job.attempts_today >= 8) then
      update public.playlist_jobs set retry_pending = false, next_retry_at = null,
        status = 'partial', finished_at = now(),
        message = 'Automatic recovery reached its attempt limit. Some work is still unfinished; this does not mean the songs are absent from the catalog. Retry from Admin after reviewing the details.'
      where service = p_service and round_id = v_round_id;
      return jsonb_build_object('status', 'needs_attention');
    end if;
  end if;
  if v_job.status in ('queued', 'running') and v_job.started_at > now() - interval '5 minutes' then
    return jsonb_build_object('status', v_job.status, 'round_id', v_round_id);
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

  insert into public.playlist_jobs (service, round_id, status, source, retry_pending, next_retry_at)
  values (p_service, v_round_id, 'queued', p_source, true, now() + interval '5 minutes')
  on conflict (service, round_id) do update set
    run_id = gen_random_uuid(), status = 'queued', source = excluded.source,
    started_at = now(), finished_at = null, message = '',
    retry_pending = true, next_retry_at = now() + interval '5 minutes',
    retry_count = case when p_source = 'resume' then playlist_jobs.retry_count + 1 else 0 end,
    creation_pending = false,
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

-- A cheap database-only sweep dispatches only jobs explicitly awaiting recovery.
-- The queue function enforces current round/phase, account serialization, the
-- lease, cooldown, backoff and both retry limits. Public callers cannot resume.
create function public.playlist_resume_jobs()
returns void language plpgsql security definer set search_path = ''
as $$
declare v_service text;
begin
  for v_service in
    select distinct service from public.playlist_jobs
    where retry_pending and next_retry_at <= now()
  loop
    perform public.playlist_queue_job(v_service, 'resume');
  end loop;
end;
$$;
revoke all on function public.playlist_resume_jobs() from public, anon, authenticated;
select cron.schedule('playlists-resume-pending', '* * * * *', 'select public.playlist_resume_jobs();');
