-- Run this once if the page shows "permission denied for table quotes".
-- (Already included in setup.sql — this is only for a database you set up before that fix.)
-- It does NOT delete anything.

grant usage on schema public to anon, authenticated;
grant select on quotes, photos, settings to anon, authenticated;
grant insert, update, delete on quotes, photos, settings to authenticated;
grant usage on all sequences in schema public to authenticated;
