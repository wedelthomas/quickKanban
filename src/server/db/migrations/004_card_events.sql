-- The append-only movement history (FR-026, FR-027).
--
-- ON DELETE RESTRICT on card_id is deliberate and depends on deletion being
-- soft: FR-029 requires history to outlive its card, and because the row
-- survives a delete, the reference stays valid rather than dangling.

CREATE TABLE card_events (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  card_id        uuid     NOT NULL REFERENCES cards (id) ON DELETE RESTRICT,
  from_column_id smallint NOT NULL REFERENCES columns (id),
  to_column_id   smallint NOT NULL REFERENCES columns (id),

  -- Only 'user' is written in slice 1. 'sync' arrives with Jira in slice 2,
  -- 'system' with automatic archival in slice 4.
  actor          text NOT NULL CHECK (actor IN ('user', 'sync', 'system')),

  occurred_at    timestamptz NOT NULL DEFAULT now(),

  -- A reorder within a column writes no row (FR-028), so an event always
  -- represents a genuine column change.
  CONSTRAINT card_events_actual_move CHECK (from_column_id <> to_column_id)
);

CREATE INDEX card_events_card_idx ON card_events (card_id, id);
