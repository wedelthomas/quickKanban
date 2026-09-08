-- The commitment snapshot. FR-525, FR-526, FR-547.
--
-- Taken once, the first time an iteration's ordinal is observed, and never
-- updated afterward — the same write-once shape `iterations` itself and
-- `carried_iterations` already use for boundary-triggered state. This is
-- deliberately NOT derived from Jira sprint membership: Jira moves
-- unfinished issues out of a sprint when it closes, which would make
-- completion look total in every iteration if commitment were read from
-- there instead of from this board's own columns at the moment observed.
CREATE TABLE iteration_commitments (
  ordinal_name     text PRIMARY KEY REFERENCES iterations (ordinal_name),
  committed_points integer NOT NULL CHECK (committed_points >= 0),
  committed_at     timestamptz NOT NULL DEFAULT now()
);
