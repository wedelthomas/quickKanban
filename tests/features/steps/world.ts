import { After, Before, setWorldConstructor, World } from '@cucumber/cucumber';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../../../src/server/app.js';
import { runMigrations } from '../../../src/server/db/migrate.js';
import { FakeJiraAdapter } from '../../../src/server/jira/fake-jira-adapter.js';
import { FakeIterationAdapter } from '../../../src/server/jira/fake-iteration-adapter.js';

/**
 * The acceptance suite runs against the real API and a real database. No
 * repository is stubbed: these scenarios exist to prove the whole path works,
 * and a mocked datastore would prove only that the mock does.
 */
// Restored wholesale rather than key by key.
//
// This is the third time a setting has leaked between scenarios — the JQL,
// then the column mapping, now the archive window, each fixed by adding one
// more line here. Enumerating the keys means the next setting added leaks
// until someone notices. Naming the full seeded set means it cannot.
const SEEDED_SETTINGS: Record<string, unknown> = {
  'jira.enabled': true,
  'jira.jql': 'assignee = currentUser() AND statusCategory != Done',
  'sync.interval_seconds': 300,
  'archive.window_days': 7,
  'archive.interval_seconds': 3600,
  // Slice 5. Added here for the reason the comment above gives: a setting not
  // named in this set leaks between scenarios until someone notices.
  'iteration.board_id': 4200,
  'iteration.team_name': 'Anchor Team',
  'iteration.anchor_date': '2026-08-24',
  'iteration.cadence_days': 14,
  'working.days': ['mon', 'tue', 'wed', 'thu', 'fri'],
  'working.start_hour': 9,
  'working.end_hour': 17,
  'jira.field.blocked': 'customfield_10003',
  'jira.field.blocked_option': 'Blocked',
  'jira.field.sprint': 'customfield_10000',
  'jira.field.story_points': 'customfield_10005',
  'board.author': '',
  // Slice 7. Unconfigured by default (FR-635) — named here for the same
  // reason every other setting is: left out, a scenario that configures it
  // leaks the value into every scenario that runs after.
  'jira.cancellation_status': null,
};

export class BoardWorld extends World {
  app!: FastifyInstance;
  pool!: pg.Pool;
  /** Staged by the Jira steps; the app is built against this, never live Jira. */
  jira!: FakeJiraAdapter;
  /** The iteration source, likewise fake. Defaults to board 4200's real shape. */
  iterations!: FakeIterationAdapter;
  response!: { status: number; body: unknown };
  /** The card produced by the most recent creating step, for later assertions. */
  lastCard?: import('../../../src/shared/types.js').Card;
  /** Id of a Jira-sourced card seeded directly, for rules that protect them. */
  seededJiraCardId?: string;
  events?: import('../../../src/shared/types.js').CardEvent[];
  rememberedEvent?: import('../../../src/shared/types.js').CardEvent;

  async start(): Promise<void> {
    const connectionString =
      process.env.TEST_DATABASE_URL ??
      'postgres://kanban:test-only-not-a-secret@127.0.0.1:5433/kanban_test';
    this.pool = new pg.Pool({ connectionString, statement_timeout: 5_000 });
    await runMigrations(this.pool);
    this.jira = new FakeJiraAdapter();
    this.iterations = new FakeIterationAdapter();
    this.app = buildApp({
      pool: this.pool,
      logger: false,
      jira: this.jira,
      iterations: this.iterations,
    });
    await this.app.ready();
  }

  /** Rebuilds the app with no Jira port at all, for the not-configured state. */
  async restartWithoutJira(): Promise<void> {
    await this.app.close();
    this.app = buildApp({ pool: this.pool, logger: false, jira: null });
    await this.app.ready();
  }

  /** Truncate rather than re-migrate: scenarios need isolation, not a fresh schema. */
  async reset(): Promise<void> {
    await this.pool.query(
      // `iterations` is in this list for the reason SEEDED_SETTINGS exists: a
      // cached iteration left by one scenario makes the next one's "nothing
      // cached" premise false, and it fails as 'cached' rather than saying so.
      'TRUNCATE card_events, card_tags, tags, jira_links, sync_runs, conflicts, iterations, cards RESTART IDENTITY CASCADE',
    );
    for (const [key, value] of Object.entries(SEEDED_SETTINGS)) {
      await this.pool.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2::jsonb)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, JSON.stringify(value)],
      );
    }

    // Same reasoning for the column mapping. Rewritten wholesale rather than
    // updated, because an unmapped column is the ABSENCE of a row, not a null.
    await this.pool.query('DELETE FROM column_status_mappings');
    await this.pool.query(
      `INSERT INTO column_status_mappings (column_id, status_name)
       VALUES (1, 'Open'), (2, 'Development'), (4, 'Test'), (5, 'PO Approve')`,
    );
  }

  async request(
    method: string,
    url: string,
    payload?: unknown,
  ): Promise<{ status: number; body: unknown }> {
    const res = await this.app.inject({
      method: method as 'GET',
      url,
      payload: payload as never,
    });
    let body: unknown = null;
    if (res.body) {
      try {
        body = JSON.parse(res.body);
      } catch {
        body = res.body;
      }
    }
    this.response = { status: res.statusCode, body };
    return this.response;
  }

  async stop(): Promise<void> {
    await this.app?.close();
    // A scenario may have ended the pool itself to make the data store
    // genuinely unreachable. Ending it twice throws, so teardown tolerates a
    // pool that is already closed rather than the scenario tiptoeing around it.
    try {
      await this.pool?.end();
    } catch (error) {
      if (!/end on pool more than once/i.test((error as Error).message)) throw error;
    }
  }
}

setWorldConstructor(BoardWorld);

Before(async function (this: BoardWorld) {
  await this.start();
  await this.reset();
});

After(async function (this: BoardWorld) {
  await this.stop();
});
