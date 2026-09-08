import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * The browser suite's own database.
 *
 * Every psql call in this file targets it explicitly rather than POSTGRES_DB,
 * which names the developer's real board. Using POSTGRES_DB here is what
 * emptied it.
 */
export const E2E_DATABASE = 'kanban_e2e';

/**
 * Refuses to run against anything but the browser suite's own database.
 *
 * A belt to docker-compose.e2e.yml's braces. That override is what makes the
 * app talk to kanban_e2e; this makes the truncation itself refuse if the app
 * is somehow pointed elsewhere — which is exactly what happened before either
 * existed, and cost a real board its cards and its configured author.
 */
const assertNotTheRealBoard = async (): Promise<void> => {
  const { stdout } = await run('docker', [
    'compose',
    'exec',
    '-T',
    'app',
    'sh',
    '-c',
    'echo "$DATABASE_URL"',
  ]);
  const target = stdout.trim().split('/').pop() ?? '';
  if (target !== E2E_DATABASE) {
    throw new Error(
      `Refusing to truncate: the app is pointed at "${target}", not ${E2E_DATABASE}. ` +
        'Start the browser stack with `npm run test:e2e`, which applies ' +
        'docker-compose.e2e.yml. Running playwright directly against the ' +
        'normal stack would empty the real board.',
    );
  }
};

/**
 * Empties the board between tests.
 *
 * Goes through psql in the db container rather than the API, because the API
 * deliberately exposes no bulk-delete and should not grow one just to make
 * tests convenient. The database port is not published to the host either, so
 * `compose exec` is the way in.
 */
export const resetBoard = async (): Promise<void> => {
  await assertNotTheRealBoard();
  await run('docker', [
    'compose',
    'exec',
    '-T',
    'db',
    'psql',
    '-U',
    process.env.POSTGRES_USER ?? 'kanban',
    '-d',
    E2E_DATABASE,
    '-c',
    // Settings are restored rather than truncated: the rows are seeded by
    // migration, so dropping them would leave the app with no query at all.
    // Resetting them matters — a test that changes the query would otherwise
    // leak it into every test that runs after it.
    `TRUNCATE card_events, card_tags, tags, jira_links, sync_runs, archive_runs, conflicts, cards RESTART IDENTITY CASCADE;
     -- Restored to the migration's seed, not truncated: a test that edits the
     -- mapping would otherwise leak into every later one. Rewritten wholesale
     -- because an unmapped column is the ABSENCE of a row, not a null in one.
     DELETE FROM column_status_mappings;
     INSERT INTO column_status_mappings (column_id, status_name)
       VALUES (1, 'Open'), (2, 'Development'), (4, 'Test'), (5, 'PO Approve');
     -- Restored wholesale, not key by key. Three settings have leaked between
     -- tests on this project, each fixed by adding one more line here;
     -- enumerating them means the next one added leaks until someone notices.
     UPDATE settings SET value = d.value FROM (VALUES
       ('jira.enabled', 'true'::jsonb),
       ('jira.jql', '"assignee = currentUser() AND statusCategory != Done"'::jsonb),
       ('sync.interval_seconds', '300'::jsonb),
       ('archive.window_days', '7'::jsonb),
       ('archive.interval_seconds', '3600'::jsonb)
     ) AS d(key, value) WHERE settings.key = d.key;`,
  ]);
};

/**
 * Puts a Jira-sourced card on the board without going near live Jira.
 *
 * The browser tests must not depend on what happens to be assigned to the user
 * today, and must not be able to disturb a real backlog. Seeding is the only
 * honest way to get a deterministic Jira card in front of the interface.
 */
export const seedJiraCard = async (opts: {
  key: string;
  summary: string;
  status?: string;
  columnId?: number;
}): Promise<void> => {
  const { key, summary, status = 'Open', columnId = 1 } = opts;
  const sql = `
    WITH new_card AS (
      INSERT INTO cards (source, title, priority, column_id, position)
      VALUES ('jira', $$${summary}$$, 'medium', ${columnId},
              COALESCE((SELECT max(position) FROM cards WHERE column_id = ${columnId}), 0) + 1)
      RETURNING id
    )
    INSERT INTO jira_links
      (card_id, issue_key, issue_id, url, status_name, status_id, jira_updated_at)
    SELECT id, $$${key}$$, '1',
           $$https://yourcompany.atlassian.net/browse/${key}$$,
           $$${status}$$, '10000', now()
      FROM new_card;`;
  await run('docker', [
    'compose',
    'exec',
    '-T',
    'db',
    'psql',
    '-U',
    process.env.POSTGRES_USER ?? 'kanban',
    '-d',
    E2E_DATABASE,
    '-c',
    sql,
  ]);
};

/**
 * Raises a conflict against an already-seeded Jira card, the way a sync that
 * found both sides changed would have.
 */
export const seedConflict = async (opts: {
  key: string;
  boardColumnId: number;
  jiraStatus: string;
}): Promise<void> => {
  const sql = `
    INSERT INTO conflicts (card_id, board_column_id, jira_status_at_detection, jira_status_current)
    SELECT card_id, ${opts.boardColumnId}, $$${opts.jiraStatus}$$, $$${opts.jiraStatus}$$
      FROM jira_links WHERE issue_key = $$${opts.key}$$;`;
  await run('docker', [
    'compose',
    'exec',
    '-T',
    'db',
    'psql',
    '-U',
    process.env.POSTGRES_USER ?? 'kanban',
    '-d',
    E2E_DATABASE,
    '-c',
    sql,
  ]);
};

/**
 * Puts `count` plain cards across the board's live columns in one statement.
 *
 * Through psql rather than the API for the same reason resetBoard is: fifty
 * sequential POSTs would make the density test slow enough that nobody runs it,
 * and what it asserts is about layout rather than about creation.
 */
export const seedCards = async (count: number): Promise<void> => {
  await run('docker', [
    'compose',
    'exec',
    '-T',
    'db',
    'psql',
    '-U',
    process.env.POSTGRES_USER ?? 'kanban',
    '-d',
    E2E_DATABASE,
    '-c',
    // Distributed across the live columns, because that is what a workload of
    // this size actually looks like — all of it in one column is a state no
    // real board reaches and no layout could serve.
    `INSERT INTO cards (title, column_id, position)
       SELECT 'Card ' || n,
              c.id,
              row_number() OVER (PARTITION BY c.id ORDER BY n)
         FROM generate_series(1, ${count}) AS n
         JOIN LATERAL (
           SELECT id FROM columns WHERE retired_at IS NULL
            ORDER BY position OFFSET (n - 1) % (SELECT count(*) FROM columns WHERE retired_at IS NULL)
            LIMIT 1
         ) AS c ON true`,
  ]);
};
