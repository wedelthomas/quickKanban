-- A disagreement between the board and Jira on one card.
--
-- Its own table rather than a flag, because a conflict has content: what each
-- side said, when, and how it was settled. A boolean cannot answer the only
-- question the resolution screen asks.

CREATE TABLE conflicts (
  id                       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  card_id                  uuid NOT NULL REFERENCES cards (id) ON DELETE RESTRICT,

  board_column_id          smallint NOT NULL REFERENCES columns (id),
  jira_status_at_detection text NOT NULL,

  -- Updated in place when Jira moves again (FR-234), so the resolution screen
  -- shows what Jira says now rather than what it said when the disagreement
  -- was first noticed.
  jira_status_current      text NOT NULL,

  raised_at                timestamptz NOT NULL DEFAULT now(),
  resolved_at              timestamptz,
  resolution               text CHECK (resolution IN ('kept_board', 'accepted_jira', 'moot')),

  CONSTRAINT conflicts_resolved_has_resolution
    CHECK ((resolved_at IS NULL) = (resolution IS NULL))
);

-- At most one open conflict per card. FR-234 says a second detection updates
-- the existing one; this makes that the only possibility rather than a rule
-- someone has to remember.
CREATE UNIQUE INDEX conflicts_one_open_per_card
  ON conflicts (card_id) WHERE resolved_at IS NULL;

CREATE INDEX conflicts_open_idx ON conflicts (resolved_at) WHERE resolved_at IS NULL;
