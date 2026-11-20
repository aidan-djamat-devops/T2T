-- Adds the clickable hearts: Tally can swap the quote + photo a few times per day.
-- Run once in Supabase → SQL Editor. Does NOT delete anything, safe to run again.
-- (Already included in setup.sql for new databases.)

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
