CREATE TABLE sync_runs (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  started_at   timestamptz NOT NULL DEFAULT now(),

  -- Null while running, which is also how "a sync is in progress" is answered.
  finished_at  timestamptz,

  outcome      text CHECK (outcome IN ('succeeded', 'failed')),

  -- FR-136 requires rejected credentials to read differently from a
  -- connectivity failure, so the distinction is stored rather than only
  -- phrased at the point of display.
  failure_kind text CHECK (
    failure_kind IN ('credentials', 'connectivity', 'rate_limit', 'malformed')
  ),

  issues_seen  integer NOT NULL DEFAULT 0,
  created      integer NOT NULL DEFAULT 0,
  updated      integer NOT NULL DEFAULT 0,
  archived     integer NOT NULL DEFAULT 0,
  restored     integer NOT NULL DEFAULT 0,

  -- A finished run has an outcome; a running one has neither outcome nor
  -- failure kind. Keeps a half-written row from reading as a real result.
  CONSTRAINT sync_runs_finished_has_outcome
    CHECK ((finished_at IS NULL) = (outcome IS NULL)),
  CONSTRAINT sync_runs_failure_kind_only_on_failure
    CHECK (failure_kind IS NULL OR outcome = 'failed')
);

-- At most one unfinished run at any time: the database's expression of the
-- single-flight rule, independent of the in-process lock. If the app is ever
-- scaled to two instances, this is what catches it.
CREATE UNIQUE INDEX sync_runs_one_in_flight
  ON sync_runs ((finished_at IS NULL))
  WHERE finished_at IS NULL;

CREATE INDEX sync_runs_recent_idx ON sync_runs (started_at DESC);
