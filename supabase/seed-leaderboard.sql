-- Seed the leaderboard with 15 fake scores for testing.
-- Run this in the Supabase SQL editor.
-- Top score is 500. Scores are spread across three time windows so all
-- three tabs (Daily / Weekly / All-Time) have distinct content.
--
-- Rerunnable: uncomment the `delete` line to wipe existing rows first.

-- delete from public.leaderboard;

insert into public.leaderboard (initials, score, rank, created_at) values
  -- Within last 24h → visible on Daily, Weekly, and All-Time
  ('MUG', 500, 'S', now() - interval '2 hours'),
  ('TUX', 395, 'A', now() - interval '5 hours'),
  ('PAW', 320, 'B', now() - interval '11 hours'),
  ('REX', 180, 'D', now() - interval '18 hours'),
  ('ZOE',  60, 'F', now() - interval '23 hours'),

  -- 2–6 days ago → visible on Weekly + All-Time (not Daily)
  ('BEN', 475, 'S', now() - interval '2 days'),
  ('NEO', 420, 'A', now() - interval '3 days'),
  ('LEO', 290, 'B', now() - interval '4 days'),
  ('KAI', 215, 'C', now() - interval '5 days'),
  ('IVY', 150, 'D', now() - interval '6 days'),

  -- 8–30 days ago → visible on All-Time only
  ('DIA', 450, 'S', now() - interval '9 days'),
  ('MEL', 360, 'B', now() - interval '14 days'),
  ('ACE', 250, 'C', now() - interval '18 days'),
  ('FOX', 120, 'F', now() - interval '25 days'),
  ('JET',  85, 'F', now() - interval '30 days');
