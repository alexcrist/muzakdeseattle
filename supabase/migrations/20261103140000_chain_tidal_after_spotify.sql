-- Start Tidal as soon as Spotify's scheduled run finishes, instead of waiting
-- for a fixed 12:11 slot, so Tidal can reuse Spotify's ISRCs without idling.
--
-- 12:01 a.m. Pacific: queue Spotify. If Spotify cannot be queued (disabled,
--   disconnected, no current round), queue Tidal immediately instead.
-- Spotify's scheduled run finishes (completed, partial, or failed): a trigger
--   queues Tidal.
-- 12:11 a.m. Pacific: fallback for a Spotify worker that never reported back.
--   Queues Tidal only if no Tidal run has started today.

create or replace function public.playlist_tidal_not_started_today()
returns boolean language sql stable security definer set search_path = ''
as $$
  select not exists (
    select 1 from public.playlist_jobs
    where service = 'tidal' and attempt_day = (now() at time zone 'America/Los_Angeles')::date
  );
$$;
revoke all on function public.playlist_tidal_not_started_today() from public, anon, authenticated;

create or replace function public.playlist_weekly_job()
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_now timestamp := now() at time zone 'America/Los_Angeles';
  v_result jsonb;
begin
  if extract(isodow from v_now) <> 4 then return; end if;
  if v_now::time >= time '00:01' and v_now::time < time '00:06' then
    v_result := public.playlist_queue_job('spotify', 'scheduled');
    if v_result ? 'error' and public.playlist_tidal_not_started_today() then
      perform public.playlist_queue_job('tidal', 'scheduled');
    end if;
  elsif v_now::time >= time '00:11' and v_now::time < time '00:16' then
    if public.playlist_tidal_not_started_today() then
      perform public.playlist_queue_job('tidal', 'scheduled');
    end if;
  end if;
end;
$$;
revoke all on function public.playlist_weekly_job() from public, anon, authenticated;

create or replace function public.playlist_chain_tidal_after_spotify()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if public.playlist_tidal_not_started_today() then
    perform public.playlist_queue_job('tidal', 'scheduled');
  end if;
  return null;
exception when others then
  -- Never fail the Spotify worker's status update; the 12:11 fallback remains.
  raise warning 'Could not chain the Tidal playlist job: %', sqlerrm;
  return null;
end;
$$;
revoke all on function public.playlist_chain_tidal_after_spotify() from public, anon, authenticated;

drop trigger if exists playlist_chain_tidal on public.playlist_jobs;
create trigger playlist_chain_tidal
  after update of status on public.playlist_jobs
  for each row
  when (new.service = 'spotify' and new.source = 'scheduled'
    and old.status = 'running' and new.status in ('completed', 'partial', 'failed'))
  execute function public.playlist_chain_tidal_after_spotify();
