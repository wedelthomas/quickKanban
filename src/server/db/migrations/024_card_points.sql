-- Story points. FR-515, FR-516, FR-517, FR-518, FR-519.
--
-- Two columns rather than one, deliberately: FR-518 requires the local
-- value in use AND its divergence from the imported value to be visible at
-- once, the same shape blocked/blockedDivergesFromJira already established
-- in slice 5 for the one other locally-overridable, Jira-sourced field.
--
-- points is the authoritative value (never Jira's). NULL means unpointed
-- (FR-519); 0 is a deliberate estimate and is distinct from NULL.
-- jira_points is written only by sync, and never written back to Jira
-- (FR-517) — nothing in the sync path ever sends it anywhere.
ALTER TABLE cards ADD COLUMN IF NOT EXISTS points integer
  CONSTRAINT cards_points_non_negative CHECK (points IS NULL OR points >= 0);
ALTER TABLE cards ADD COLUMN IF NOT EXISTS jira_points integer
  CONSTRAINT cards_jira_points_non_negative CHECK (jira_points IS NULL OR jira_points >= 0);
