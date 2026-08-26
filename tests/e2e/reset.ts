import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * Empties the board between tests.
 *
 * Goes through psql in the db container rather than the API, because the API
 * deliberately exposes no bulk-delete and should not grow one just to make
 * tests convenient. The database port is not published to the host either, so
 * `compose exec` is the way in.
 */
export const resetBoard = async (): Promise<void> => {
  await run('docker', [
    'compose', 'exec', '-T', 'db',
    'psql', '-U', process.env.POSTGRES_USER ?? 'kanban',
    '-d', process.env.POSTGRES_DB ?? 'kanban',
    '-c',
    // Settings are restored rather than truncated: the rows are seeded by
    // migration, so dropping them would leave the app with no query at all.
    // Resetting them matters — a test that changes the query would otherwise
    // leak it into every test that runs after it.
    `TRUNCATE card_events, card_tags, tags, jira_links, sync_runs, cards RESTART IDENTITY CASCADE;
     UPDATE settings SET value = '"assignee = currentUser() AND statusCategory != Done"'::jsonb
      WHERE key = 'jira.jql';
     UPDATE settings SET value = '300'::jsonb WHERE key = 'sync.interval_seconds';`,
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
           $$https://tsgjira.atlassian.net/browse/${key}$$,
           $$${status}$$, '10000', now()
      FROM new_card;`;
  await run('docker', [
    'compose', 'exec', '-T', 'db',
    'psql', '-U', process.env.POSTGRES_USER ?? 'kanban',
    '-d', process.env.POSTGRES_DB ?? 'kanban', '-c', sql,
  ]);
};
