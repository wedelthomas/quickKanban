import type { WorkingDay } from '../shared/types.js';

/**
 * How much of an iteration is left, in days someone will actually work.
 *
 * Pure, and takes its clock as an argument: "how many days left" is a question
 * about a specific moment, and a function that read the clock itself could only
 * be tested by moving the machine's.
 *
 * A calendar count would be wrong by two every week, which on a two-week
 * iteration is wrong by four — enough to change what a person decides to take
 * on. FR-431.
 */

const DAY_KEYS: WorkingDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Parses a calendar date with no time component, in local terms. */
const atLocalMidnight = (iso: string): Date => {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year!, month! - 1, day!);
};

export const workingDaysRemaining = (
  startsOn: string,
  endsOn: string,
  now: Date,
  workingDays: WorkingDay[],
): number => {
  const end = atLocalMidnight(endsOn);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Counting starts from today, or from the iteration's start when it has not
  // begun — a future iteration has all of its days remaining, not more.
  const start = atLocalMidnight(startsOn);
  const cursor = today > start ? today : start;

  if (cursor > end) return 0;

  const working = new Set(workingDays);
  let count = 0;
  for (const day = new Date(cursor); day <= end; day.setDate(day.getDate() + 1)) {
    if (working.has(DAY_KEYS[day.getDay()]!)) count += 1;
  }
  return count;
};
