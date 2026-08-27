-- Blocked stops being a place a card goes and becomes something it carries.
-- FR-403, FR-404, FR-405, FR-406, FR-409.
--
-- This is the one destructive step in slice 5: it moves live cards. Every
-- statement below is re-runnable, because FR-407 requires a second application
-- to change nothing and because a test applies this file directly.
--
-- Empirical basis for the whole restructure: TradeStation's own Jira models
-- blocked as a field (customfield_10003) set on issues whose status is
-- Development, Test or Open — orthogonal to status, exactly as here.

ALTER TABLE cards ADD COLUMN IF NOT EXISTS blocked boolean NOT NULL DEFAULT false;

-- The history row is written BEFORE the move, while from/to are still true.
-- FR-405 requires the migration to appear in the movement history attributed to
-- the system rather than to the user, who did not do this.
--
-- from_column_id <> to_column_id, so card_events_actual_move is satisfied and
-- this is a legitimate 'moved' row rather than a second kind of record.
INSERT INTO card_events (card_id, from_column_id, to_column_id, actor, kind)
SELECT c.id, c.column_id, (SELECT id FROM columns WHERE key = 'in_progress'), 'system', 'moved'
  FROM cards c
  JOIN columns col ON col.id = c.column_id
 WHERE col.key = 'blocked';

-- To In Progress, never Backlog: Backlog would discard the fact that the work
-- is in flight, which is the one thing the Blocked column did record.
--
-- FR-406: this includes cards carrying an unresolved conflict. Slice 3 freezes
-- such a card against moves, but that rule governs USER moves; leaving them
-- behind would strand them in a column that no longer exists. The conflict row
-- itself is untouched.
UPDATE cards
   SET blocked = true,
       column_id = (SELECT id FROM columns WHERE key = 'in_progress'),
       updated_at = now()
 WHERE column_id = (SELECT id FROM columns WHERE key = 'blocked');

-- Cards arriving in In Progress keep their old positions, which may now
-- duplicate. cards.position carries no unique constraint and the board orders
-- by (column_id, position), so duplicates are a display-order question rather
-- than an integrity one — but an arbitrary order is still worse than a stable
-- one. Renumber by (position, id) so the result is deterministic.
WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY position, id) AS rn
    FROM cards
   WHERE column_id = (SELECT id FROM columns WHERE key = 'in_progress')
     AND deleted_at IS NULL
     AND archived_at IS NULL
)
UPDATE cards c SET position = ordered.rn
  FROM ordered
 WHERE c.id = ordered.id AND c.position IS DISTINCT FROM ordered.rn;

-- FR-409: the retired column's mapping goes; every other mapping survives.
DELETE FROM column_status_mappings
 WHERE column_id = (SELECT id FROM columns WHERE key = 'blocked');
