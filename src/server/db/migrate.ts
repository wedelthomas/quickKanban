import type pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { join } from 'node:path';

/**
 * Numbered SQL applied in order, each inside a transaction, tracked in
 * schema_migrations. Forward-only: with one database and one user, a
 * down-migration path is machinery for a rollback that never happens — the
 * rollback that does happen is redeploying the previous image, which does not
 * touch the schema.
 *
 * This is ~40 lines instead of a migration framework's dependency, CLI and
 * config file. See research.md.
 */
export const runMigrations = async (pool: pg.Pool): Promise<string[]> => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const dir = fileURLToPath(new URL('./migrations', import.meta.url));
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

  const { rows } = await pool.query<{ version: string }>(
    'SELECT version FROM schema_migrations',
  );
  const applied = new Set(rows.map((r) => r.version));

  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = await readFile(join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      await client.query('COMMIT');
      ran.push(file);
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`, {
        cause: error,
      });
    } finally {
      client.release();
    }
  }
  return ran;
};
