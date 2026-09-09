-- Slice 7 — cancelling a story. FR-601 through FR-640.
--
-- Cancellation reuses the archive's own retention path (archived_at) rather
-- than inventing a second one: it is what already takes a card off the
-- board query and into archiveByRange's result. These three columns exist
-- only to say WHY a card left, and to remember where to put it back
-- (research.md R-1, R-2).
ALTER TABLE cards ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS cancellation_reason text;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS cancelled_from_column_id integer
  REFERENCES columns(id);

-- A second and third kind of history row, alongside 'moved' and 'archived'
-- (migration 013). Both carry from_column_id = to_column_id, the same shape
-- 'archived' already uses — cancelling and restoring do not move the card,
-- kind carries the meaning (FR-607).
ALTER TABLE card_events DROP CONSTRAINT card_events_kind_check;
ALTER TABLE card_events ADD CONSTRAINT card_events_kind_check
  CHECK (kind IN ('moved', 'archived', 'cancelled', 'restored'));
