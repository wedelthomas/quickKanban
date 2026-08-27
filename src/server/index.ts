import { createPool } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { buildApp, defaultWebRoot } from './app.js';
import { readJiraCredentials } from './jira/credentials.js';
import { JiraAdapter } from './jira/jira-adapter.js';
import { SyncRunRepository } from './repositories/sync-run-repository.js';
import { SettingsRepository } from './repositories/settings-repository.js';
import { SyncLock } from './sync/sync-lock.js';
import { Scheduler } from './sync/scheduler.js';

/**
 * Process entry: migrate, then serve. In that order and never concurrently —
 * the board must not accept a request against a schema that is still being
 * applied (FR-031).
 */
const main = async (): Promise<void> => {
  const pool = createPool();

  try {
    const applied = await runMigrations(pool);
    if (applied.length > 0) {
      console.error(`Applied ${applied.length} migration(s): ${applied.join(', ')}`);
    }
  } catch (error) {
    // Fail loudly. Serving a board that silently discards writes is worse than
    // not serving one at all (FR-037).
    console.error('Could not reach or migrate the database. The board will not start.');
    console.error((error as Error).message);
    process.exit(1);
  }

  // A run left unfinished by a crash would otherwise hold the in-flight slot
  // forever and make every later sync look like a duplicate.
  await new SyncRunRepository(pool).abandonUnfinished();

  // Null when Jira is not configured — a supported state, not a failure
  // (FR-105). The board serves ad-hoc cards exactly as it did in slice 1.
  const credentials = readJiraCredentials();
  const jira = credentials ? new JiraAdapter(credentials) : null;
  console.error(
    jira
      ? `Jira configured: ${credentials!.baseUrl}`
      : 'Jira not configured — the board will run with ad-hoc cards only.',
  );

  // The scheduler shares the routes' lock, so a scheduled sync and a manual
  // refresh cannot both run — the second joins the first (FR-129).
  const lock = new SyncLock();
  const settings = new SettingsRepository(pool);
  let scheduler: Scheduler | null = null;

  const app = buildApp({
    pool,
    webRoot: defaultWebRoot(),
    jira,
    lock,
    onIntervalChanged: () => scheduler?.reschedule(),
  });

  if (jira) {
    scheduler = new Scheduler(
      async () => {
        const res = await app.inject({ method: 'POST', url: '/api/sync/run' });
        if (res.statusCode >= 400)
          throw new Error(`scheduled sync failed: ${res.statusCode}`);
      },
      async () => (await settings.read()).syncIntervalSeconds,
    );
    scheduler.start();
    console.error('Sync scheduler started.');
  }

  // FR-034 restricts the board to the host's loopback interface, but the
  // mechanism is the compose publish spec (`127.0.0.1:3000:3000`), NOT this
  // bind address. Inside a container, binding 127.0.0.1 would bind the
  // *container's* loopback, which Docker cannot forward a published port to —
  // the board would simply be unreachable. So bind all interfaces within the
  // container's own network namespace and let the publish spec decide what the
  // host exposes. tests/ops/loopback.test.ts is what keeps that claim true.
  const host = process.env.HOST ?? '0.0.0.0';
  const port = Number(process.env.PORT ?? 3000);

  await app.listen({ host, port });

  const shutdown = async (): Promise<void> => {
    scheduler?.stop();
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
