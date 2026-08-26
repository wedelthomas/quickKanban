import type { FastifyInstance } from 'fastify';
import type { TagRepository } from '../repositories/tag-repository.js';

export const registerTagRoutes = (app: FastifyInstance, tags: TagRepository): void => {
  app.get<{ Querystring: { q?: string } }>('/api/tags', async (request) => ({
    tags: await tags.suggest(request.query.q ?? ''),
  }));
};
