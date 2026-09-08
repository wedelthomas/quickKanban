-- Configuration for the iteration, the working calendar, and the Jira field
-- identifiers. FR-437, FR-438, FR-439.
--
-- Every default below was verified live against yourcompany.atlassian.net while
-- writing BRD v2; see its Appendix A. Board 4200 is Anchor Team, whose
-- active sprint is dated. The team name matters because that board is shared by
-- two teams and carries two active sprints per iteration with identical dates —
-- without it, the banner could show another team's name (FR-424, FR-445).
--
-- Four of these are written here and read by NOBODY in slice 5:
-- working.start_hour, working.end_hour, jira.field.sprint and
-- jira.field.story_points are consumed by slice 6. They are seeded now because
-- their values are verified today, which saves a second migration against this
-- table for facts already known. working.days IS consumed here, by the banner's
-- remaining-days count.
--
-- No credential appears here and none may: 007_settings.sql's standing rule is
-- that the simplest way to keep the interface from leaking one is for there to
-- be nowhere to put it.
INSERT INTO settings (key, value) VALUES
  ('iteration.board_id',        '4200'::jsonb),
  ('iteration.team_name',       '"Anchor Team"'::jsonb),
  ('iteration.anchor_date',     '"2026-08-24"'::jsonb),
  ('iteration.cadence_days',    '14'::jsonb),
  ('working.days',              '["mon","tue","wed","thu","fri"]'::jsonb),
  ('working.start_hour',        '9'::jsonb),
  ('working.end_hour',          '17'::jsonb),
  ('jira.field.blocked',        '"customfield_10003"'::jsonb),
  ('jira.field.blocked_option', '"Blocked"'::jsonb),
  ('jira.field.sprint',         '"customfield_10000"'::jsonb),
  ('jira.field.story_points',   '"customfield_10005"'::jsonb)
ON CONFLICT (key) DO NOTHING;
