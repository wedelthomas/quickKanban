-- citext gives case-insensitive uniqueness in the column's own type, so
-- "Ops", "ops " and "ops" cannot fork into three tags no matter which query
-- inserts them. The alternative -- a unique index on lower(name) -- works too,
-- but pushes case folding into every call site.
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE tags (
  id   integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name citext NOT NULL UNIQUE
);

CREATE TABLE card_tags (
  card_id uuid    NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
  tag_id  integer NOT NULL REFERENCES tags (id) ON DELETE RESTRICT,
  PRIMARY KEY (card_id, tag_id)
);
