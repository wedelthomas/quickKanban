import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { SettingsRepository } from '../repositories/settings-repository.js';
import { validationFailed } from '../errors.js';
import { validateJql } from '../../domain/jql.js';

/**
 * Below a minute the poll is pointless against Jira's rate limits; above an
 * hour the board is stale enough to mislead.
 */
const updateSchema = z
  .object({
    jiraJql: z.string().optional(),
    syncIntervalSeconds: z.number().int().min(60).max(3600).optional(),
    // Zero is valid and means "at the next pass" — the spec calls that
    // permitted and the user's choice, so the lower bound is zero, not one.
    archiveWindowDays: z.number().int().min(0).max(365).optional(),
    archiveIntervalSeconds: z.number().int().min(300).max(86_400).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change.');

export const registerSettingsRoutes = (
  app: FastifyInstance,
  settings: SettingsRepository,
  /** Re-armed when the cadence changes, so it takes effect now, not next tick. */
  onIntervalChanged: () => void = () => {},
  /** Same reasoning, for the archival pass's own cadence. */
  onArchiveIntervalChanged: () => void = () => {},
): void => {
  // Returns the query and the interval. There is no credential here and no
  // field for one — anything the interface can display, it can leak (FR-102).
  app.get('/api/settings', async () => settings.read());

  app.put('/api/settings', async (request) => {
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) throw validationFailed(parsed.error.issues[0]!.message);

    if (parsed.data.jiraJql !== undefined) {
      const check = validateJql(parsed.data.jiraJql);
      if (!check.ok) throw validationFailed(check.reason!);
    }
    const updated = await settings.write(parsed.data);
    if (parsed.data.syncIntervalSeconds !== undefined) onIntervalChanged();
    if (parsed.data.archiveIntervalSeconds !== undefined) onArchiveIntervalChanged();
    return updated;
  });
};
