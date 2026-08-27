-- The six columns change: Blocked leaves the board, Iteration Items takes its
-- place after Backlog. FR-401, FR-402, FR-446.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE BLOCKED ROW IS RETIRED, NOT DELETED. DO NOT "FINISH THE JOB" LATER.
--
-- card_events.from_column_id and card_events.to_column_id both REFERENCE
-- columns (id). Every movement a card has ever made into or out of Blocked
-- points at this row. Deleting it violates those foreign keys, and the history
-- is append-only (BR-31) so the rows cannot be repointed. The archive and every
-- report in slice 6 read that history.
--
-- Repurposing the row as Iteration Items would keep the keys valid and
-- retroactively rewrite the past: every "moved to Blocked" would render as
-- "moved to Iteration Items". Corrupting the record to save a migration step is
-- the worst trade available here.
--
-- A database that never used Blocked can delete the row without error — this
-- developer's own can, today. That is not a licence: the first user who had
-- parked a card there hits a foreign-key violation on upgrade. See research.md
-- R-1 and plan.md risk P-2.
-- ─────────────────────────────────────────────────────────────────────────────

-- Re-runnable: FR-407 requires a second application to change nothing, and
-- schema_migrations only guarantees that for the runner, not for a file applied
-- by hand or by a test.
ALTER TABLE columns ADD COLUMN IF NOT EXISTS retired_at timestamptz;

-- A retired column keeps no position, so it can never be ordered onto the board
-- by accident. That requires the column to be nullable.
ALTER TABLE columns ALTER COLUMN position DROP NOT NULL;

-- Phase 1 of the renumber. `position` is UNIQUE, so assigning the final order
-- directly would collide partway through; moving every live column out of the
-- way first keeps the constraint enforced throughout rather than deferring it.
UPDATE columns SET position = position + 100 WHERE retired_at IS NULL;

-- Retire Blocked. Guarded so a second run does not restamp retired_at.
UPDATE columns
   SET retired_at = now(), position = NULL
 WHERE key = 'blocked' AND retired_at IS NULL;

-- Iteration Items takes a NEW id. Reusing a retired one would make the history
-- ambiguous, which is the same objection as repurposing the row.
INSERT INTO columns (id, key, name, position)
VALUES (7, 'iteration_items', 'Iteration Items', NULL)
ON CONFLICT (id) DO NOTHING;

-- Phase 2: the final order. Absolute values, so this converges on a re-run.
UPDATE columns SET position = 1 WHERE key = 'backlog';
UPDATE columns SET position = 2 WHERE key = 'iteration_items';
UPDATE columns SET position = 3 WHERE key = 'in_progress';
UPDATE columns SET position = 4 WHERE key = 'test';
UPDATE columns SET position = 5 WHERE key = 'po_review';
UPDATE columns SET position = 6 WHERE key = 'done';
