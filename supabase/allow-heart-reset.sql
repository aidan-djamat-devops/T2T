-- Lets you (signed in as Aidan) give Tally her hearts back for today.
-- Run once in Supabase → SQL Editor. Does NOT delete anything, safe to run again.
-- (Already included in setup.sql for new databases.)

grant update on heart_state to authenticated;
drop policy if exists "Admin resets hearts" on heart_state;
create policy "Admin resets hearts" on heart_state for update to authenticated using (true) with check (true);
