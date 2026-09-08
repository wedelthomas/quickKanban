import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';

const run = promisify(execFile);

const PGUSER = process.env.POSTGRES_USER ?? 'kanban';
const MIGRATIONS = 'src/server/db/migrations';

/**
 * The upgrade that retires the Blocked column, on a database that has actually
 * used it.
 *
 * This runs against a throwaway database rather than the developer's own, for
 * a reason worth stating: the developer's board has never had a card in
 * Blocked and holds no history referencing it (verified at T003). A test that
 * used it would pass without exercising a single line of the card-moving path
 * that FR-404, FR-405 and FR-406 are about. So the pre-migration state is
 * built here explicitly.
 *
 * TEST-401 (BH-401), TEST-402 (BH-402), TEST-403 (BH-403), TEST-404 (BH-404),
 * TEST-405 (BH-405), TEST-433 (BH-433).
 */

const TEST_DB = 'kanban_migtest';

/** Runs SQL against a named database in the db container. */
const psql = async (db: string, sql: string): Promise<string> => {
  const { stdout } = await run(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'db',
      'psql',
      '-U',
      PGUSER,
      '-d',
      db,
      '-v',
      'ON_ERROR_STOP=1',
      '-tAc',
      sql,
    ],
    { maxBuffer: 10 * 1024 * 1024 },
  );
  return stdout.trim();
};

/** Applies one migration file, by name, to the throwaway database. */
const applyMigration = async (file: string): Promise<void> => {
  const sql = await readFile(`${MIGRATIONS}/${file}`, 'utf8');
  await psql(TEST_DB, sql);
};

const migrationsUpTo = async (last: string): Promise<string[]> =>
  (await readdir(MIGRATIONS)).filter((f) => f.endsWith('.sql') && f <= last).sort();

const migrationsBetween = async (from: string, to: string): Promise<string[]> =>
  (await readdir(MIGRATIONS))
    .filter((f) => f.endsWith('.sql') && f >= from && f <= to)
    .sort();

const BLOCKED_COLUMN_ID = 3;
const IN_PROGRESS_COLUMN_ID = 2;

describe('the upgrade that retires the Blocked column', () => {
  beforeAll(async () => {
    // A fresh database each run: these assertions are about a one-way
    // transition, so a re-used database would only be correct the first time.
    await psql('postgres', `DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
    await psql('postgres', `CREATE DATABASE ${TEST_DB}`);

    for (const file of await migrationsUpTo('015_archive_settings.sql')) {
      await applyMigration(file);
    }

    // The pre-migration state the developer's own database does not have:
    // three cards in Blocked, one of them conflicted, plus history that
    // references the column and a status mapping for it.
    await psql(
      TEST_DB,
      `
      INSERT INTO cards (id, title, column_id, position) VALUES
        ('11111111-1111-1111-1111-111111111111', 'plain blocked card',      ${BLOCKED_COLUMN_ID}, 1),
        ('22222222-2222-2222-2222-222222222222', 'second blocked card',     ${BLOCKED_COLUMN_ID}, 2),
        ('33333333-3333-3333-3333-333333333333', 'conflicted blocked card', ${BLOCKED_COLUMN_ID}, 3),
        ('44444444-4444-4444-4444-444444444444', 'untouched backlog card',  1, 1);

      -- History pointing AT the column being retired. This is what makes
      -- deletion impossible and retirement necessary (research R-1).
      INSERT INTO card_events (card_id, from_column_id, to_column_id, actor) VALUES
        ('11111111-1111-1111-1111-111111111111', 1, ${BLOCKED_COLUMN_ID}, 'user'),
        ('22222222-2222-2222-2222-222222222222', ${BLOCKED_COLUMN_ID}, 1, 'user'),
        ('22222222-2222-2222-2222-222222222222', 1, ${BLOCKED_COLUMN_ID}, 'user');

      INSERT INTO conflicts (card_id, board_column_id, jira_status_at_detection, jira_status_current)
        VALUES ('33333333-3333-3333-3333-333333333333', ${BLOCKED_COLUMN_ID}, 'Development', 'Test');

      INSERT INTO column_status_mappings (column_id, status_name)
        VALUES (${BLOCKED_COLUMN_ID}, 'Blocked')
        ON CONFLICT (column_id) DO UPDATE SET status_name = EXCLUDED.status_name;
      `,
    );

    for (const file of await migrationsBetween('016_', '021_zzz')) {
      await applyMigration(file);
    }
  }, 180_000);

  // TEST-401 (BH-401)
  it('presents the six new columns, with Blocked gone from the board', async () => {
    const board = await psql(
      TEST_DB,
      `SELECT string_agg(key, ',' ORDER BY position) FROM columns WHERE retired_at IS NULL`,
    );
    expect(board).toBe('backlog,iteration_items,in_progress,test,po_review,done');

    const retired = await psql(
      TEST_DB,
      `SELECT count(*) FROM columns WHERE retired_at IS NOT NULL AND key = 'blocked'`,
    );
    expect(retired).toBe('1');

    const stranded = await psql(
      TEST_DB,
      `SELECT count(*) FROM cards WHERE column_id = ${BLOCKED_COLUMN_ID}`,
    );
    expect(stranded).toBe('0');
  });

  // TEST-402 (BH-402). NFR-27's no-card-lost assertion.
  it('moves every blocked card to In Progress, flagged, with a system-attributed record', async () => {
    const total = await psql(TEST_DB, `SELECT count(*) FROM cards`);
    expect(total).toBe('4');

    const migrated = await psql(
      TEST_DB,
      `SELECT string_agg(title, '|' ORDER BY title) FROM cards
         WHERE column_id = ${IN_PROGRESS_COLUMN_ID} AND blocked`,
    );
    expect(migrated).toBe(
      'conflicted blocked card|plain blocked card|second blocked card',
    );

    const untouched = await psql(
      TEST_DB,
      `SELECT column_id::text || ':' || blocked::text FROM cards WHERE title = 'untouched backlog card'`,
    );
    expect(untouched).toBe('1:false');

    const systemRows = await psql(
      TEST_DB,
      `SELECT count(*) FROM card_events
         WHERE actor = 'system'
           AND from_column_id = ${BLOCKED_COLUMN_ID}
           AND to_column_id = ${IN_PROGRESS_COLUMN_ID}`,
    );
    expect(systemRows).toBe('3');
  });

  // TEST-403 (BH-403)
  it('migrates a conflicted card and leaves its conflict untouched', async () => {
    const card = await psql(
      TEST_DB,
      `SELECT column_id::text || ':' || blocked::text FROM cards
         WHERE id = '33333333-3333-3333-3333-333333333333'`,
    );
    expect(card).toBe(`${IN_PROGRESS_COLUMN_ID}:true`);

    const conflict = await psql(
      TEST_DB,
      `SELECT count(*) FROM conflicts
         WHERE card_id = '33333333-3333-3333-3333-333333333333'
           AND resolved_at IS NULL
           AND jira_status_at_detection = 'Development'`,
    );
    expect(conflict).toBe('1');
  });

  // TEST-404 (BH-404). The schema half is guaranteed by schema_migrations,
  // which never re-runs an applied file; what is asserted here is the half
  // that guarantee does not cover — that the DATA statements move nothing on
  // a second pass.
  it('changes nothing when the card-moving migration runs a second time', async () => {
    const before = await psql(
      TEST_DB,
      `SELECT (SELECT count(*) FROM card_events)::text || '/' ||
              (SELECT string_agg(column_id::text, ',' ORDER BY title) FROM cards)`,
    );

    await applyMigration('017_card_blocked.sql');

    const after = await psql(
      TEST_DB,
      `SELECT (SELECT count(*) FROM card_events)::text || '/' ||
              (SELECT string_agg(column_id::text, ',' ORDER BY title) FROM cards)`,
    );
    expect(after).toBe(before);
  });

  // TEST-405 (BH-405)
  it('drops the retired column mapping and leaves the others alone', async () => {
    const retiredMapping = await psql(
      TEST_DB,
      `SELECT count(*) FROM column_status_mappings WHERE column_id = ${BLOCKED_COLUMN_ID}`,
    );
    expect(retiredMapping).toBe('0');

    const survivors = await psql(
      TEST_DB,
      `SELECT string_agg(column_id::text || '=' || status_name, ',' ORDER BY column_id)
         FROM column_status_mappings`,
    );
    expect(survivors).toBe('1=Open,2=Development,4=Test,5=PO Approve');
  });

  // TEST-433 (BH-433). The point of retiring rather than deleting.
  //
  // Asserting only that the movements "still resolve" would be a test that
  // passes before the migration exists — it was, on first run — and so could
  // never catch the regression it is here for. What discriminates is that they
  // resolve to a column that is RETIRED: zero if someone deletes the row
  // instead of retiring it, and an error before `retired_at` exists at all.
  it('keeps historical movements resolvable against the retired column', async () => {
    const resolved = await psql(
      TEST_DB,
      `SELECT count(*) FROM card_events e
         JOIN columns f ON f.id = e.from_column_id
         JOIN columns t ON t.id = e.to_column_id
        WHERE e.actor = 'user'
          AND (f.key = 'blocked' OR t.key = 'blocked')
          AND (f.retired_at IS NOT NULL OR t.retired_at IS NOT NULL)`,
    );
    expect(resolved).toBe('3');
  });
});
