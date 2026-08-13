alter table comments
  add column if not exists gif_url text,
  add column if not exists gif_preview_url text,
  add column if not exists gif_provider text,
  add column if not exists gif_id text;

alter table comments
  drop constraint if exists comments_has_content;

alter table comments
  add constraint comments_has_content
  check (nullif(trim(body), '') is not null or gif_url is not null);

alter table comments
  drop constraint if exists comments_gif_urls_are_https;

alter table comments
  add constraint comments_gif_urls_are_https
  check (
    (gif_url is null or gif_url like 'https://%')
    and (gif_preview_url is null or gif_preview_url like 'https://%')
  );
