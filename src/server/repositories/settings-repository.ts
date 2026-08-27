import type pg from 'pg';
import type { Settings } from '../../shared/types.js';

const KEYS = {
  jql: 'jira.jql',
  interval: 'sync.interval_seconds',
  archiveWindow: 'archive.window_days',
  archiveInterval: 'archive.interval_seconds',
} as const;

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
      jiraJql: String(byKey.get(KEYS.jql) ?? ''),
      syncIntervalSeconds: Number(byKey.get(KEYS.interval) ?? 300),
      archiveWindowDays: Number(byKey.get(KEYS.archiveWindow) ?? 7),
      archiveIntervalSeconds: Number(byKey.get(KEYS.archiveInterval) ?? 3600),
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
