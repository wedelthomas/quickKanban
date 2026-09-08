import type { Iteration } from '../shared/types.js';

/**
 * Which iteration to show, and how honestly to label it.
 *
 * Pure, taking the clock as an argument. Three sources in order of trust: what
 * was just read, what was read last time, and what the calendar implies.
 *
 * The labelling is the point. A stale iteration on the banner is acceptable —
 * the board must work with Jira unreachable (BR-20). A stale iteration
 * presented as current is not, because the reader plans against it. FR-427.
 */

export interface ReadIteration {
  ordinalName: string;
  startsOn: string;
  endsOn: string;
}

export interface CachedIteration extends ReadIteration {
  observedAt: string;
}

export interface FallbackConfig {
  anchorDate: string;
  cadenceDays: number;
}

const MS_PER_DAY = 86_400_000;

const atLocalMidnight = (iso: string): Date => {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year!, month! - 1, day!);
};

const toIso = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

/**
 * The period the calendar implies for `now`.
 *
 * Deliberately produces no ordinal name. The sprint number resets at the fiscal
 * year — the PI calendar spans "Sprint 20 - 1" and "Sprints 23 - 3" — so
 * counting cadences from an anchor is wrong every January. An iteration with no
 * name is visibly incomplete; one with a confidently wrong number is not.
 */
const estimate = (
  config: FallbackConfig,
  now: Date,
): Omit<Iteration, 'workingDaysRemaining'> => {
  const anchor = atLocalMidnight(config.anchorDate);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const elapsedDays = Math.floor((today.getTime() - anchor.getTime()) / MS_PER_DAY);
  // Math.floor, not truncation: a date before the anchor must round DOWN to the
  // previous period rather than toward zero, or every date in the fortnight
  // before the anchor lands in the anchor's own period.
  const periods = Math.floor(elapsedDays / config.cadenceDays);
  const start = addDays(anchor, periods * config.cadenceDays);

  return {
    ordinalName: null,
    startsOn: toIso(start),
    endsOn: toIso(addDays(start, config.cadenceDays)),
    provenance: 'estimated',
    observedAt: now.toISOString(),
  };
};

export const decideIteration = ({
  read,
  cached,
  config,
  now,
}: {
  read: ReadIteration | null;
  cached: CachedIteration | null;
  config: FallbackConfig | null;
  now: Date;
}): Omit<Iteration, 'workingDaysRemaining'> | null => {
  if (read) {
    // Trusted even when its dates look elapsed: if the source says this is the
    // active sprint then it is, and teams do extend sprints past their end date.
    return { ...read, provenance: 'read', observedAt: now.toISOString() };
  }

  if (cached) {
    const ended =
      atLocalMidnight(cached.endsOn) <
      new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // An ended cached iteration is worse than an estimate: it is a specific,
    // confident, wrong claim about which iteration we are in (FR-432).
    if (!ended) {
      return {
        ordinalName: cached.ordinalName,
        startsOn: cached.startsOn,
        endsOn: cached.endsOn,
        provenance: 'cached',
        observedAt: cached.observedAt,
      };
    }
  }

  return config ? estimate(config, now) : null;
};
