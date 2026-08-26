import type { FastifyInstance } from 'fastify';
import { createCardSchema, moveCardSchema } from '../../domain/validation.js';
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

  app.post<{ Params: { id: string } }>('/api/cards/:id/move', async (request) => {
    const parsed = moveCardSchema.safeParse(request.body);
    if (!parsed.success) throw validationFailed(parsed.error.issues[0]!.message);
    // The response always carries the card's authoritative position, so the
    // browser reconciles its optimistic guess against fact rather than
    // assuming the move landed where it drew it.
    return cards.move(request.params.id, parsed.data);
  });
};
