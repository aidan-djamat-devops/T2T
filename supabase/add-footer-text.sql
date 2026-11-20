-- Adds the editable little text under the ♥ ("thinking of you").
-- Run once in Supabase → SQL Editor. Does NOT delete anything.
-- (Already included in setup.sql for new databases.)

alter table settings add column if not exists footer_text text not null default 'thinking of you';
