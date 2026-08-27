-- Whose board this is.
--
-- The page heading said QUICK KANBAN, which names the tool rather than the
-- person — fine on one screen, less so when the board is being shown to someone
-- else. Empty is the default and means "fall back to the product name", so an
-- unconfigured board reads exactly as it did before.
--
-- Not derived from JIRA_EMAIL: that is a credential-adjacent value, and this is
-- a display string the user should be able to set to whatever they like.
INSERT INTO settings (key, value) VALUES ('board.author', '""'::jsonb)
ON CONFLICT (key) DO NOTHING;
