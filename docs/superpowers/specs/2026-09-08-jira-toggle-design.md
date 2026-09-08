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

**Scheduler**: no change needed. `Scheduler.tick()` already swallows any
error `runSync()` throws (so one failed sync does not stop the schedule) —
`jiraNotConfigured()` is a 409, which the tick callback in `index.ts` already
turns into a thrown `Error` on any `>=400` response. A disabled toggle simply
means every tick's `POST /api/sync/run` 409s and is silently swallowed,
exactly like today's transient failures. No new code path.

**Card move / transition push** (`src/server/services/card-service.ts`):
`CardService`'s constructor already takes an optional `jira` bundle
(`{ transitions, mappings, links }`, present only when credentials exist).
Add `settings: SettingsRepository` to that bundle's type — this changes
nothing about the constructor's arity or its two existing call sites in
`tests/unit/conflict-freeze.test.ts` that omit the bundle entirely. Inside
`pushToJiraFirst`, after the existing `if (!this.jira) return null;` check,
read `await this.jira.settings.read()`; if `jiraEnabled` is `false`, return
`null` — exactly like today's "unmapped column" case: the move succeeds
locally, nothing is sent to Jira.

**`IterationService.current()`** (`src/server/services/iteration-service.ts`):
this already reads the full `Settings` object at the top of the method. Guard
the existing call to `readFromSource(...)` with `settings.jiraEnabled` — when
`false`, skip straight to `read = null`, which falls into the exact same
cached/estimated path the method already takes when the source fails or is
absent. **The banner keeps working**: it is a local feature (an estimated
iteration computed from `iterationAnchorDate`/`iterationCadenceDays`) that
happens to prefer a live Jira read when one is available — turning the
toggle off just removes that live read, the same as running with no
credentials at all today. No frontend change needed for the banner (see
below).

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

**`src/web/board/Board.tsx`**: only `<SyncStatusPill status={syncStatus}
onRefresh={...} />` changes — it renders only when `syncStatus?.configured`
is `true` (the `use-sync` hook already polls `GET /api/sync/status`, so no
new fetch is introduced). This replaces the existing "Jira not configured"
pill text with simply not rendering the pill — "no credentials" and "toggled
off" now look identical: no sync chrome at all. `<IterationBanner />` is
**unchanged** — it already renders nothing when `/api/iteration` has nothing
to show, and keeps rendering its estimated/cached iteration exactly as it
does today for an unconfigured install, whether that's because credentials
are absent or the toggle is off.

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

- Unit: `CardService`'s push-suppression, with a stub `jira` bundle whose
  `settings.read()` resolves `jiraEnabled: false`.
- Contract: extend `tests/contract/iteration-api.test.ts` with a case that
  sets `jiraEnabled: false` and asserts `FakeIterationAdapter.calls` stays
  `0` while the response still carries an estimated iteration.
- Acceptance (Gherkin): extend `tests/features/sync-status.feature` (toggle
  off behaves like "not configured", a sync request is refused) and
  `tests/features/push-transitions.feature` (a move performs no transition
  when the toggle is off despite a mapped column and a synced card).
- E2E: extend `tests/e2e/settings.spec.ts` with a case toggling "Enable Jira
  integration" off and confirming the JQL field and mapping editor hide.

**Test fixture note**: both `tests/features/steps/world.ts`'s
`SEEDED_SETTINGS` map and `tests/e2e/reset.ts`'s settings-restore `UPDATE`
already enumerate every setting explicitly, by design (their comments warn
that an un-enumerated setting leaks between scenarios/tests). Add
`jira.enabled: true` to both baselines, matching how those suites already
run with a fake Jira adapter configured — this keeps every existing
sync/transition/settings scenario and e2e test passing unchanged, and the
new toggle-off scenarios/tests explicitly flip it to `false` for their own
duration.
