# Phase 1 Data Model — Slice 5

Six migrations, `016` through `021`. No entity is removed; one is retired.

---

## 016 — Retire the Blocked column, add Iteration Items

Carries R-1 through R-4. Runs as one transaction.

```sql
ALTER TABLE columns ADD COLUMN retired_at timestamptz;
ALTER TABLE columns ALTER COLUMN position DROP NOT NULL;

-- Phase 1 of R-3: move every live position out of the way.
UPDATE columns SET position = position + 100 WHERE retired_at IS NULL;

-- Retire Blocked. The row survives because card_events references it (R-1).
UPDATE columns SET retired_at = now(), position = NULL WHERE id = 3;

INSERT INTO columns (id, key, name, position)
  VALUES (7, 'iteration_items', 'Iteration Items', NULL);

-- Phase 2 of R-3: final order.
UPDATE columns SET position = 1 WHERE id = 1;  -- Backlog
UPDATE columns SET position = 2 WHERE id = 7;  -- Iteration Items
UPDATE columns SET position = 3 WHERE id = 2;  -- In Progress
UPDATE columns SET position = 4 WHERE id = 4;  -- Test
UPDATE columns SET position = 5 WHERE id = 5;  -- PO Review
UPDATE columns SET position = 6 WHERE id = 6;  -- Done
```

A retired column keeps `position NULL`, so it can never be ordered onto the
board by accident.

---

## 017 — Blocked as a card attribute, and the migration of existing blocked cards

Carries FR-403, FR-404, FR-405, FR-406.

```sql
ALTER TABLE cards ADD COLUMN blocked boolean NOT NULL DEFAULT false;

-- FR-405: every migrated card gets a history row, actor 'system'.
-- Written BEFORE the move so the from/to values are still true.
INSERT INTO card_events (card_id, from_column_id, to_column_id, actor, kind)
  SELECT id, 3, 2, 'system', 'moved'
  FROM cards
  WHERE column_id = 3;

-- FR-404: to In Progress, never Backlog. FR-406: conflicted cards included —
-- the freeze is a rule about user moves, and this is not one.
UPDATE cards SET blocked = true, column_id = 2, updated_at = now()
  WHERE column_id = 3;

-- FR-409: the retired column's status mapping goes; the others are untouched.
DELETE FROM column_status_mappings WHERE column_id = 3;
```

`card_events_actual_move` is satisfied: `from_column_id` 3 and `to_column_id` 2
differ, so the row is a legitimate `moved`.

**Idempotence (FR-407).** After this runs, no card has `column_id = 3`, so both
statements match zero rows on a second run and write nothing.

**Position collisions.** Cards arriving in In Progress keep their existing
`position` values, which may now duplicate. `cards.position` carries no unique
constraint (`002_cards.sql`), and the board orders by `(column_id, position)`,
so duplicates are a display-order question, not an integrity one. The migration
renumbers In Progress by `(position, id)` to make the resulting order stable
rather than arbitrary.

---

## 018 — Jira's opinion of blocked

Carries FR-416, FR-418, FR-419.

```sql
ALTER TABLE jira_links ADD COLUMN blocked_in_jira boolean;
```

NULL means "never observed" — distinct from `false`, "observed as not blocked".
Divergence is `cards.blocked <> jira_links.blocked_in_jira` and is only
meaningful once the value is non-null.

---

## 019 — The iteration

Carries FR-421, FR-426, FR-427, and R-9.

```sql
CREATE TABLE iterations (
  ordinal_name text PRIMARY KEY,
  starts_on    date NOT NULL,
  ends_on      date NOT NULL,
  source       text NOT NULL CHECK (source IN ('read', 'estimated')),
  observed_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT iterations_span CHECK (ends_on > starts_on)
);

CREATE INDEX iterations_current_idx ON iterations (starts_on DESC);
```

`source` records provenance so FR-427 can mark anything not freshly read. A
row's age against `observed_at` is what makes it "cached" rather than fresh;
there is no third value, because cached and read differ in *when*, not in
*where from*.

---

## 020 — Carry-over

Carries FR-436, FR-444, and R-10.

```sql
ALTER TABLE cards ADD COLUMN carried_iterations integer NOT NULL DEFAULT 0
  CHECK (carried_iterations >= 0);
ALTER TABLE cards ADD COLUMN iteration_seen text;
```

`iteration_seen` holds the ordinal name the card was last observed under.
`carried_iterations` is displayed only when greater than zero (FR-436's
"has carried" reading).

---

## 021 — Settings

Carries FR-437, FR-438, FR-439. Values are chosen from Appendix A of
`docs/brd-2.md`, every one verified live.

```sql
INSERT INTO settings (key, value) VALUES
  ('iteration.board_id',        '1391'::jsonb),
  ('iteration.team_name',       '"CRM TradeBlazers"'::jsonb),
  ('iteration.anchor_date',     '"2026-08-24"'::jsonb),
  ('iteration.cadence_days',    '14'::jsonb),
  ('working.days',              '["mon","tue","wed","thu","fri"]'::jsonb),
  ('working.start_hour',        '9'::jsonb),
  ('working.end_hour',          '17'::jsonb),
  ('jira.field.blocked',        '"customfield_10003"'::jsonb),
  ('jira.field.blocked_option', '"Blocked"'::jsonb),
  ('jira.field.sprint',         '"customfield_10000"'::jsonb),
  ('jira.field.story_points',   '"customfield_10005"'::jsonb);
```

`working.start_hour` and `working.end_hour` are written here but read by nobody
in this slice — Slice 6 consumes them (`specs/006-time-points-and-reporting/spec.md`,
FR-504). `working.days` **is** consumed
here, by the banner's remaining-days count (FR-431). `jira.field.sprint` and
`jira.field.story_points` are likewise carried now and consumed later; seeding
them in the same migration avoids a settings migration in Slice 6 for values
already verified today.

No credential appears here, and none may (`007_settings.sql`'s standing rule).

---

## Entity summary

| Entity | Change |
|---|---|
| `columns` | `retired_at` added; `position` nullable; Blocked retired; Iteration Items added as id 7 |
| `cards` | `blocked`, `carried_iterations`, `iteration_seen` added; blocked-column cards moved to In Progress |
| `card_events` | No shape change. Gains one `system`-attributed row per migrated card. |
| `column_status_mappings` | The retired column's row removed |
| `jira_links` | `blocked_in_jira` added |
| `iterations` | New |
| `settings` | Eleven rows added |
