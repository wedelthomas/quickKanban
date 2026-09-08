# Design: Jira integration master toggle

## Problem

The board already degrades gracefully when Jira credentials (`JIRA_BASE_URL`,
`JIRA_EMAIL`, `JIRA_API_TOKEN`) are absent from the environment — it shows a
"Jira not configured" pill and runs on ad-hoc cards only. That is not what is
being asked for here: the credential presence and the on/off decision are the
same variable today, and there is no way to disable Jira integration at
runtime independent of whether credentials exist. This adds an explicit
Settings-UI toggle, persisted in the database, that gates every Jira
touchpoint regardless of credential state.

## Scope

- A new `jiraEnabled` setting (default `false`), editable from the Settings
  dialog.
- Every place the server would otherwise call out to Jira, or the client
  would otherwise render Jira-specific UI, checks this setting.
- No change to how credentials are read (still env-only, still read once at
  process start) and no change to already-imported Jira cards' badges/links.

## Data model

New settings key, following the existing pattern in
`021_iteration_settings.sql` / `022_author_setting.sql`:

```sql
-- src/server/db/migrations/023_jira_enabled_setting.sql
INSERT INTO settings (key, value) VALUES
  ('jira.enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
```

`src/shared/types.ts`: `Settings` gains `jiraEnabled: boolean`.

`src/server/repositories/settings-repository.ts`:
- `KEYS.jiraEnabled = 'jira.enabled'`
- `read()`: `jiraEnabled: Boolean(byKey.get(KEYS.jiraEnabled) ?? false)`
- `write()`: add `'jiraEnabled'` to the uniform field list (same pattern as
  `iterationBoardId` etc.)

`src/server/routes/settings.ts`: Zod schema gains
`jiraEnabled: z.boolean().optional()`.

## Backend gating

Credentials and adapter construction in `src/server/index.ts` are **unchanged** —
`jira`/`iterations` are still built once at startup from env, or `null` if
absent. The new setting is a runtime gate checked at each usage site via the
already-injected `SettingsRepository`, so flipping it in Settings takes effect
on the next request/tick with no restart required.

**`POST /api/sync/run`** (`src/server/routes/sync.ts`): before running,
read `jiraEnabled`; if `false`, throw `jiraNotConfigured()` — the same
response already used when `deps.sync === null`. This unifies "no
credentials" and "toggled off" into one response the frontend already knows
how to handle.

**`GET /api/sync/status`**: `configured` becomes
`deps.sync !== null && (await settings.read()).jiraEnabled`. This field
becomes the single signal the frontend uses to decide whether to render any
Jira UI at all (see Frontend section).

**Scheduler** (`src/server/sync/scheduler.ts` usage in `index.ts`): the tick
callback currently does `app.inject({ method: 'POST', url: '/api/sync/run' })`
and throws on a >=400 response. Add a check before injecting: read
`jiraEnabled` via the existing `settings` reference in scope; if `false`,
return without injecting (a silent no-op tick), so a disabled toggle does not
produce a stream of "not configured" errors in logs.

**Card move / transition push** (`src/server/services/card-service.ts`,
which holds the injected `TransitionService` — see its `transitions:
TransitionService` dependency): before invoking the transition push on a
move, check `jiraEnabled`. If `false`, treat the move exactly like today's
"unmapped column" case — the move succeeds locally, nothing is sent to Jira.

**`IterationService.resolve()`** (`src/server/services/iteration-service.ts`):
check `jiraEnabled` before calling `this.source.listActiveSprints(...)`. If
`false`, skip the call and fall into the existing cached/estimated fallback
path exactly as if the source had failed — no new fallback logic needed.

**Mappings and conflicts routes**: unchanged. They stay harmless to read/edit
even when the toggle is off, and the frontend will not surface their UI in
that state anyway (see below), so no server-side gating is added there.

## Frontend behavior

**`src/web/settings/SettingsDialog.tsx`**: add an "Enable Jira integration"
checkbox bound to `settings.jiraEnabled`, saved through the existing
`PUT /api/settings` flow. The JQL query fieldset and the `MappingEditor`
section render only when `settings.jiraEnabled` is `true` — unchecking the
box in the open dialog hides them immediately (client-side conditional,
before save).

**`src/web/board/Board.tsx`**: `<IterationBanner />` and
`<SyncStatusPill status={syncStatus} onRefresh={...} />` render only when
`syncStatus?.configured` is `true` (the `use-sync` hook already polls
`GET /api/sync/status`, so no new fetch is introduced). This replaces the
existing "Jira not configured" pill text with simply not rendering the pill —
"no credentials" and "toggled off" now look identical to the user: no Jira
surface at all.

**`src/web/sync/SyncStatus.tsx`**: the `state === 'unconfigured'` branch and
its message become dead code once `Board.tsx` only renders the pill when
configured; remove that branch rather than leave it unreachable.

**Card faces** (`src/web/board/CardView.tsx`): unchanged. Already-imported
Jira cards keep their issue-key badge and link regardless of the toggle —
they are historical/reference data, not live sync state.

## Compatibility note

Because the setting defaults to `false`, this is a behavior change for any
existing deployment currently running with valid Jira credentials: sync stops
until the toggle is switched on in Settings. This should be called out
explicitly in the PR description and, if relevant, the README.

## Testing

- Unit: `SettingsRepository` read/write round-trips `jiraEnabled`.
- Contract: `POST /api/sync/run` and `GET /api/sync/status` behave
  identically whether `jiraEnabled` is `false` or credentials are absent.
- Acceptance (Gherkin): a scenario toggling `jiraEnabled` off mid-session
  confirms sync stops, the pill/banner disappear, and a card move no longer
  pushes a transition — mirroring the existing "Jira not configured"
  scenarios but driven by the setting instead of missing env vars.
- E2E: Settings dialog checkbox toggles the JQL/mapping section's visibility.
