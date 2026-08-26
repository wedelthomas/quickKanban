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
    '-c', 'TRUNCATE card_events, card_tags, tags, cards RESTART IDENTITY CASCADE',
  ]);
};
