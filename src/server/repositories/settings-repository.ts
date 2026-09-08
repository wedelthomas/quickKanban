import type pg from 'pg';
import type { Settings, WorkingDay } from '../../shared/types.js';

const KEYS = {
  jiraEnabled: 'jira.enabled',
  jql: 'jira.jql',
  interval: 'sync.interval_seconds',
  archiveWindow: 'archive.window_days',
  archiveInterval: 'archive.interval_seconds',
  iterationBoardId: 'iteration.board_id',
  iterationTeamName: 'iteration.team_name',
  iterationAnchorDate: 'iteration.anchor_date',
  iterationCadenceDays: 'iteration.cadence_days',
  workingDays: 'working.days',
  workingStartHour: 'working.start_hour',
  workingEndHour: 'working.end_hour',
  jiraFieldBlocked: 'jira.field.blocked',
  jiraFieldBlockedOption: 'jira.field.blocked_option',
  jiraFieldSprint: 'jira.field.sprint',
  jiraFieldStoryPoints: 'jira.field.story_points',
  author: 'board.author',
} as const;

const DEFAULT_WORKING_DAYS: WorkingDay[] = ['mon', 'tue', 'wed', 'thu', 'fri'];

/**
 * Typed access to the key/value settings table. Holds the query and the poll
 * interval — things the user changes — and deliberately nothing that
 * authenticates.
 */
export class SettingsRepository {
  constructor(private readonly pool: pg.Pool) {}

  async read(): Promise<Settings> {
    const { rows } = await this.pool.query<{ key: string; value: unknown }>(
      'SELECT key, value FROM settings WHERE key = ANY($1)',
      [Object.values(KEYS)],
    );
    const byKey = new Map(rows.map((r) => [r.key, r.value]));
    return {
      jiraEnabled: Boolean(byKey.get(KEYS.jiraEnabled) ?? false),
      jiraJql: String(byKey.get(KEYS.jql) ?? ''),
      syncIntervalSeconds: Number(byKey.get(KEYS.interval) ?? 300),
      archiveWindowDays: Number(byKey.get(KEYS.archiveWindow) ?? 7),
      archiveIntervalSeconds: Number(byKey.get(KEYS.archiveInterval) ?? 3600),

      // Defaults mirror 021_iteration_settings.sql, every one verified against
      // the live Jira. They are repeated here so a settings row deleted by hand
      // degrades to a working value rather than to NaN.
      iterationBoardId: Number(byKey.get(KEYS.iterationBoardId) ?? 4200),
      iterationTeamName: String(byKey.get(KEYS.iterationTeamName) ?? 'Anchor Team'),
      iterationAnchorDate: String(byKey.get(KEYS.iterationAnchorDate) ?? '2026-08-24'),
      iterationCadenceDays: Number(byKey.get(KEYS.iterationCadenceDays) ?? 14),
      workingDays:
        (byKey.get(KEYS.workingDays) as WorkingDay[] | undefined) ?? DEFAULT_WORKING_DAYS,
      workingStartHour: Number(byKey.get(KEYS.workingStartHour) ?? 9),
      workingEndHour: Number(byKey.get(KEYS.workingEndHour) ?? 17),
      jiraFieldBlocked: String(byKey.get(KEYS.jiraFieldBlocked) ?? 'customfield_10003'),
      jiraFieldBlockedOption: String(byKey.get(KEYS.jiraFieldBlockedOption) ?? 'Blocked'),
      jiraFieldSprint: String(byKey.get(KEYS.jiraFieldSprint) ?? 'customfield_10000'),
      jiraFieldStoryPoints: String(
        byKey.get(KEYS.jiraFieldStoryPoints) ?? 'customfield_10005',
      ),
      author: String(byKey.get(KEYS.author) ?? ''),
    };
  }

  async write(patch: Partial<Settings>): Promise<Settings> {
    const entries: [string, unknown][] = [];
    if (patch.jiraJql !== undefined) entries.push([KEYS.jql, patch.jiraJql]);
    if (patch.syncIntervalSeconds !== undefined) {
      entries.push([KEYS.interval, patch.syncIntervalSeconds]);
    }
    if (patch.archiveWindowDays !== undefined) {
      entries.push([KEYS.archiveWindow, patch.archiveWindowDays]);
    }
    if (patch.archiveIntervalSeconds !== undefined) {
      entries.push([KEYS.archiveInterval, patch.archiveIntervalSeconds]);
    }
    // The slice 5 settings are uniform — no per-field handling, unlike the
    // four above which predate this shape.
    for (const name of [
      'jiraEnabled',
      'iterationBoardId',
      'iterationTeamName',
      'iterationAnchorDate',
      'iterationCadenceDays',
      'workingDays',
      'workingStartHour',
      'workingEndHour',
      'jiraFieldBlocked',
      'jiraFieldBlockedOption',
      'jiraFieldSprint',
      'jiraFieldStoryPoints',
      'author',
    ] as const) {
      if (patch[name] !== undefined) entries.push([KEYS[name], patch[name]]);
    }
    for (const [key, value] of entries) {
      await this.pool.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2::jsonb)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, JSON.stringify(value)],
      );
    }
    return this.read();
  }
}
