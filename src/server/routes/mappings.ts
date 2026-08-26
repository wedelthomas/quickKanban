import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { MappingRepository } from '../repositories/mapping-repository.js';
import type { JiraPort } from '../jira/jira-port.js';
import { jiraNotConfigured, validationFailed } from '../errors.js';

const putSchema = z.object({
  mappings: z
    .array(z.object({ columnId: z.number().int().min(1).max(6), statusName: z.string().nullable() }))
    .min(1),
});

export const registerMappingRoutes = (
  app: FastifyInstance,
  mappings: MappingRepository,
  jira: JiraPort | null,
): void => {
  app.get('/api/settings/mappings', async () => ({ mappings: await mappings.list() }));

  app.put('/api/settings/mappings', async (request) => {
    const parsed = putSchema.safeParse(request.body);
    if (!parsed.success) throw validationFailed(parsed.error.issues[0]!.message);
    return { mappings: await mappings.replace(parsed.data.mappings) };
  });

  // So a mapping is chosen from what Jira reports rather than typed (FR-202).
  // A typo in a status name is otherwise invisible until a move is refused.
  app.get('/api/jira/statuses', async () => {
    if (!jira) throw jiraNotConfigured();
    return { statuses: await jira.listStatuses() };
  });
};
