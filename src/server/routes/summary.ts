import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { SummaryService } from '../services/summary-service.js';
import { validationFailed } from '../errors.js';

// Only the two the spec requires (FR-325). An arbitrary range is out of scope,
// and offering one would need its own decision about what a summary of six
// months even means.
const querySchema = z.object({
  period: z.enum(['daily', 'weekly']).default('daily'),
});

export const registerSummaryRoutes = (
  app: FastifyInstance,
  summaries: SummaryService,
): void => {
  app.get('/api/summary', async (request) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) throw validationFailed(parsed.error.issues[0]!.message);
    return summaries.generate(parsed.data.period);
  });
};
