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
