import type { FastifyInstance } from 'fastify';
import {
  createCardSchema,
  moveCardSchema,
  updateCardSchema,
} from '../../domain/validation.js';
import { titleRequired, validationFailed } from '../errors.js';
import type { CardService } from '../services/card-service.js';
import type { EventRepository } from '../repositories/event-repository.js';

export const registerCardRoutes = (
  app: FastifyInstance,
  cards: CardService,
  events: EventRepository,
): void => {
  app.post('/api/cards', async (request, reply) => {
    const parsed = createCardSchema.safeParse(request.body);
    if (!parsed.success) {
      // A blank title gets its own code because the interface reacts to it
      // differently from any other validation failure (FR-004, contracts/api.md).
      const titleIssue = parsed.error.issues.find((i) => i.path[0] === 'title');
      throw titleIssue
        ? titleRequired()
        : validationFailed(parsed.error.issues[0]!.message);
    }
    return reply.status(201).send(await cards.create(parsed.data));
  });

  app.patch<{ Params: { id: string } }>('/api/cards/:id', async (request) => {
    const parsed = updateCardSchema.safeParse(request.body);
    if (!parsed.success) {
      const titleIssue = parsed.error.issues.find((i) => i.path[0] === 'title');
      throw titleIssue
        ? titleRequired()
        : validationFailed(parsed.error.issues[0]!.message);
    }
    return cards.update(request.params.id, parsed.data);
  });

  app.delete<{ Params: { id: string } }>('/api/cards/:id', async (request, reply) => {
    await cards.delete(request.params.id);
    return reply.status(204).send();
  });

  app.post<{ Params: { id: string } }>('/api/cards/:id/move', async (request) => {
    const parsed = moveCardSchema.safeParse(request.body);
    if (!parsed.success) throw validationFailed(parsed.error.issues[0]!.message);
    // The response always carries the card's authoritative position, so the
    // browser reconciles its optimistic guess against fact rather than
    // assuming the move landed where it drew it.
    return cards.move(request.params.id, parsed.data);
  });

  // Exists so the movement history can be asserted without reading the
  // database directly. Nothing in slice 1 displays it; slice 4's archive and
  // summary are what eventually read it.
  app.get<{ Params: { id: string } }>('/api/cards/:id/events', async (request) => ({
    events: await events.listForCard(request.params.id),
  }));
};
