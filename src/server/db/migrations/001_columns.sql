-- The six stages of work. Seeded here and never written at runtime: FR-002
-- forbids adding, renaming, reordering or removing a column, so no code path
-- exists that touches this table after migration.

CREATE TABLE columns (
  id       smallint PRIMARY KEY,
  key      text     NOT NULL UNIQUE,
  name     text     NOT NULL,
  position smallint NOT NULL UNIQUE
);

INSERT INTO columns (id, key, name, position) VALUES
  (1, 'backlog',     'Backlog',     1),
  (2, 'in_progress', 'In Progress', 2),
  (3, 'blocked',     'Blocked',     3),
  (4, 'test',        'Test',        4),
  (5, 'po_review',   'PO Review',   5),
  (6, 'done',        'Done',        6);
