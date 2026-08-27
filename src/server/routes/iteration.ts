import type { FastifyInstance } from 'fastify';
import type { IterationService } from '../services/iteration-service.js';

/**
 * The banner's source.
 *
 * Always answers 200, even with nothing to say: a null body is a valid state
 * meaning "no iteration could be established", and the board renders without a
 * banner. Answering 5xx would make a failing iteration look like a failing
 * application, which FR-430 forbids — the board works perfectly well without
 * knowing what iteration it is.
 */
export const registerIterationRoutes = (
  app: FastifyInstance,
  iterations: IterationService,
): void => {
  app.get('/api/iteration', async () => {
    try {
      return await iterations.current();
    } catch {
      // The service is written not to throw. This is the belt to that brace:
      // a bug here must not take the board's own load path with it.
      return null;
    }
  });
};
