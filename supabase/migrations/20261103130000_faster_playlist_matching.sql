-- Matching efficiency:
-- 1. Save each match's ISRC, so the other service can look up the same
--    recording directly instead of searching and asking the model.
-- 2. Match six songs at a time on both services. Tidal catalog calls are still
--    serialized by the worker; concurrency only overlaps the model calls, which
--    must fit the 90-second matching window.
-- 3. Queue Spotify at 12:01 a.m. Pacific and Tidal at 12:11, so Tidal can reuse
--    Spotify's ISRCs. Tidal falls back to search and the model for any song
--    Spotify has not matched.
alter table public.playlist_song_matches add column if not exists isrc text;

update public.playlist_automation_settings set concurrency = 6;

create or replace function public.playlist_weekly_job()
returns void language plpgsql security definer set search_path = ''
as $$
declare v_now timestamp := now() at time zone 'America/Los_Angeles';
begin
  if extract(isodow from v_now) <> 4 then return; end if;
  if v_now::time >= time '00:01' and v_now::time < time '00:06' then
    perform public.playlist_queue_job('spotify', 'scheduled');
  elsif v_now::time >= time '00:11' and v_now::time < time '00:16' then
    perform public.playlist_queue_job('tidal', 'scheduled');
  end if;
end;
$$;
revoke all on function public.playlist_weekly_job() from public, anon, authenticated;

-- Two UTC hours stay guarded by Pacific local time across daylight saving.
select cron.schedule('playlists-thursday-pacific', '1,11 7,8 * * 4', 'select public.playlist_weekly_job();');
