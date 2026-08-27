import type { FastifyInstance } from 'fastify';
import type { ArchivalService } from '../services/archival-service.js';

/**
 * Runs an archival pass now.
 *
 * Exists for the same reason `POST /api/sync/run` does: an hourly background
 * process is neither testable nor observable if the only way to see it act is
 * to wait an hour.
 */
export const registerArchiveRoutes = (
  app: FastifyInstance,
  archival: ArchivalService,
): void => {
  app.post('/api/archive/run', async () => ({ run: await archival.runOnce() }));
};
