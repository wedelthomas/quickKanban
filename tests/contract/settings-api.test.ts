import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../../src/server/app.js';
import { runMigrations } from '../../src/server/db/migrate.js';
import type { JiraPort } from '../../src/server/jira/jira-port.js';

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

/**
 * TEST-733: the cancellation status is checked against the tracker's own
 * statuses, mirroring the column mapping's validation exactly (FR-634).
 */
describe('the cancellationStatus setting', () => {
  // Its own pool: the outer describe's afterAll ends the module-level `pool`,
  // which would otherwise already be closed by the time this suite runs.
  let jiraPool: pg.Pool;
  let jiraApp: FastifyInstance;
  const fakeJira: Pick<JiraPort, 'listStatuses'> = {
    listStatuses: async () => ['Cancelled', 'Done', 'In Progress'],
  };

  beforeAll(async () => {
    jiraPool = new pg.Pool({ connectionString: CONNECTION, statement_timeout: 5_000 });
    jiraApp = buildApp({ pool: jiraPool, logger: false, jira: fakeJira as JiraPort });
    await jiraApp.ready();
  }, 60_000);

  afterAll(async () => {
    await jiraApp?.close();
    await jiraPool?.end();
  });

  it('accepts a status the tracker reports', async () => {
    const put = await jiraApp.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { cancellationStatus: 'Cancelled' },
    });
    expect(put.statusCode).toBe(200);
  });

  it('rejects a status the tracker does not report', async () => {
    const put = await jiraApp.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { cancellationStatus: 'Not A Real Status' },
    });
    expect(put.statusCode).toBe(422);
  });

  it('clearing the setting (null) is never checked against the tracker', async () => {
    const put = await jiraApp.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { cancellationStatus: null },
    });
    expect(put.statusCode).toBe(200);
  });
});
