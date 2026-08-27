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
  mappings: z.array(
    z.object({
      // Not a literal range, and not a fixed length. Both were pinned to 1..6
      // until slice 5, which was true only while the columns happened to occupy
      // those ids — retiring Blocked and adding Iteration Items as id 7 made
      // every mapping payload fail with a message about the number 6. Which
      // columns are mappable is a fact about the database, checked below.
      columnId: z.number().int().positive(),
      statusName: z.string().nullable(),
    }),
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

    // The payload must name every mappable column exactly once. The repository
    // replaces the whole table, so a partial payload is silently destructive —
    // this makes that impossible by accident rather than by convention.
    const mappable = await mappings.mappableColumnIds();
    const sent = parsed.data.mappings.map((m) => m.columnId);
    const unique = new Set(sent);
    if (unique.size !== sent.length) {
      throw validationFailed('Every column must appear exactly once.');
    }
    if (sent.length !== mappable.length || mappable.some((id) => !unique.has(id))) {
      throw validationFailed(
        `The payload must name every column exactly once: ${mappable.join(', ')}.`,
      );
    }

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
