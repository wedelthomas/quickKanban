import type { FastifyInstance } from 'fastify';
import type { SyncService } from '../sync/sync-service.js';
import type { SyncLock } from '../sync/sync-lock.js';
import type { SyncRunRepository } from '../repositories/sync-run-repository.js';
import { jiraNotConfigured } from '../errors.js';

export const registerSyncRoutes = (
  app: FastifyInstance,
  deps: {
    sync: SyncService | null;
    lock: SyncLock;
    runs: SyncRunRepository;
  },
): void => {
  app.post('/api/sync/run', async () => {
    if (!deps.sync) throw jiraNotConfigured();
    // Joins an in-flight sync rather than starting a second (FR-129), so
    // fifty impatient refreshes produce one sync and fifty identical answers.
    return { run: await deps.lock.run(() => deps.sync!.run()) };
  });

  app.get('/api/sync/status', async () => ({
    // Not-configured is a normal state, not an error (FR-105).
    configured: deps.sync !== null,
    running: deps.lock.running,
    lastSuccessAt: await deps.runs.lastSuccessAt(),
    lastRun: await deps.runs.latest(),
  }));
};
