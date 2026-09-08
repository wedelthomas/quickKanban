-- How many conflicts a sync raised.
--
-- The other counts on this row answer "what did that sync do"; without this one
-- the single outcome an operator most wants to see after the fact — the board
-- and Jira disagreeing — is the only one the run does not record.
ALTER TABLE sync_runs ADD COLUMN conflicts_raised integer NOT NULL DEFAULT 0;
