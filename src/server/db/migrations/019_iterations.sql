-- The current iteration, as last established. FR-421, FR-426, FR-427.
--
-- Its own table rather than a settings row: the iteration is not
-- user-adjustable configuration, it is observed state with provenance, and
-- slice 6's reports need the history of them rather than only the current one.
CREATE TABLE IF NOT EXISTS iterations (
  -- The ordinal name as the source reported it, e.g. "Anchor Team 2026
  -- S18". Never computed: the ordinal resets at the fiscal year (observed in
  -- the PI calendar as "Sprint 20 - 1"), so counting forward is wrong every
  -- January. FR-423.
  ordinal_name text PRIMARY KEY,

  starts_on    date NOT NULL,
  ends_on      date NOT NULL,

  -- How this row was established. 'cached' is not a value here: a cached
  -- iteration is a 'read' row consulted later, so provenance at display time is
  -- a function of this plus observed_at. FR-427.
  source       text NOT NULL CHECK (source IN ('read', 'estimated')),

  observed_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT iterations_span CHECK (ends_on > starts_on)
);

-- The one question the banner asks: which iteration covers now.
CREATE INDEX IF NOT EXISTS iterations_current_idx ON iterations (starts_on DESC);
