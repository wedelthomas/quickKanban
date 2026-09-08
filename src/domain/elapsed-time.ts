import type { WorkingDay } from '../shared/types.js';

/**
 * Working seconds a card spent "in progress," derived entirely from its
 * movement and blocked-interval history. FR-501…FR-514.
 *
 * Pure, and takes its clock as an argument, the same convention
 * `working-days.ts` established: "how much time has this card cost" is a
 * question about a specific moment, and a function that read the clock
 * itself could only be tested by moving the machine's.
 *
 * All timestamps are read in local terms (`Date`'s own getters), matching
 * how the rest of this codebase treats a working day — the container's own
 * `TZ` is what "9am" means, the same as `working-days.ts` and `overdue.ts`.
 */

const DAY_KEYS: WorkingDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** The clock runs while a card sits in one of these columns (FR-502, FR-503). */
const COUNTED_COLUMN_KEYS = new Set(['in_progress', 'test', 'po_review']);

/**
 * "Committed to this iteration" columns (FR-525) — everything short of
 * Backlog (not yet committed) and Done (completed, counted separately).
 * Shared by `iteration-report.ts` and `burndown.ts`, both of which derive
 * scope added/removed from the same movement facts (research.md R-5).
 */
export const WORKING_COLUMN_KEYS = new Set([
  'iteration_items',
  'in_progress',
  'test',
  'po_review',
]);

export interface Movement {
  toColumnId: number;
  columnKey: string;
  occurredAt: string;
}

export interface BlockedInterval {
  blocked: boolean;
  occurredAt: string;
}

export interface WorkingCalendar {
  workingDays: readonly WorkingDay[];
  startHour: number;
  endHour: number;
}

/** An iteration's own span, inclusive of both dates — the shape `Iteration` reports. */
export interface IterationSpan {
  startsOn: string;
  endsOn: string;
}

interface Span {
  start: Date;
  end: Date;
}

export const atLocalMidnight = (isoDate: string): Date => {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year!, month! - 1, day!);
};

/**
 * The card's earliest movement into a working column, or null if it never
 * entered one. Shared with `burndown.ts` — both need the same "when did
 * this card join the commitment" fact (research.md R-5).
 */
export const firstWorkingEntry = (movements: Movement[]): Movement | null =>
  [...movements]
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    .find((m) => WORKING_COLUMN_KEYS.has(m.columnKey)) ?? null;

/** The card's last movement, or null if it has none. */
export const lastMovement = (movements: Movement[]): Movement | null => {
  const sorted = [...movements].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  return sorted.length > 0 ? sorted[sorted.length - 1]! : null;
};

/** The day after `isoDate`'s own midnight — an exclusive upper bound covering that whole day. */
const dayAfter = (isoDate: string): Date => {
  const d = atLocalMidnight(isoDate);
  d.setDate(d.getDate() + 1);
  return d;
};

const intersect = (a: Span, b: Span): Span | null => {
  const start = a.start > b.start ? a.start : b.start;
  const end = a.end < b.end ? a.end : b.end;
  return end > start ? { start, end } : null;
};

/**
 * Working seconds between two instants — every working day's configured
 * window, clipped to `[start, end)`. Walking day by day mirrors
 * `working-days.ts`'s own approach to the same calendar.
 */
const workingSecondsBetween = (start: Date, end: Date, calendar: WorkingCalendar): number => {
  if (end <= start) return 0;
  const working = new Set(calendar.workingDays);
  let seconds = 0;
  let day = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (day < end) {
    if (working.has(DAY_KEYS[day.getDay()]!)) {
      const windowStart = new Date(day);
      windowStart.setHours(calendar.startHour, 0, 0, 0);
      const windowEnd = new Date(day);
      windowEnd.setHours(calendar.endHour, 0, 0, 0);
      const overlapStart = start > windowStart ? start : windowStart;
      const overlapEnd = end < windowEnd ? end : windowEnd;
      if (overlapEnd > overlapStart) {
        seconds += (overlapEnd.getTime() - overlapStart.getTime()) / 1000;
      }
    }
    day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  }
  return seconds;
};

/** The card's own "clock running" intervals — entering a counted column starts one, leaving ends it. */
const runningSpans = (movements: Movement[], now: Date): Span[] => {
  const sorted = [...movements].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const spans: Span[] = [];
  let runningStart: Date | null = null;
  for (const movement of sorted) {
    const at = new Date(movement.occurredAt);
    const counted = COUNTED_COLUMN_KEYS.has(movement.columnKey);
    if (counted && runningStart === null) {
      runningStart = at;
    } else if (!counted && runningStart !== null) {
      spans.push({ start: runningStart, end: at });
      runningStart = null;
    }
  }
  if (runningStart !== null) spans.push({ start: runningStart, end: now });
  return spans;
};

/** Blocked-true-to-blocked-false pairs, closing a still-blocked run at `now`. */
const blockedSpans = (events: BlockedInterval[], now: Date): Span[] => {
  const sorted = [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const spans: Span[] = [];
  let start: Date | null = null;
  for (const event of sorted) {
    const at = new Date(event.occurredAt);
    if (event.blocked && start === null) {
      start = at;
    } else if (!event.blocked && start !== null) {
      spans.push({ start, end: at });
      start = null;
    }
  }
  if (start !== null) spans.push({ start, end: now });
  return spans;
};

/**
 * Working seconds elapsed, optionally clipped to one iteration's span.
 *
 * `span: null` returns the card's whole elapsed time, unclipped — the
 * caller sums per-iteration calls to apportion a boundary-spanning card
 * (FR-512), and each such call is this same function with a different span,
 * so the parts always sum to the whole.
 */
export const computeElapsedSeconds = (
  movements: Movement[],
  blockedEvents: BlockedInterval[],
  calendar: WorkingCalendar,
  span: IterationSpan | null,
  now: Date,
): number => {
  const clip: Span | null = span
    ? { start: atLocalMidnight(span.startsOn), end: dayAfter(span.endsOn) }
    : null;

  const running = runningSpans(movements, now);
  const blocked = blockedSpans(blockedEvents, now);

  let total = 0;
  for (const runningSpan of running) {
    const clipped = clip ? intersect(runningSpan, clip) : runningSpan;
    if (!clipped) continue;

    let seconds = workingSecondsBetween(clipped.start, clipped.end, calendar);
    for (const blockedSpan of blocked) {
      const overlap = intersect(clipped, blockedSpan);
      if (overlap) seconds -= workingSecondsBetween(overlap.start, overlap.end, calendar);
    }
    total += Math.max(seconds, 0);
  }
  return total;
};
