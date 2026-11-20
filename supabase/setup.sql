-- T2T database setup
-- Paste all of this into Supabase → SQL Editor → New query → Run.
-- Rules: anyone can READ (so Tally's page works without logging in),
-- only a logged-in user (you) can ADD / CHANGE / DELETE.
--
-- Safe to run again: it starts by deleting the T2T tables, so running it
-- a second time wipes the quotes and settings (uploaded photo files stay in storage).

-- ---------- start clean ----------

drop table if exists heart_state, settings, photos, quotes, songs cascade;

-- ---------- tables ----------

create table quotes (
  id         bigint generated always as identity primary key,
  text       text not null,
  author     text,
  kind       text not null default 'lief'
             check (kind in ('lief', 'motivatie', 'fact', 'baka', 'quote')),
  created_at timestamptz not null default now()
);

create table photos (
  id         bigint generated always as identity primary key,
  path       text not null,
  caption    text,
  created_at timestamptz not null default now()
);

create table settings (
  id              int primary key default 1 check (id = 1),  -- only one row
  quote_mode      text not null default 'daily' check (quote_mode in ('pinned', 'shuffle', 'hourly', 'daily')),
  photo_mode      text not null default 'daily' check (photo_mode in ('pinned', 'shuffle', 'hourly', 'daily')),
  pinned_quote_id bigint references quotes(id) on delete set null,
  pinned_photo_id bigint references photos(id) on delete set null,
  her_city        text not null default 'Tally',
  her_timezone    text not null default 'Europe/Amsterdam',
  reunion_date    date,
  footer_text     text not null default 'thinking of you'  -- shown under the ♥ when there's no countdown
);

insert into settings (id) values (1);

-- ---------- security rules ----------

-- Table access for the website (newer Supabase projects don't grant this automatically).
-- anon = visitors (Tally), authenticated = you when signed in.
grant usage on schema public to anon, authenticated;
grant select on quotes, photos, settings to anon, authenticated;
grant insert, update, delete on quotes, photos, settings to authenticated;
grant usage on all sequences in schema public to authenticated;

-- Row rules on top of that:

alter table quotes   enable row level security;
alter table photos   enable row level security;
alter table settings enable row level security;

create policy "Anyone can read quotes"   on quotes   for select using (true);
create policy "Anyone can read photos"   on photos   for select using (true);
create policy "Anyone can read settings" on settings for select using (true);

create policy "Admin manages quotes"   on quotes   for all to authenticated using (true) with check (true);
create policy "Admin manages photos"   on photos   for all to authenticated using (true) with check (true);
create policy "Admin manages settings" on settings for all to authenticated using (true) with check (true);

-- ---------- photo storage ----------

insert into storage.buckets (id, name, public) values ('photos', 'photos', true)
on conflict (id) do nothing;

drop policy if exists "Admin reads photo files"   on storage.objects;
drop policy if exists "Admin uploads photo files" on storage.objects;
drop policy if exists "Admin deletes photo files" on storage.objects;

create policy "Admin reads photo files"   on storage.objects for select to authenticated using (bucket_id = 'photos');
create policy "Admin uploads photo files" on storage.objects for insert to authenticated with check (bucket_id = 'photos');
create policy "Admin deletes photo files" on storage.objects for delete to authenticated using (bucket_id = 'photos');

-- ---------- background music ----------

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

-- ---------- clickable hearts ----------

-- How many hearts she gets per day (Aidan can change this in the admin panel)
alter table settings add column if not exists hearts_per_day int not null default 2 check (hearts_per_day between 1 and 5);

-- Today's heart usage and what she swapped to (one row)
create table if not exists heart_state (
  id       int primary key default 1 check (id = 1),
  day      int not null default 0,            -- day number in her timezone
  used     int not null default 0,
  quote_id bigint references quotes(id) on delete set null,
  photo_id bigint references photos(id) on delete set null,
  set_at   timestamptz
);
insert into heart_state (id) values (1) on conflict (id) do nothing;

alter table heart_state enable row level security;
grant select on heart_state to anon, authenticated;
drop policy if exists "Anyone can read hearts" on heart_state;
create policy "Anyone can read hearts" on heart_state for select using (true);
-- No direct writes: Tally (not logged in) can only use a heart through use_heart() below,
-- which works out "today" itself and refuses once the hearts are used up.

create or replace function use_heart(p_quote_id bigint, p_photo_id bigint)
returns heart_state
language plpgsql
security definer
set search_path = public
as $$
declare
  st     heart_state;
  max_h  int;
  tz     text;
  today  int;
begin
  select hearts_per_day, her_timezone into max_h, tz from settings where id = 1;
  today := (now() at time zone coalesce(tz, 'Europe/Amsterdam'))::date - date '1970-01-01';

  select * into st from heart_state where id = 1 for update;
  if st.day <> today then
    st.used := 0;
  end if;
  if st.used >= max_h then
    raise exception 'No hearts left today';
  end if;

  update heart_state
     set day = today, used = st.used + 1, quote_id = p_quote_id, photo_id = p_photo_id, set_at = now()
   where id = 1
  returning * into st;
  return st;
end;
$$;

revoke all on function use_heart(bigint, bigint) from public;
grant execute on function use_heart(bigint, bigint) to anon, authenticated;

-- ---------- starter content ----------

insert into quotes (text, kind) values
  -- 💕 Lief & persoonlijk
  ('Je bent grappig', 'lief'),
  ('Je bent een slim en knap meisje. Vergeet dat niet', 'lief'),
  ('Ik kom cooler terug. Ook slimmer, sterker en leuker.', 'lief'),
  ('Ik heb door jou zalm sashimi leren eten, dankjewel', 'lief'),
  ('Die Logitech muis die je voor mij hebt gekocht vind ik zo zo fijn. Wauw', 'lief'),
  ('Al deze tekstjes schrijven vind ik eigenlijk wel leuk.', 'lief'),
  ('Succes op school ja', 'lief'),
  ('Tot snel babe', 'lief'),

  -- 💪 Motivatie & wijsheid
  ('Onbewust win je elke dag 1000x, alleen staan we er niet bij stil en focussen we ons te veel op de slechte dingen. Leef bewust en dan zul je merken dat je meer rust en vrede ervaart.', 'motivatie'),
  ('Men vergeet hoe sterk het lichaam en de geest zijn. Zet de lat hoog en push jezelf als het kan en als het nodig is.', 'motivatie'),
  ('Als je een grote opdracht moet doen en je weet niet waar je moet beginnen: begin klein, maak het hapbaar. Maar het is belangrijk dat je begint! Je komt er wel uit als je bezig bent.', 'motivatie'),
  ('Als je jezelf cringe vindt/vond van een x aantal jaar geleden, is dat een teken dat je als persoon bent gegroeid!', 'motivatie'),
  ('Niet zoveel op je telefoon ja, niet alleen omdat het afleidt van school. Je maakt onbewust je brein lui.', 'motivatie'),
  ('Ik denk dat het nog nooit zo makkelijk is geweest om succesvol te zijn in school en werk. De gemiddelde student zit 7 uur per dag op zijn telefoon en school boeit hem niet. Mind you, zij zijn jouw concurrentie in de toekomst. Dus door gewoon je best te doen komt het wel goed.', 'motivatie'),
  ('Wat zijn we toch blessed om in Nederland geboren te zijn. Dat is al een gewonnen loterij waar mensen niet bij stilstaan.', 'motivatie'),
  ('Droom groot en doe je best.', 'motivatie'),

  -- 🧠 Fun facts & random gedachtes
  ('Als het kan doe ik altijd eerst mijn linkerschoen aan. Ik had ooit in een Donald Duck gelezen dat dit extra geluk brengt. lol', 'fact'),
  ('Wist je dat tulpen oorspronkelijk niet uit Nederland komen, maar uit het huidige Turkije?', 'fact'),
  ('Japan brengt elk jaar meer dan 12.000 manga titels uit', 'fact'),
  ('GTA 6 wordt echt niet normaal groot en populair, ik denk dat velen dit niet beseffen', 'fact'),
  ('Als ik niet op voetbal had gezeten, zou ik tafeltennis, badminton of volleybal doen. Weet je hoeveel makkelijker je daarin pro kan worden dan in voetbal?', 'fact'),
  ('Als mensen me vragen of ik me meer Nederlands of Indo voel, weet ik het antwoord eigenlijk niet. Ik voel me gewoon... mezelf. Weet jij het?', 'fact'),
  ('Ben benieuwd of ik al een goed patatje heb kunnen vinden in Taiwan', 'fact'),
  ('Een zalm sashimi zou nu wel echt lekker zijn', 'fact'),

  -- 🤪 Baka & gekkigheid
  ('Baka', 'baka'),
  ('Baka', 'baka'),
  ('Baka baka baka', 'baka'),
  ('xD', 'baka'),
  ('Frickadoodle mann', 'baka'),
  ('Ik heb baka zo vaak gehoord en zeg het zelf zo vaak dat ik het niet eens meer zo cringy vind klinken lol', 'baka');
