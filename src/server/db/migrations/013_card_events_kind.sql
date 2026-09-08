-- A second kind of history row: archival.
--
-- FR-317 requires archival to appear in the movement history with the system as
-- actor. But a card eligible for archival is ALREADY in Done — archival sets
-- archived_at, it does not change column_id — so the row that requirement asks
-- for has from_column_id = to_column_id, which the original constraint forbade.
--
-- The default is what makes this a no-backfill change: every existing row
-- already means what 'moved' says, and every existing writer keeps working
-- untouched. The constraint is not weakened for movements; it is scoped to
-- them, so FR-028's guarantee (a reorder within a column writes no row) still
-- holds exactly as before.

ALTER TABLE card_events
  ADD COLUMN kind text NOT NULL DEFAULT 'moved'
  CHECK (kind IN ('moved', 'archived'));

ALTER TABLE card_events DROP CONSTRAINT card_events_actual_move;

ALTER TABLE card_events ADD CONSTRAINT card_events_actual_move
  CHECK (kind <> 'moved' OR from_column_id <> to_column_id);

-- Answers the one question archival asks per candidate: when did this card most
-- recently arrive in Done. Also serves the summary's scan by period.
CREATE INDEX card_events_arrival_idx
  ON card_events (card_id, to_column_id, occurred_at DESC)
  WHERE kind = 'moved';
