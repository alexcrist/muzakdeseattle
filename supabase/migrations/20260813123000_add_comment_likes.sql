create table if not exists comment_likes (
  comment_id uuid not null references comments(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, player_id)
);

alter table comment_likes enable row level security;

drop policy if exists "public access" on comment_likes;
create policy "public access" on comment_likes for all using (true) with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comment_likes'
  ) then
    alter publication supabase_realtime add table public.comment_likes;
  end if;
end;
$$;
