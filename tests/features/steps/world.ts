import { After, Before, setWorldConstructor, World } from '@cucumber/cucumber';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../../../src/server/app.js';
import { runMigrations } from '../../../src/server/db/migrate.js';
import { FakeJiraAdapter } from '../../../src/server/jira/fake-jira-adapter.js';

/**
 * The acceptance suite runs against the real API and a real database. No
 * repository is stubbed: these scenarios exist to prove the whole path works,
 * and a mocked datastore would prove only that the mock does.
 */
export class BoardWorld extends World {
  app!: FastifyInstance;
  pool!: pg.Pool;
  /** Staged by the Jira steps; the app is built against this, never live Jira. */
  jira!: FakeJiraAdapter;
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
    this.app = buildApp({ pool: this.pool, logger: false, jira: this.jira });
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
      'TRUNCATE card_events, card_tags, tags, jira_links, sync_runs, conflicts, cards RESTART IDENTITY CASCADE',
    );
    // Settings are restored, not truncated — the rows are seeded by migration.
    // Without this a scenario that changes the query leaks it into every
    // scenario that runs after it, which is exactly what happened.
    await this.pool.query(
      `UPDATE settings SET value = '"assignee = currentUser() AND statusCategory != Done"'::jsonb
        WHERE key = 'jira.jql'`,
    );
    await this.pool.query(
      `UPDATE settings SET value = '300'::jsonb WHERE key = 'sync.interval_seconds'`,
    );
  }

  async request(
    method: string,
    url: string,
    payload?: unknown,
  ): Promise<{ status: number; body: unknown }> {
    const res = await this.app.inject({ method: method as 'GET', url, payload: payload as never });
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
