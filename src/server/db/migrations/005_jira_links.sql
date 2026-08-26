-- The association between a card and a Jira issue, and the last-known state of
-- that issue.

CREATE TABLE jira_links (
  card_id         uuid PRIMARY KEY REFERENCES cards (id) ON DELETE CASCADE,

  -- Unique across the table: two cards must never claim one issue. This is
  -- what FR-111 (no duplicate card per issue) actually rests on — the upsert's
  -- ON CONFLICT is the mechanism, but this is the guarantee.
  issue_key       text NOT NULL UNIQUE,

  -- Jira's numeric id, which survives a project move where the key does not.
  issue_id        text NOT NULL,
  url             text NOT NULL,

  -- Last known. Written by slice 2, read by slice 3's three-way comparison.
  status_name     text NOT NULL,
  status_id       text NOT NULL,

  -- Jira's own `updated` value, never the local clock. The two machines'
  -- clocks are not guaranteed to agree, and a comparison against one that
  -- drifts would misreport what changed.
  jira_updated_at timestamptz NOT NULL,

  last_synced_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX jira_links_issue_key_idx ON jira_links (issue_key);
