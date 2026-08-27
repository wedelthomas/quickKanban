import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { MappingRepository } from '../repositories/mapping-repository.js';
import type { JiraPort } from '../jira/jira-port.js';
import { jiraNotConfigured, validationFailed } from '../errors.js';

/**
 * The payload must name every column, not merely one.
 *
 * The repository replaces the whole table — correct semantics for a PUT on a
 * collection — which makes a partial payload silently destructive: sending one
 * entry would erase the other five columns' mappings. Requiring the full set
 * makes that impossible to do by accident rather than by convention.
 */
const putSchema = z.object({
  mappings: z
    .array(
      z.object({
        columnId: z.number().int().min(1).max(6),
        statusName: z.string().nullable(),
      }),
    )
    .length(6)
    .refine(
      (m) => new Set(m.map((entry) => entry.columnId)).size === 6,
      'Every column must appear exactly once.',
    ),
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

    // Checked here rather than only in the editor's dropdown: the API is the
    // boundary, and a guarantee that lives only in the client is not one. Left
    // unchecked when Jira is unconfigured — there is nothing to check against,
    // and refusing every mapping would make the board unconfigurable offline.
    if (jira) {
      const known = new Set(
        (await jira.listStatuses()).map((name) => name.toLowerCase()),
      );
      const unknown = parsed.data.mappings.find(
        (m) => m.statusName && !known.has(m.statusName.trim().toLowerCase()),
      );
      if (unknown) {
        throw validationFailed(`Jira reports no status named "${unknown.statusName}".`);
      }
    }

    return { mappings: await mappings.replace(parsed.data.mappings) };
  });

  // So a mapping is chosen from what Jira reports rather than typed (FR-202).
  // A typo in a status name is otherwise invisible until a move is refused.
  app.get('/api/jira/statuses', async () => {
    if (!jira) throw jiraNotConfigured();
    return { statuses: await jira.listStatuses() };
  });
};
