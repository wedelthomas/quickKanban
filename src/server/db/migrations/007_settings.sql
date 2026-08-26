-- User-adjustable configuration. Deliberately holds nothing that
-- authenticates: FR-102 forbids the interface from displaying or accepting a
-- credential, and the simplest way to keep that true is for there to be
-- nowhere to put one.

CREATE TABLE settings (
  key   text PRIMARY KEY,
  value jsonb NOT NULL
);

INSERT INTO settings (key, value) VALUES
  ('jira.jql', '"assignee = currentUser() AND statusCategory != Done"'::jsonb),
  ('sync.interval_seconds', '300'::jsonb);
