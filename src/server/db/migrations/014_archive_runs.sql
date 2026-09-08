-- What each archival pass did.
--
-- Shaped like sync_runs because it answers the same question about a different
-- unattended process. This is the first thing in the system that changes the
-- board without a user or Jira asking, and slice 3's live check found an
-- unrequested Jira write ONLY because a log existed to find it in. An
-- unattended process with no durable record is where the next such defect hides.

CREATE TABLE archive_runs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  started_at  timestamptz NOT NULL DEFAULT now(),

  -- Null while running, which is also how "a pass is in progress" is answered.
  finished_at timestamptz,

  outcome     text CHECK (outcome IN ('succeeded', 'failed')),

  considered  integer NOT NULL DEFAULT 0,
  archived    integer NOT NULL DEFAULT 0,

  -- Cards past the window left alone because a conflict is open on them
  -- (FR-318a). Counted separately because "archived: 0" alone cannot
  -- distinguish "nothing was due" from "something was due and I refused", and
  -- only one of those wants investigating.
  skipped_conflicted integer NOT NULL DEFAULT 0,

  CONSTRAINT archive_runs_finished_has_outcome
    CHECK ((finished_at IS NULL) = (outcome IS NULL))
);

-- At most one pass in flight: the database's expression of single-flight,
-- independent of the in-process guard.
CREATE UNIQUE INDEX archive_runs_one_in_flight
  ON archive_runs ((finished_at IS NULL))
  WHERE finished_at IS NULL;

CREATE INDEX archive_runs_recent_idx ON archive_runs (started_at DESC);
