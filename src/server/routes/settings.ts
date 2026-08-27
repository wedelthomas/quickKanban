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
    // Bounded so a heading cannot push the board off screen. Empty is valid and
    // means "use the product name".
    author: z.string().trim().max(60).optional(),

    // Slice 5. Every bound below is a real constraint rather than a round
    // number: a cadence outside 1–90 days is not an iteration, an end hour at
    // or before the start hour is not a working day, and a working week with no
    // days in it would make "days remaining" permanently zero.
    iterationBoardId: z.number().int().positive().optional(),
    iterationTeamName: z.string().trim().min(1).max(80).optional(),
    iterationAnchorDate: z
      .string()
      .regex(
        /^\d{4}-\d{2}-\d{2}$/,
        'The anchor date must be a calendar date, YYYY-MM-DD.',
      )
      .optional(),
    iterationCadenceDays: z.number().int().min(1).max(90).optional(),
    workingDays: z
      .array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']))
      .min(1, 'At least one working day is required.')
      .optional(),
    workingStartHour: z.number().int().min(0).max(23).optional(),
    workingEndHour: z.number().int().min(0).max(23).optional(),

    // A Jira administration change should be a settings edit, not a code change
    // (FR-438). The pattern is what Jira actually issues.
    jiraFieldBlocked: z
      .string()
      .regex(/^customfield_\d+$/)
      .optional(),
    jiraFieldBlockedOption: z.string().trim().min(1).max(60).optional(),
    jiraFieldSprint: z
      .string()
      .regex(/^customfield_\d+$/)
      .optional(),
    jiraFieldStoryPoints: z
      .string()
      .regex(/^customfield_\d+$/)
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change.')
  .refine(
    (v) =>
      v.workingStartHour === undefined ||
      v.workingEndHour === undefined ||
      v.workingStartHour < v.workingEndHour,
    'The working day must start before it ends.',
  );

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
    // Changing which board or team the iteration comes from takes effect on the
    // next read rather than next poll: the banner is fetched per page load, so
    // there is no schedule to re-arm.
    if (parsed.data.archiveIntervalSeconds !== undefined) onArchiveIntervalChanged();
    return updated;
  });
};
