import type { FastifyInstance } from 'fastify';
import { createCardSchema } from '../../domain/validation.js';
import { titleRequired, validationFailed } from '../errors.js';
import type { CardService } from '../services/card-service.js';

export const registerCardRoutes = (app: FastifyInstance, cards: CardService): void => {
  app.post('/api/cards', async (request, reply) => {
    const parsed = createCardSchema.safeParse(request.body);
    if (!parsed.success) {
      // A blank title gets its own code because the interface reacts to it
      // differently from any other validation failure (FR-004, contracts/api.md).
      const titleIssue = parsed.error.issues.find((i) => i.path[0] === 'title');
      throw titleIssue ? titleRequired() : validationFailed(parsed.error.issues[0]!.message);
    }
    return reply.status(201).send(await cards.create(parsed.data));
  });
};
