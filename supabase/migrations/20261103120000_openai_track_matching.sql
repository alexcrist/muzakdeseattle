-- Track matching moves from Gemini to OpenAI gpt-6.1-terra (medium reasoning).
-- OpenAI gets its own one-request-per-second slot; the gemini row stays so
-- older worker versions keep working until the new worker is deployed.
alter table public.playlist_request_limits
  drop constraint playlist_request_limits_provider_check;
alter table public.playlist_request_limits
  add constraint playlist_request_limits_provider_check
  check (provider in ('tidal', 'spotify', 'gemini', 'openai'));
insert into public.playlist_request_limits (provider) values ('openai')
  on conflict (provider) do nothing;

create or replace function public.playlist_reserve_request(p_provider text, p_budget_ms integer)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_next timestamptz;
  v_now timestamptz;
  v_slot timestamptz;
  v_delay integer;
begin
  if p_provider not in ('tidal', 'spotify', 'gemini', 'openai') or p_budget_ms is null or p_budget_ms < 0 then
    raise exception 'Invalid provider request';
  end if;
  select next_request_at into strict v_next from public.playlist_request_limits
    where provider = p_provider for update;
  v_now := clock_timestamp();
  v_slot := greatest(v_now, v_next);
  v_delay := ceil(extract(epoch from (v_slot - v_now)) * 1000)::integer;
  if v_delay > least(p_budget_ms, 130000) then return null; end if;
  update public.playlist_request_limits set next_request_at = v_slot + interval '1 second'
    where provider = p_provider;
  return v_delay;
end;
$$;
revoke all on function public.playlist_reserve_request(text, integer) from public, anon, authenticated;
grant execute on function public.playlist_reserve_request(text, integer) to service_role;

alter table public.playlist_automation_settings
  alter column model set default 'gpt-6.1-terra';
update public.playlist_automation_settings set model = 'gpt-6.1-terra';
