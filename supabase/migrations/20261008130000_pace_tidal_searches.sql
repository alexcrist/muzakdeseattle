-- Reduce catalog pressure while keeping Gemini matching overlapped.
update public.playlist_automation_settings
set concurrency = least(concurrency, 2)
where service = 'tidal';
