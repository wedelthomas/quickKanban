import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { isReachable } from '../db/pool.js';

export const registerHealthRoutes = (app: FastifyInstance, pool: pg.Pool): void => {
  app.get('/api/health', async (_request, reply) => {
    const reachable = await isReachable(pool);
    if (!reachable) {
      return reply
        .status(503)
        .send({ status: 'degraded', database: 'unreachable' });
    }
    return reply.send({ status: 'ok', database: 'ok' });
  });
};
