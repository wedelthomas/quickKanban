import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ConflictRepository } from '../repositories/conflict-repository.js';
import type { ConflictResolutionService } from '../sync/conflict-resolution-service.js';
import type { CardRepository } from '../repositories/card-repository.js';
import { validationFailed } from '../errors.js';

const resolveSchema = z.object({
  // Exactly two. A third option would mean inventing a state neither side
  // asked for, which is what raising the conflict was meant to avoid.
  resolution: z.enum(['kept_board', 'accepted_jira']),
});

export const registerConflictRoutes = (
  app: FastifyInstance,
  conflicts: ConflictRepository,
  resolution: ConflictResolutionService,
  cards: CardRepository,
  columnName: (id: number) => Promise<string>,
): void => {
  app.get('/api/conflicts', async () => {
    const open = await conflicts.listOpen();
    const today = new Date();
    return {
      conflicts: await Promise.all(
        open.map(async (c) => ({
          id: c.id,
          card: await cards.findById(c.cardId, today),
          board: {
            columnId: c.boardColumnId,
            columnName: await columnName(c.boardColumnId),
          },
          jira: {
            statusAtDetection: c.statusAtDetection,
            statusCurrent: c.statusCurrent,
          },
          raisedAt: c.raisedAt,
        })),
      ),
    };
  });

  app.post<{ Params: { id: string } }>(
    '/api/conflicts/:id/resolve',
    async (request, reply) => {
      const parsed = resolveSchema.safeParse(request.body);
      if (!parsed.success) throw validationFailed(parsed.error.issues[0]!.message);
      const id = Number(request.params.id);
      if (parsed.data.resolution === 'kept_board') await resolution.keepBoard(id);
      else await resolution.acceptJira(id);

      return reply.status(204).send();
    },
  );
};
