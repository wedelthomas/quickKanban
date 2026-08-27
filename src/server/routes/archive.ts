import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ArchivalService } from '../services/archival-service.js';
import type { ArchiveViewService } from '../services/archive-view-service.js';
import { validationFailed } from '../errors.js';

const rangeSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

export const registerArchiveRoutes = (
  app: FastifyInstance,
  archival: ArchivalService,
  view: ArchiveViewService,
): void => {
  /**
   * Runs an archival pass now.
   *
   * Exists for the same reason `POST /api/sync/run` does: an hourly background
   * process is neither testable nor observable if the only way to see it act
   * is to wait an hour.
   */
  app.post('/api/archive/run', async () => ({ run: await archival.runOnce() }));

  /**
   * The archive for a date range, grouped by completion date.
   *
   * An empty range is a 200 with no days, not a 404 — asking a reasonable
   * question and getting no answer is a successful request. A range that ends
   * before it starts IS refused, because that is a mistake to correct rather
   * than an answer to read.
   */
  app.get('/api/archive', async (request) => {
    const parsed = rangeSchema.safeParse(request.query);
    if (!parsed.success) throw validationFailed(parsed.error.issues[0]!.message);
    return view.read(parsed.data.from, parsed.data.to);
  });
};
