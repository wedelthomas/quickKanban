import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { compose, waitForHealthy } from './helpers.js';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

const run = promisify(execFile);

const psql = async (sql: string): Promise<string> => {
  const { stdout } = await run('docker', [
    'compose',
    'exec',
    '-T',
    'db',
    'psql',
    '-U',
    process.env.POSTGRES_USER ?? 'kanban',
    '-d',
    process.env.POSTGRES_DB ?? 'kanban',
    '-tAc',
    sql,
  ]);
  return stdout.trim();
};

const runArchival = async (): Promise<number> => {
  const { stdout } = await run('docker', [
    'compose',
    'exec',
    '-T',
    'app',
    'node',
    '-e',
    `fetch('http://127.0.0.1:3000/api/archive/run', { method: 'POST' })
       .then((r) => { console.log(r.status); })`,
  ]);
  return Number(stdout.trim());
};

/**
 * An archival pass that never finished must not disable archival forever.
 *
 * `archive_runs` enforces single-flight with a partial unique index on
 * "unfinished", which is the right guarantee while a pass is running and a trap
 * once one dies. A crash, a `compose down` or an OOM mid-pass leaves
 * `finished_at` null, and every later attempt then violates the index.
 *
 * The failure is silent in the way that matters: finished work simply stops
 * leaving the board, and the only signal is a 500 on an endpoint nobody
 * watches. Slice 2 hit this for `sync_runs` and swept it at startup; this is
 * the same sweep, and this test is the reproduction that found it missing.
 */
describe('an interrupted archival pass', () => {
  // Same reason as timezone.test.ts: nothing is guaranteed to be running by the
  // time this file executes.
  beforeAll(async () => {
    await compose('up', '-d');
    await waitForHealthy();
  }, 180_000);

  beforeEach(async () => {
    await psql('DELETE FROM archive_runs;');
  });

  it('does not block the next pass once the app restarts', async () => {
    // Exactly what a crash leaves behind: a started row that never finished.
    await psql('INSERT INTO archive_runs DEFAULT VALUES;');
    expect(
      await psql('SELECT count(*) FROM archive_runs WHERE finished_at IS NULL;'),
    ).toBe('1');

    await run('docker', ['compose', 'restart', 'app']);
    // Give the app time to migrate, sweep and start listening.
    await new Promise((r) => setTimeout(r, 8000));

    expect(
      await psql('SELECT count(*) FROM archive_runs WHERE finished_at IS NULL;'),
    ).toBe('0');
    expect(await runArchival()).toBe(200);
  }, 60_000);

  it('records the abandoned pass as failed rather than deleting it', async () => {
    await psql('INSERT INTO archive_runs DEFAULT VALUES;');
    await run('docker', ['compose', 'restart', 'app']);
    await new Promise((r) => setTimeout(r, 8000));

    // Kept, not erased: a pass that died is something an operator may want to
    // see, and this table exists precisely to record what happened.
    expect(await psql('SELECT outcome FROM archive_runs ORDER BY id LIMIT 1;')).toBe(
      'failed',
    );
  }, 60_000);
});
