-- Adds the heart queue: you line up quotes and photos, her next heart shows them in order.
-- Empty queue = random, like before. Run once in Supabase → SQL Editor.
-- Does NOT delete anything, safe to run again. (Already included in setup.sql for new databases.)

create table if not exists heart_queue (
  id         bigint generated always as identity primary key,
  kind       text not null check (kind in ('quote', 'photo')),
  quote_id   bigint references quotes(id) on delete cascade,   -- deleting a quote/photo
  photo_id   bigint references photos(id) on delete cascade,   -- also removes it from the queue
  position   bigint not null,
  created_at timestamptz not null default now(),
  check ((kind = 'quote' and quote_id is not null and photo_id is null)
      or (kind = 'photo' and photo_id is not null and quote_id is null))
);

-- Only you can see and change the queue. Tally can't read it, so what's coming stays a surprise.
alter table heart_queue enable row level security;
grant select, insert, update, delete on heart_queue to authenticated;
grant usage on all sequences in schema public to authenticated;
drop policy if exists "Admin manages queue" on heart_queue;
create policy "Admin manages queue" on heart_queue for all to authenticated using (true) with check (true);

-- use_heart now takes the next quote/photo from the queue first.
-- p_quote_id / p_photo_id are her page's random picks, used when that queue is empty.
-- A pinned quote or photo stays pinned and its queue waits.
create or replace function use_heart(p_quote_id bigint, p_photo_id bigint)
returns heart_state
language plpgsql
security definer
set search_path = public
as $$
declare
  st      heart_state;
  cfg     settings;
  today   int;
  item    heart_queue;
  final_q bigint := p_quote_id;
  final_p bigint := p_photo_id;
begin
  select * into cfg from settings where id = 1;
  today := (now() at time zone coalesce(cfg.her_timezone, 'Europe/Amsterdam'))::date - date '1970-01-01';

  select * into st from heart_state where id = 1 for update;
  if st.day <> today then
    st.used := 0;
  end if;
  if st.used >= cfg.hearts_per_day then
    raise exception 'No hearts left today';
  end if;

  if not (cfg.quote_mode = 'pinned' and cfg.pinned_quote_id is not null) then
    select * into item from heart_queue where kind = 'quote' order by position, id limit 1 for update skip locked;
    if found then
      final_q := item.quote_id;
      delete from heart_queue where id = item.id;
    end if;
  end if;

  if not (cfg.photo_mode = 'pinned' and cfg.pinned_photo_id is not null) then
    select * into item from heart_queue where kind = 'photo' order by position, id limit 1 for update skip locked;
    if found then
      final_p := item.photo_id;
      delete from heart_queue where id = item.id;
    end if;
  end if;

  update heart_state
     set day = today, used = st.used + 1, quote_id = final_q, photo_id = final_p, set_at = now()
   where id = 1
  returning * into st;
  return st;
end;
$$;

revoke all on function use_heart(bigint, bigint) from public;
grant execute on function use_heart(bigint, bigint) to anon, authenticated;
