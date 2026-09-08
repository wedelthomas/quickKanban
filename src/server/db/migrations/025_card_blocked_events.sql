-- The blocked-interval log. FR-505, FR-548.
--
-- `blocked` has always been current-only state (slice 5): the board never
-- recorded when it changed, only what it is now. This table starts doing
-- that from here forward. A card's blocked history from before this table
-- existed cannot be reconstructed — FR-548 requires such a card's elapsed
-- time to be reported as an upper bound rather than a fabricated exact
-- figure, and this table is the reason that distinction exists at all.
--
-- Append-only, same ON DELETE RESTRICT shape as card_events: a card's
-- history outlives the card (soft delete), so the reference must stay
-- valid rather than dangling.
CREATE TABLE card_blocked_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  card_id     uuid NOT NULL REFERENCES cards (id) ON DELETE RESTRICT,
  blocked     boolean NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX card_blocked_events_card_idx ON card_blocked_events (card_id, id);
