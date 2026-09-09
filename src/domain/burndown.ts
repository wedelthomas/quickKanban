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
 * The LOCAL calendar day an ISO timestamp falls on — not its first ten
 * characters. `occurredAt` and `cancelledAt` arrive as UTC ISO strings
 * (Postgres timestamptz round-tripped through `toISOString()`); slicing
 * them directly reads the UTC date, which disagrees with the day-loop
 * below (built from `atLocalMidnight`/local `Date` accessors) for any host
 * west of Greenwich — including this app's own documented default
 * timezone, America/Costa_Rica (UTC-6), where anything from 6pm onward
 * local time has already rolled to the next UTC day.
 */
const localDay = (occurredAt: string): string => toIsoDate(new Date(occurredAt));

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
  const withdrawnByDay = new Map<string, number>();

  for (const card of cards) {
    if (card.points === null) continue;
    const points = card.points;
    const done = card.movements.find((m) => m.columnKey === 'done');
    const entry = firstWorkingEntry(card.movements);
    const last = lastMovement(card.movements);

    if (done) {
      const key = localDay(done.occurredAt);
      completedByDay.set(key, (completedByDay.get(key) ?? 0) + points);
      continue;
    }

    // Cancelled after being part of the original commitment: withdrawn,
    // dated the day of cancellation (FR-617..FR-619) — reported separately
    // from scopeRemoved, the same distinction iteration-report.ts's own
    // derivation makes (R-3). A card added mid-iteration and then cancelled
    // contributes to neither: never committed scope to withdraw (FR-625).
    if (card.cancelledAt !== null) {
      if (entry && entry.occurredAt <= committedAt) {
        const key = localDay(card.cancelledAt);
        withdrawnByDay.set(key, (withdrawnByDay.get(key) ?? 0) + points);
      }
      continue;
    }

    // Joined a working column after the commitment was taken: scope added.
    if (entry && entry.occurredAt > committedAt) {
      const key = localDay(entry.occurredAt);
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
      const key = localDay(last.occurredAt);
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
    const withdrawnThatDay = withdrawnByDay.get(iso) ?? 0;
    outstanding =
      outstanding - completedThatDay + scopeAddedThatDay - scopeRemovedThatDay - withdrawnThatDay;
    points.push({
      date: iso,
      outstanding,
      completedThatDay,
      scopeAddedThatDay,
      scopeRemovedThatDay,
      withdrawnThatDay,
    });
  }

  return points;
};
