import type { BurndownPoint, IterationCommitment, WorkingDay } from '../shared/types.js';
import type { ReportInputCard } from './iteration-report.js';
import {
  atLocalMidnight,
  firstWorkingEntry,
  lastMovement,
  WORKING_COLUMN_KEYS,
} from './elapsed-time.js';

const DAY_KEYS: WorkingDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export interface BurndownCalendar {
  workingDays: WorkingDay[];
}

export interface BurndownInput {
  startsOn: string;
  endsOn: string;
  commitment: IterationCommitment | null;
  cards: ReportInputCard[];
  calendar: BurndownCalendar;
  now: Date;
}

const toIsoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Outstanding committed points at the close of each working day (FR-531),
 * with every movement attributed to completion or scope (FR-532, R-5) —
 * the same derivation `iteration-report.ts` uses for its cumulative
 * committed/completed/scopeAdded/scopeRemoved figures, applied per day
 * instead of once for the whole span.
 *
 * Pure — no I/O, no clock read internally (matches elapsed-time.ts's own
 * contract, FR-544).
 */
export const buildBurndown = (input: BurndownInput): BurndownPoint[] => {
  const { startsOn, endsOn, commitment, cards, calendar, now } = input;
  const committedPoints = commitment?.committedPoints ?? 0;
  const committedAt = commitment?.committedAt ?? `${startsOn}T00:00:00`;

  const completedByDay = new Map<string, number>();
  const scopeAddedByDay = new Map<string, number>();
  const scopeRemovedByDay = new Map<string, number>();

  for (const card of cards) {
    if (card.points === null) continue;
    const points = card.points;
    const done = card.movements.find((m) => m.columnKey === 'done');
    const entry = firstWorkingEntry(card.movements);
    const last = lastMovement(card.movements);

    if (done) {
      const key = done.occurredAt.slice(0, 10);
      completedByDay.set(key, (completedByDay.get(key) ?? 0) + points);
      continue;
    }

    // Joined a working column after the commitment was taken: scope added.
    if (entry && entry.occurredAt > committedAt) {
      const key = entry.occurredAt.slice(0, 10);
      scopeAddedByDay.set(key, (scopeAddedByDay.get(key) ?? 0) + points);
    }

    // Was working at commitment time and has since left every working
    // column without reaching Done: scope removed.
    if (
      entry &&
      entry.occurredAt <= committedAt &&
      last &&
      last !== entry &&
      !WORKING_COLUMN_KEYS.has(last.columnKey)
    ) {
      const key = last.occurredAt.slice(0, 10);
      scopeRemovedByDay.set(key, (scopeRemovedByDay.get(key) ?? 0) + points);
    }
  }

  const start = atLocalMidnight(startsOn);
  const end = atLocalMidnight(endsOn);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // A running iteration's burndown stops at today (FR-533, BH-525); a
  // completed iteration's covers its full recorded span (FR-534, BH-526).
  const lastDay = today < end ? today : end;

  const working = new Set(calendar.workingDays);
  const points: BurndownPoint[] = [];
  let outstanding = committedPoints;

  for (const day = new Date(start); day <= lastDay; day.setDate(day.getDate() + 1)) {
    if (!working.has(DAY_KEYS[day.getDay()]!)) continue;
    const iso = toIsoDate(day);
    const completedThatDay = completedByDay.get(iso) ?? 0;
    const scopeAddedThatDay = scopeAddedByDay.get(iso) ?? 0;
    const scopeRemovedThatDay = scopeRemovedByDay.get(iso) ?? 0;
    outstanding = outstanding - completedThatDay + scopeAddedThatDay - scopeRemovedThatDay;
    points.push({ date: iso, outstanding, completedThatDay, scopeAddedThatDay, scopeRemovedThatDay });
  }

  return points;
};
