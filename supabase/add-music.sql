-- Adds background music: a songs table, music settings and a 'music' storage bucket.
-- Run once in Supabase → SQL Editor. Does NOT delete anything, safe to run again.
-- (Already included in setup.sql for new databases.)

create table if not exists songs (
  id         bigint generated always as identity primary key,
  path       text not null,
  title      text,
  created_at timestamptz not null default now()
);

alter table songs enable row level security;
grant select on songs to anon, authenticated;
grant insert, update, delete on songs to authenticated;
grant usage on all sequences in schema public to authenticated;

drop policy if exists "Anyone can read songs" on songs;
drop policy if exists "Admin manages songs"   on songs;
create policy "Anyone can read songs" on songs for select using (true);
create policy "Admin manages songs"   on songs for all to authenticated using (true) with check (true);

-- 'playlist' = all songs one after another, 'single' = only the chosen song on repeat
alter table settings add column if not exists music_mode    text   not null default 'playlist' check (music_mode in ('single', 'playlist'));
alter table settings add column if not exists music_song_id bigint references songs(id) on delete set null;
alter table settings add column if not exists music_volume  int    not null default 25 check (music_volume between 0 and 100);

insert into storage.buckets (id, name, public) values ('music', 'music', true)
on conflict (id) do nothing;

drop policy if exists "Admin reads music files"   on storage.objects;
drop policy if exists "Admin uploads music files" on storage.objects;
drop policy if exists "Admin deletes music files" on storage.objects;
create policy "Admin reads music files"   on storage.objects for select to authenticated using (bucket_id = 'music');
create policy "Admin uploads music files" on storage.objects for insert to authenticated with check (bucket_id = 'music');
create policy "Admin deletes music files" on storage.objects for delete to authenticated using (bucket_id = 'music');
