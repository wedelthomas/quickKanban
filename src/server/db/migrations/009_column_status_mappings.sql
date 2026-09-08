-- Which Jira status each board column means.
--
-- A column with NO row here is local-only (FR-207). That absence is the
-- mechanism, not a gap: most Jira workflows have no "Blocked" status, so the
-- Blocked column exists on the board without lying to Jira about it.

CREATE TABLE column_status_mappings (
  column_id   smallint PRIMARY KEY REFERENCES columns (id),

  -- Matched against a transition's DESTINATION status, never against the
  -- transition's own name. Verified against yourcompany.atlassian.net: the
  -- transition "To Development" leads to the status "Development", and "Pass"
  -- leads to "PO Approve". Matching by transition name would fail on both.
  status_name text NOT NULL
);

-- Seeded from the statuses this Jira actually exposes. Blocked is deliberately
-- absent: the workflow has a Blocked status, but leaving the column unmapped
-- until the user asks for it keeps the default honest about what it knows.
INSERT INTO column_status_mappings (column_id, status_name) VALUES
  (1, 'Open'),
  (2, 'Development'),
  (4, 'Test'),
  (5, 'PO Approve');
