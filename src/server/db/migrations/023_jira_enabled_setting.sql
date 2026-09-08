-- Master toggle for Jira integration, independent of whether credentials are
-- configured in the environment.
--
-- Credentials being present only means the board CAN reach Jira; this
-- decides whether it MAY. Every Jira touchpoint (the sync route, a card
-- move's transition push, the iteration banner's live read) checks this
-- setting before acting, so it takes effect on the next request with no
-- restart required.
--
-- Defaults to false: an existing deployment with valid credentials keeps
-- running exactly as it does today only if it explicitly turns this on.
INSERT INTO settings (key, value) VALUES ('jira.enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
