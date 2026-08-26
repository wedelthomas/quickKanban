CREATE TABLE cards (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Only 'local' is created in slice 1. The column exists now because FR-010,
  -- FR-011 and FR-015 depend on it, and so slice 2 adds Jira cards without a
  -- migration.
  source      text NOT NULL DEFAULT 'local' CHECK (source IN ('local', 'jira')),

  -- FR-004 is enforced here as well as at the request boundary. A constraint
  -- that only lives in application code is a constraint one code path can skip.
  title       text NOT NULL CHECK (length(btrim(title)) > 0),

  description text,
  priority    text NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),

  -- Calendar date, no time component: overdue is a date comparison, which
  -- avoids the midnight-timezone trap a timestamp would introduce (FR-007).
  due_date    date,

  column_id   smallint NOT NULL REFERENCES columns (id),
  position    integer  NOT NULL,

  -- Unused in slice 1 and read by slice 4. Carried now so the archive arrives
  -- without migrating a database that by then holds the user's only copy of
  -- their ad-hoc cards. Recorded in plan.md's Complexity Tracking.
  archived_at timestamptz,

  -- Soft delete (FR-041). Deletion hides a card; it never erases it.
  deleted_at  timestamptz,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- The board query's access path: live cards, in column order.
CREATE INDEX cards_board_idx
  ON cards (column_id, position)
  WHERE deleted_at IS NULL AND archived_at IS NULL;
