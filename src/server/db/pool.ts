import pg from 'pg';

/**
 * A single pool for the process. Timeouts are deliberately short: this is a
 * local database on the same compose network, so a slow query means something
 * is wrong rather than something is busy.
 */
export const createPool = (connectionString = process.env.DATABASE_URL): pg.Pool => {
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env and fill it in — see README.',
    );
  }
  return new pg.Pool({
    connectionString,
    statement_timeout: 5_000,
    connectionTimeoutMillis: 10_000,
    max: 10,
  });
};

/** Health reads this. Liveness of the process says nothing about the store. */
export const isReachable = async (pool: pg.Pool): Promise<boolean> => {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
};
