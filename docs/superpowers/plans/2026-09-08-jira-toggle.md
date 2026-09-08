# Jira Integration Master Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `jiraEnabled` setting, editable from the Settings dialog and persisted in the database, that gates every Jira touchpoint (sync, transition push, live iteration read) independent of whether Jira credentials are configured in the environment.

**Architecture:** Credentials and adapter construction stay exactly as they are today (env-only, read once at process start in `src/server/index.ts`). The new setting is a runtime gate read via the already-injected `SettingsRepository` at each of four call sites: the sync route, `CardService`'s transition push, `IterationService`'s live read, and the Settings dialog's own field visibility. No new services, no new architecture — this is entirely about adding one more condition to existing decision points.

**Tech Stack:** TypeScript, Fastify, PostgreSQL (raw SQL migrations), React, Vitest (unit/contract), cucumber-js (acceptance), Playwright (e2e).

## Global Constraints

- Spec doc: `docs/superpowers/specs/2026-09-08-jira-toggle-design.md` — read it before starting; it explains why the iteration banner is *not* gated the same way as the sync pill.
- The setting defaults to `false` — a deliberate behavior change for any deployment currently running with valid Jira credentials.
- Credentials remain env-only; this feature never touches `src/server/jira/credentials.ts`.
- `IterationBanner` must keep rendering its estimated/cached iteration when the toggle is off, exactly as it does today with no credentials at all — do not hide it.
- Every existing acceptance/e2e fixture that seeds settings explicitly (`tests/features/steps/world.ts`'s `SEEDED_SETTINGS`, `tests/e2e/reset.ts`'s settings-restore `UPDATE`) must gain a `jira.enabled: true` entry so existing scenarios keep passing unchanged — both files' own comments warn that an unlisted setting leaks between tests.

---

### Task 1: Data model — migration, types, repository, route schema

**Files:**
- Create: `src/server/db/migrations/023_jira_enabled_setting.sql`
- Modify: `src/shared/types.ts` (the `Settings` interface, starts at line 138)
- Modify: `src/server/repositories/settings-repository.ts`
- Modify: `src/server/routes/settings.ts`
- Test: `tests/contract/settings-api.test.ts` (new file)

**Interfaces:**
- Produces: `Settings.jiraEnabled: boolean`, `SettingsRepository.read()` returning it, `SettingsRepository.write({ jiraEnabled })` persisting it, `PUT /api/settings` accepting `{ jiraEnabled: boolean }`.

- [ ] **Step 1: Write the failing contract test**

Create `tests/contract/settings-api.test.ts`:

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../../src/server/app.js';
import { runMigrations } from '../../src/server/db/migrate.js';

/**
 * TEST for the jiraEnabled master toggle (see
 * docs/superpowers/specs/2026-09-08-jira-toggle-design.md). Credentials stay
 * env-only; this is the separate runtime gate persisted in the database.
 */

const CONNECTION =
  process.env.TEST_DATABASE_URL ??
  'postgres://kanban:test-only-not-a-secret@127.0.0.1:5433/kanban_test';

let app: FastifyInstance;
let pool: pg.Pool;

describe('the jiraEnabled setting', () => {
  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: CONNECTION, statement_timeout: 5_000 });
    await runMigrations(pool);
    app = buildApp({ pool, logger: false });
    await app.ready();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await pool?.end();
  });

  beforeEach(async () => {
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ('jira.enabled', 'false'::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    );
  });

  it('defaults to false', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/settings' });
    expect((res.json() as { jiraEnabled: boolean }).jiraEnabled).toBe(false);
  });

  it('round-trips true through PUT', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { jiraEnabled: true },
    });
    expect(put.statusCode).toBe(200);

    const res = await app.inject({ method: 'GET', url: '/api/settings' });
    expect((res.json() as { jiraEnabled: boolean }).jiraEnabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:db:up && npx vitest run tests/contract/settings-api.test.ts --config vitest.contract.config.ts ; npm run test:db:down`
Expected: FAIL — `jiraEnabled` is `undefined`, not `false`/`true` (the setting doesn't exist yet).

- [ ] **Step 3: Add the migration**

Create `src/server/db/migrations/023_jira_enabled_setting.sql`:

```sql
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
```

- [ ] **Step 4: Add the field to the shared `Settings` type**

In `src/shared/types.ts`, the `Settings` interface starts at line 138. Add `jiraEnabled` as the first field:

```typescript
export interface Settings {
  /** Master toggle, independent of whether credentials are configured. */
  jiraEnabled: boolean;

  jiraJql: string;
  syncIntervalSeconds: number;
```

(Leave every field after `syncIntervalSeconds` exactly as it is.)

- [ ] **Step 5: Wire it through `SettingsRepository`**

In `src/server/repositories/settings-repository.ts`, add to the `KEYS` object (currently starts `const KEYS = { jql: 'jira.jql', ... }`):

```typescript
const KEYS = {
  jiraEnabled: 'jira.enabled',
  jql: 'jira.jql',
```

In `read()`, add the field (put it right after the opening of the returned object, before `jiraJql`):

```typescript
    return {
      jiraEnabled: Boolean(byKey.get(KEYS.jiraEnabled) ?? false),
      jiraJql: String(byKey.get(KEYS.jql) ?? ''),
```

In `write()`, add `'jiraEnabled'` to the uniform field list (the array currently starting `'iterationBoardId',`):

```typescript
    for (const name of [
      'jiraEnabled',
      'iterationBoardId',
```

- [ ] **Step 6: Accept it in the settings route**

In `src/server/routes/settings.ts`, add to the top of `updateSchema`'s object (before `jiraJql`):

```typescript
const updateSchema = z
  .object({
    jiraEnabled: z.boolean().optional(),
    jiraJql: z.string().optional(),
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm run test:db:up && npx vitest run tests/contract/settings-api.test.ts --config vitest.contract.config.ts ; npm run test:db:down`
Expected: PASS (2 tests)

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 9: Commit**

```bash
git add src/server/db/migrations/023_jira_enabled_setting.sql src/shared/types.ts src/server/repositories/settings-repository.ts src/server/routes/settings.ts tests/contract/settings-api.test.ts
git commit -m "feat: add jiraEnabled master toggle setting"
```

---

### Task 2: Gate the card-move transition push

**Files:**
- Modify: `src/server/services/card-service.ts` (full file is 142 lines)
- Modify: `src/server/app.ts` (lines 152–177 and 203)
- Test: `tests/unit/jira-toggle.test.ts` (new file)

**Interfaces:**
- Consumes: `SettingsRepository.read(): Promise<Settings>` (Task 1) — specifically `Settings.jiraEnabled`.
- Produces: `CardService`'s `jira` constructor bundle now requires a `settings: SettingsRepository` field alongside its existing `transitions`, `mappings`, `links`.

- [ ] **Step 1: Write the failing unit test**

Create `tests/unit/jira-toggle.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { CardService } from '../../src/server/services/card-service.js';
import type { CardRepository } from '../../src/server/repositories/card-repository.js';
import type { ConflictRepository } from '../../src/server/repositories/conflict-repository.js';
import type { SettingsRepository } from '../../src/server/repositories/settings-repository.js';

/**
 * The jiraEnabled toggle is a runtime gate independent of whether
 * credentials exist: a jira bundle can be present (credentials configured)
 * while the setting is off, and no push may happen in that state. See
 * docs/superpowers/specs/2026-09-08-jira-toggle-design.md.
 */
describe('a card move with Jira integration toggled off', () => {
  const cards = {
    columnState: async () => 'open' as const,
    move: async (id: string) => ({
      card: { id, columnId: 5 },
      moved: true,
    }),
  } as unknown as CardRepository;

  const conflicts = { hasOpen: async () => false } as unknown as ConflictRepository;

  it('never reads the Jira link, and pushes nothing', async () => {
    const findByCardId = vi.fn();
    const settings = {
      read: async () => ({ jiraEnabled: false }),
    } as unknown as SettingsRepository;

    const service = new CardService(cards, conflicts, () => new Date(), {
      transitions: {} as never,
      mappings: {} as never,
      links: { findByCardId } as never,
      settings,
    });

    const result = await service.move('card-1', { toColumnId: 5, toIndex: 1 });

    expect(findByCardId).not.toHaveBeenCalled();
    expect(result.jira).toBeUndefined();
  });

  it('pushes normally once the toggle is on', async () => {
    const findByCardId = vi.fn().mockResolvedValue(null); // ad-hoc card
    const settings = {
      read: async () => ({ jiraEnabled: true }),
    } as unknown as SettingsRepository;

    const service = new CardService(cards, conflicts, () => new Date(), {
      transitions: {} as never,
      mappings: {} as never,
      links: { findByCardId } as never,
      settings,
    });

    await service.move('card-1', { toColumnId: 5, toIndex: 1 });

    expect(findByCardId).toHaveBeenCalledWith('card-1');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/jira-toggle.test.ts`
Expected: FAIL to even construct — `CardService`'s jira bundle type does not yet accept a `settings` field, so this fails typecheck/compile before assertions run.

- [ ] **Step 3: Add `settings` to `CardService`'s jira bundle and gate the push**

In `src/server/services/card-service.ts`, add the import:

```typescript
import type { SettingsRepository } from '../repositories/settings-repository.js';
```

Change the constructor's `jira` bundle type (currently):

```typescript
    private readonly jira?: {
      transitions: TransitionService;
      mappings: MappingRepository;
      links: JiraLinkRepository;
    },
```

to:

```typescript
    private readonly jira?: {
      transitions: TransitionService;
      mappings: MappingRepository;
      links: JiraLinkRepository;
      settings: SettingsRepository;
    },
```

In `pushToJiraFirst`, change:

```typescript
  private async pushToJiraFirst(
    cardId: string,
    toColumnId: number,
  ): Promise<{ transitioned: boolean; toStatus: string } | null> {
    if (!this.jira) return null;

    const link = await this.jira.links.findByCardId(cardId);
```

to:

```typescript
  private async pushToJiraFirst(
    cardId: string,
    toColumnId: number,
  ): Promise<{ transitioned: boolean; toStatus: string } | null> {
    if (!this.jira) return null;
    if (!(await this.jira.settings.read()).jiraEnabled) return null;

    const link = await this.jira.links.findByCardId(cardId);
```

- [ ] **Step 4: Wire `settings` into the bundle in `app.ts`**

In `src/server/app.ts`, `const settings = new SettingsRepository(pool);` currently appears at line 203, after `cardService` is constructed. Move it earlier: delete that line from its current position and insert it right after `const conflicts = new ConflictRepository(pool);` (in the block starting at line 153):

```typescript
  const cardRepository = new CardRepository(pool);
  const events = new EventRepository(pool);
  registerBoardRoutes(app, new BoardService(new BoardRepository(pool)));
  const mappings = new MappingRepository(pool);
  const conflicts = new ConflictRepository(pool);
  const settings = new SettingsRepository(pool);
```

Then update the `cardService` construction (currently):

```typescript
  const cardService = new CardService(
    cardRepository,
    conflicts,
    () => new Date(),
    jira
      ? {
          transitions: transitionService(),
          mappings,
          links: new JiraLinkRepository(pool),
        }
      : undefined,
  );
```

to:

```typescript
  const cardService = new CardService(
    cardRepository,
    conflicts,
    () => new Date(),
    jira
      ? {
          transitions: transitionService(),
          mappings,
          links: new JiraLinkRepository(pool),
          settings,
        }
      : undefined,
  );
```

The line `const settings = new SettingsRepository(pool);` that used to sit before `registerIterationRoutes` is now gone from there (moved up) — leave everything else in that later block (`registerIterationRoutes(app, new IterationService(settings, ...))`, `const sync = jira ? new SyncService(pool, jira, ..., settings, ...) : null;`) unchanged; `settings` is still in scope, just declared earlier.

- [ ] **Step 5: Run the unit test to verify it passes**

Run: `npx vitest run tests/unit/jira-toggle.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Run the existing conflict-freeze test to confirm no regression**

Run: `npx vitest run tests/unit/conflict-freeze.test.ts`
Expected: PASS (2 tests) — this file never passes a `jira` bundle, so it is unaffected by the bundle's new field.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add src/server/services/card-service.ts src/server/app.ts tests/unit/jira-toggle.test.ts
git commit -m "feat: gate the card-move transition push on jiraEnabled"
```

---

### Task 3: Gate `IterationService`'s live read

**Files:**
- Modify: `src/server/services/iteration-service.ts`
- Modify: `tests/contract/iteration-api.test.ts`

**Interfaces:**
- Consumes: `Settings.jiraEnabled` (Task 1), already available via `this.settings.read()` inside `current()`.
- Produces: `IterationService.current()` skips calling `IterationPort.listActiveSprints` when `jiraEnabled` is `false`, falling into the same cached/estimated path used when the source fails.

- [ ] **Step 1: Extend the contract test to seed `jira.enabled: true` (preserving existing behavior) and add a failing off-case**

In `tests/contract/iteration-api.test.ts`, the `beforeEach` currently is:

```typescript
  beforeEach(async () => {
    await pool.query('DELETE FROM iterations');
    source = Object.assign(source, new FakeIterationAdapter());
    source.fail(null);
  });
```

Change it to also seed the toggle on, since every existing test in this file expects a live read to happen (the migration default is `false`, which would silently break all of them otherwise):

```typescript
  beforeEach(async () => {
    await pool.query('DELETE FROM iterations');
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ('jira.enabled', 'true'::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    );
    source = Object.assign(source, new FakeIterationAdapter());
    source.fail(null);
  });
```

Then add a new test at the end of the `describe` block, right before the closing `});`:

```typescript
  it('never calls the source when Jira integration is toggled off, and still estimates', async () => {
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ('jira.enabled', 'false'::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    );

    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body?.provenance).toBe('estimated');
    expect(source.calls).toBe(0);
  });
```

- [ ] **Step 2: Run it to verify the new test fails**

Run: `npm run test:db:up && npx vitest run tests/contract/iteration-api.test.ts --config vitest.contract.config.ts ; npm run test:db:down`
Expected: the new test FAILs — `source.calls` is `1`, not `0` (the service always calls the source today, regardless of the setting).

- [ ] **Step 3: Gate the call in `IterationService.current()`**

In `src/server/services/iteration-service.ts`, `current()` currently does:

```typescript
  async current(): Promise<Iteration | null> {
    const settings = await this.settings.read();
    const now = this.now();

    const read = await this.readFromSource(
      settings.iterationBoardId,
      settings.iterationTeamName,
    );
```

Change to:

```typescript
  async current(): Promise<Iteration | null> {
    const settings = await this.settings.read();
    const now = this.now();

    // A local feature that prefers a live Jira read when the toggle allows
    // one — turning it off falls into exactly the same cached/estimated path
    // readFromSource's own failure already takes, not a new code path.
    const read = settings.jiraEnabled
      ? await this.readFromSource(settings.iterationBoardId, settings.iterationTeamName)
      : null;
```

- [ ] **Step 4: Run the full contract file to verify everything passes**

Run: `npm run test:db:up && npx vitest run tests/contract/iteration-api.test.ts --config vitest.contract.config.ts ; npm run test:db:down`
Expected: PASS (all 9 tests, including the new one)

- [ ] **Step 5: Run the full contract suite to confirm no other regressions**

Run: `npm run test:contract`
Expected: PASS (the pre-existing "serves the cached iteration when the source fails" failure noted in the design doc's compatibility note is unrelated to this change and was already failing before this plan — if it still fails here, that is expected and not a regression to chase in this task)

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/server/services/iteration-service.ts tests/contract/iteration-api.test.ts
git commit -m "feat: skip the live iteration read when Jira integration is off"
```

---

### Task 4: Gate the sync route, and prove the whole backend gate acceptance-level

**Files:**
- Modify: `src/server/routes/sync.ts`
- Modify: `src/server/app.ts` (the `registerSyncRoutes` call, currently near line 230)
- Modify: `tests/features/steps/world.ts` (`SEEDED_SETTINGS`)
- Modify: `tests/e2e/reset.ts` (the settings-restore `UPDATE`)
- Modify: `tests/features/steps/sync-status.steps.ts` (new shared step)
- Modify: `tests/features/sync-status.feature`
- Modify: `tests/features/push-transitions.feature`
- Modify: `tests/features/iteration-banner.feature`

**Interfaces:**
- Consumes: `SettingsRepository.read(): Promise<Settings>` (Task 1).
- Produces: `GET /api/sync/status`'s `configured` field now means "credentials present AND jiraEnabled" — this is what Task 5's frontend work reads to decide whether to render the sync pill.

- [ ] **Step 1: Seed the toggle on in both test fixtures, so existing scenarios keep passing**

In `tests/features/steps/world.ts`, `SEEDED_SETTINGS` currently starts:

```typescript
const SEEDED_SETTINGS: Record<string, unknown> = {
  'jira.jql': 'assignee = currentUser() AND statusCategory != Done',
```

Add the toggle as the first entry:

```typescript
const SEEDED_SETTINGS: Record<string, unknown> = {
  'jira.enabled': true,
  'jira.jql': 'assignee = currentUser() AND statusCategory != Done',
```

In `tests/e2e/reset.ts`, the settings-restore `UPDATE` currently is:

```typescript
     UPDATE settings SET value = d.value FROM (VALUES
       ('jira.jql', '"assignee = currentUser() AND statusCategory != Done"'::jsonb),
       ('sync.interval_seconds', '300'::jsonb),
       ('archive.window_days', '7'::jsonb),
       ('archive.interval_seconds', '3600'::jsonb)
     ) AS d(key, value) WHERE settings.key = d.key;`,
```

Add `jira.enabled` to the list:

```typescript
     UPDATE settings SET value = d.value FROM (VALUES
       ('jira.enabled', 'true'::jsonb),
       ('jira.jql', '"assignee = currentUser() AND statusCategory != Done"'::jsonb),
       ('sync.interval_seconds', '300'::jsonb),
       ('archive.window_days', '7'::jsonb),
       ('archive.interval_seconds', '3600'::jsonb)
     ) AS d(key, value) WHERE settings.key = d.key;`,
```

- [ ] **Step 2: Add the failing acceptance scenarios**

In `tests/features/sync-status.feature`, append at the end of the file:

```gherkin
  Scenario: Turning Jira integration off behaves like not configured
    Given the application is running
    And Jira has an issue "AIHUB-1" with status "Open"
    And Jira integration is turned off
    Then the sync status reports Jira as not configured

  Scenario: Requesting a sync while Jira integration is off is refused clearly
    Given the application is running
    And Jira integration is turned off
    When a sync runs
    Then the request is refused with code "JIRA_NOT_CONFIGURED"
```

In `tests/features/push-transitions.feature`, append at the end of the file:

```gherkin
  Scenario: Turning Jira integration off stops moves from transitioning the issue
    Given the application is running
    And Jira has an issue "AIHUB-1" with status "Open"
    And a sync runs
    And Jira integration is turned off
    When the card for issue "AIHUB-1" is moved to the "test" column
    Then no transition was performed in Jira
```

In `tests/features/iteration-banner.feature`, append at the end of the file:

```gherkin
  Scenario: Turning Jira integration off falls back to the estimated iteration
    Given the iteration source reports both teams' sprints for "2026 S18"
    And Jira integration is turned off
    When the iteration is read
    Then the iteration is marked as estimated
```

- [ ] **Step 3: Add the shared step definition**

In `tests/features/steps/sync-status.steps.ts`, add after the existing `Given('the application is running without Jira configured', ...)` block:

```typescript
Given('Jira integration is turned off', async function (this: BoardWorld) {
  await this.request('PUT', '/api/settings', { jiraEnabled: false });
});
```

- [ ] **Step 4: Run the acceptance suite to verify the new scenarios fail**

Run: `npm run test:acceptance`
Expected: the four new scenarios FAIL (`the sync status reports Jira as not configured` finds `configured: true`; the sync-refused scenario gets a 200/success instead of 409; the transition scenario finds a transition WAS performed; the iteration scenario finds `provenance: 'read'` instead of `'estimated'`) — the last one already passes once Task 3 lands, since `IterationService` is already gated; confirm it specifically before moving on.

- [ ] **Step 5: Gate the sync route**

In `src/server/routes/sync.ts`, add the import:

```typescript
import type { SettingsRepository } from '../repositories/settings-repository.js';
```

Change the `deps` type and both handlers (currently):

```typescript
export const registerSyncRoutes = (
  app: FastifyInstance,
  deps: {
    sync: SyncService | null;
    lock: SyncLock;
    runs: SyncRunRepository;
  },
): void => {
  app.post('/api/sync/run', async () => {
    if (!deps.sync) throw jiraNotConfigured();
    // Joins an in-flight sync rather than starting a second (FR-129), so
    // fifty impatient refreshes produce one sync and fifty identical answers.
    return { run: await deps.lock.run(() => deps.sync!.run()) };
  });

  app.get('/api/sync/status', async () => ({
    // Not-configured is a normal state, not an error (FR-105).
    configured: deps.sync !== null,
    running: deps.lock.running,
    lastSuccessAt: await deps.runs.lastSuccessAt(),
    lastRun: await deps.runs.latest(),
  }));
};
```

to:

```typescript
export const registerSyncRoutes = (
  app: FastifyInstance,
  deps: {
    sync: SyncService | null;
    lock: SyncLock;
    runs: SyncRunRepository;
    settings: SettingsRepository;
  },
): void => {
  app.post('/api/sync/run', async () => {
    if (!deps.sync) throw jiraNotConfigured();
    if (!(await deps.settings.read()).jiraEnabled) throw jiraNotConfigured();
    // Joins an in-flight sync rather than starting a second (FR-129), so
    // fifty impatient refreshes produce one sync and fifty identical answers.
    return { run: await deps.lock.run(() => deps.sync!.run()) };
  });

  app.get('/api/sync/status', async () => ({
    // Not-configured is a normal state, not an error (FR-105). "Configured"
    // now means credentials are present AND the toggle is on — the two ways
    // Jira can be unavailable look identical to the caller.
    configured: deps.sync !== null && (await deps.settings.read()).jiraEnabled,
    running: deps.lock.running,
    lastSuccessAt: await deps.runs.lastSuccessAt(),
    lastRun: await deps.runs.latest(),
  }));
};
```

- [ ] **Step 6: Pass `settings` in `app.ts`**

In `src/server/app.ts`, the call `registerSyncRoutes(app, { sync, lock, runs });` (near line 230) becomes:

```typescript
  registerSyncRoutes(app, { sync, lock, runs, settings });
```

(`settings` is already in scope from Task 2's Step 4 reordering.)

- [ ] **Step 7: Run the acceptance suite to verify everything passes**

Run: `npm run test:acceptance`
Expected: PASS (all scenarios, including the four new ones)

- [ ] **Step 8: Run the full test:contract and test:unit suites to confirm no regressions**

Run: `npm run test:unit && npm run test:contract`
Expected: PASS (aside from the one pre-existing, unrelated failure noted in Task 3's Step 5)

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 10: Commit**

```bash
git add src/server/routes/sync.ts src/server/app.ts tests/features/steps/world.ts tests/e2e/reset.ts tests/features/steps/sync-status.steps.ts tests/features/sync-status.feature tests/features/push-transitions.feature tests/features/iteration-banner.feature
git commit -m "feat: gate the sync route on jiraEnabled, and prove the toggle end-to-end"
```

---

### Task 5: Frontend — Settings checkbox, hide Jira fields, hide the sync pill

**Files:**
- Modify: `src/web/settings/SettingsDialog.tsx`
- Modify: `src/web/sync/SyncStatus.tsx`
- Modify: `src/web/board/Board.tsx` (the `<SyncStatusPill .../>` line, currently near line 261)
- Test: `tests/e2e/settings.spec.ts`

**Interfaces:**
- Consumes: `Settings.jiraEnabled` (Task 1) via `GET /api/settings`; `SyncStatus.configured` (Task 4) via the existing `useSync` hook.

- [ ] **Step 1: Write the failing e2e test**

In `tests/e2e/settings.spec.ts`, add a new test inside the existing `test.describe('settings', ...)` block:

```typescript
  test('turning Jira integration off hides the Jira-specific fields', async ({ page }) => {
    await page.getByRole('button', { name: 'Settings' }).click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });

    await expect(dialog.getByLabel('Jira query')).toBeVisible();
    await expect(dialog.getByTestId('jira-enabled-toggle')).toBeChecked();

    await dialog.getByTestId('jira-enabled-toggle').uncheck();

    await expect(dialog.getByLabel('Jira query')).toHaveCount(0);
    await expect(dialog.getByLabel('Reference board')).toHaveCount(0);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:e2e -- settings.spec.ts`
Expected: FAIL — there is no `jira-enabled-toggle` element yet, and unchecking a nonexistent checkbox errors out.

- [ ] **Step 3: Add the checkbox and gate the Jira-specific fieldsets**

In `src/web/settings/SettingsDialog.tsx`, immediately after the `Author` field's closing `</label>` (which currently precedes the `<fieldset className="field"><legend className="field-label">Jira</legend>` block), insert:

```tsx
            <label className="filter-toggle" data-testid="jira-enabled-field">
              <input
                type="checkbox"
                data-testid="jira-enabled-toggle"
                checked={settings?.jiraEnabled ?? false}
                disabled={!settings}
                onChange={(e) =>
                  settings && setSettings({ ...settings, jiraEnabled: e.target.checked })
                }
              />
              Enable Jira integration
            </label>
```

Then wrap the `Jira` fieldset (JQL query + sync interval), the `Jira fields` fieldset (blocked/sprint/story-points customfield ids), and the `Iteration` fieldset (reference board + team) each in `{settings?.jiraEnabled && ( ... )}`. Concretely, change:

```tsx
            <fieldset className="field">
              <legend className="field-label">Jira</legend>
```

to:

```tsx
            {settings?.jiraEnabled && (
            <fieldset className="field">
              <legend className="field-label">Jira</legend>
```

and its closing `</fieldset>` (the one immediately before the `<fieldset className="field"><legend className="field-label">Jira fields</legend>` block) to `</fieldset>)}`.

Apply the same wrap to the `Jira fields` fieldset — its opening `<fieldset className="field"><legend className="field-label">Jira fields</legend>` becomes `{settings?.jiraEnabled && (<fieldset className="field"><legend className="field-label">Jira fields</legend>`, and its closing `</fieldset>` (the one right before `</div>` that closes the first `settings-column`) becomes `</fieldset>)}`.

Apply the same wrap to the `Iteration` fieldset — its opening `<fieldset className="field"><legend className="field-label">Iteration</legend>` becomes `{settings?.jiraEnabled && (<fieldset className="field"><legend className="field-label">Iteration</legend>`, and its closing `</fieldset>` (the one right before the `Working week` fieldset starts) becomes `</fieldset>)}`. Leave the `Working week` fieldset unwrapped — it drives the iteration banner's local working-days count and has nothing to do with Jira.

Finally, wrap the `MappingEditor`:

```tsx
          <div className="settings-column">
            <MappingEditor
              columns={columns}
              mappings={mappings}
              onChange={(columnId, statusName) =>
```

becomes:

```tsx
          <div className="settings-column">
            {settings?.jiraEnabled && (
            <MappingEditor
              columns={columns}
              mappings={mappings}
              onChange={(columnId, statusName) =>
```

and its closing `/>` becomes `/>)}`.

- [ ] **Step 4: Simplify `SyncStatusPill`, removing the now-unreachable `unconfigured` branch**

In `src/web/sync/SyncStatus.tsx`, replace the whole `SyncStatusPill` component body:

```tsx
export const SyncStatusPill = ({
  status,
  onRefresh,
}: {
  status: Status | null;
  onRefresh: () => void;
}) => {
  if (!status) return null;

  const failed = status.lastRun?.outcome === 'failed';
  const state = !status.configured
    ? 'unconfigured'
    : status.running
      ? 'running'
      : failed
        ? 'failed'
        : 'ok';

  return (
    <div className={`sync sync--${state}`} data-testid="sync-status" data-state={state}>
      {state === 'unconfigured' && <span>Jira not configured</span>}
      {state === 'running' && <span>Syncing…</span>}
      {failed && (
        <span className="sync-failure">
          {FAILURE_TEXT[status.lastRun?.failureKind ?? ''] ?? 'Sync failed'}
        </span>
      )}
      {status.lastSuccessAt && state !== 'unconfigured' && (
        // Kept visible through a failure: "failing now" and "last worked an
        // hour ago" are different facts, and the user needs both.
        <span className="sync-last">Synced {relative(status.lastSuccessAt)}</span>
      )}
      {status.configured && (
        <button
          type="button"
          className="sync-refresh"
          onClick={onRefresh}
          disabled={status.running}
        >
          Refresh
        </button>
      )}
    </div>
  );
};
```

with:

```tsx
export const SyncStatusPill = ({
  status,
  onRefresh,
}: {
  status: Status | null;
  onRefresh: () => void;
}) => {
  // The caller only renders this when status.configured is true (Board.tsx),
  // so there is nothing left to distinguish an "unconfigured" state here.
  if (!status) return null;

  const failed = status.lastRun?.outcome === 'failed';
  const state = status.running ? 'running' : failed ? 'failed' : 'ok';

  return (
    <div className={`sync sync--${state}`} data-testid="sync-status" data-state={state}>
      {state === 'running' && <span>Syncing…</span>}
      {failed && (
        <span className="sync-failure">
          {FAILURE_TEXT[status.lastRun?.failureKind ?? ''] ?? 'Sync failed'}
        </span>
      )}
      {status.lastSuccessAt && (
        // Kept visible through a failure: "failing now" and "last worked an
        // hour ago" are different facts, and the user needs both.
        <span className="sync-last">Synced {relative(status.lastSuccessAt)}</span>
      )}
      <button
        type="button"
        className="sync-refresh"
        onClick={onRefresh}
        disabled={status.running}
      >
        Refresh
      </button>
    </div>
  );
};
```

- [ ] **Step 5: Render the pill only when configured**

In `src/web/board/Board.tsx`, the line (currently near line 261):

```tsx
              <SyncStatusPill status={syncStatus} onRefresh={() => void syncNow()} />
```

becomes:

```tsx
              {syncStatus?.configured && (
                <SyncStatusPill status={syncStatus} onRefresh={() => void syncNow()} />
              )}
```

- [ ] **Step 6: Run the e2e test to verify it passes**

Run: `npm run test:e2e -- settings.spec.ts`
Expected: PASS (all tests in the file, including the new one)

- [ ] **Step 7: Run the full e2e suite to confirm no regressions**

Run: `npm run test:e2e`
Expected: PASS. In particular check `sync-status.spec.ts` (it intercepts `/api/sync/status` directly with `page.route`, so it is unaffected by the real toggle's default) and `iteration-banner.spec.ts` (the banner is untouched by this task).

- [ ] **Step 8: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors (aside from the two pre-existing, unrelated lint errors in `tests/features/steps/mapping.steps.ts` and `tests/features/steps/summary.steps.ts` noted when this feature was scoped — do not fix those here, out of scope)

- [ ] **Step 9: Commit**

```bash
git add src/web/settings/SettingsDialog.tsx src/web/sync/SyncStatus.tsx src/web/board/Board.tsx tests/e2e/settings.spec.ts
git commit -m "feat: add the Jira integration toggle to Settings, and hide the sync pill when off"
```

---

## Final verification (after all five tasks)

- [ ] Run the complete standard suite plus e2e: `npm run typecheck && npm run lint && npm run test:unit && npm run test:contract && npm run test:acceptance && npm run test:e2e`
- [ ] Confirm the only failures are the pre-existing "serves the cached iteration when the source fails" cases in `tests/contract/iteration-api.test.ts` and `tests/features/iteration-banner.feature` (unrelated to this feature, already present on `main`)
- [ ] Re-read `docs/superpowers/specs/2026-09-08-jira-toggle-design.md` and confirm every section has a corresponding change
- [ ] Update `README.md` if it documents `/api/sync/status`'s `configured` field or Jira setup steps, to mention the new toggle and its default-off behavior for existing deployments
