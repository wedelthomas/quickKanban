-- Work that has slipped from one iteration to the next. FR-435, FR-436, FR-444.
--
-- Counted at the boundary rather than derived on read: deriving it would mean
-- replaying the movement history against the iteration calendar for every card
-- on every board load, and FR-429 forbids anything that delays board load.
ALTER TABLE cards ADD COLUMN IF NOT EXISTS carried_iterations integer NOT NULL DEFAULT 0
  CONSTRAINT cards_carried_non_negative CHECK (carried_iterations >= 0);

-- The ordinal name the card was last observed under. A change here is what
-- triggers the increment.
ALTER TABLE cards ADD COLUMN IF NOT EXISTS iteration_seen text;
