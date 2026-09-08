-- How long finished work stays on the board, and how often that is checked.
--
-- Zero is a valid window and means "at the next pass" — the spec calls that
-- permitted and the user's choice, so nothing here forbids it.

INSERT INTO settings (key, value) VALUES
  ('archive.window_days', '7'::jsonb),
  ('archive.interval_seconds', '3600'::jsonb);
