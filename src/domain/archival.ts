/** Whether a card that is sitting in Done should now leave the board. */
export interface ArchivalInput {
  /** When the card most recently arrived in Done, or null if it never moved there. */
  arrivedInDoneAt: Date | null;
  /** Fallback for a card created directly in Done, which has no arrival event. */
  createdAt: Date;
  windowDays: number;
  now: Date;
  /** An unresolved conflict freezes the card against archival too (FR-318a). */
  conflicted: boolean;
}

const DAY_MS = 86_400_000;

/**
 * Whether a card sitting in Done should now leave the board.
 *
 * Pure, and takes `now` as an argument, so the three cases that matter — one
 * second under the window, exactly on it, one second over — are three lines
 * rather than three tests with sleeps in them.
 */
export const shouldArchive = ({
  arrivedInDoneAt,
  createdAt,
  windowDays,
  now,
  conflicted,
}: ArchivalInput): boolean => {
  // Checked first, and it outranks everything including a zero window. Slice 3
  // freezes a conflicted card so the disagreement is resolved deliberately;
  // archiving it would dispose of the evidence and leave the user unable to
  // act (FR-318a).
  if (conflicted) return false;

  // A card created directly in Done has no arrival event — slice 1 writes one
  // only on a column change (FR-028). Its creation is the honest stand-in.
  // Treating null as "infinitely old" or "infinitely new" are both wrong, and
  // both would surface months later as a card that vanished or never left.
  const arrived = arrivedInDoneAt ?? createdAt;

  // Strictly longer than the window: FR-312 says "longer than", and a card that
  // arrived exactly `windowDays` ago has been there that long, not longer.
  return now.getTime() - arrived.getTime() > windowDays * DAY_MS;
};
