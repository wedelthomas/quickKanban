import type { ColumnKey } from '../shared/types.js';

/**
 * Whether a card has carried through another iteration.
 *
 * Pure, and counted at the boundary rather than derived on read. Deriving it
 * would mean replaying the movement history against the iteration calendar for
 * every card on every board load, which FR-429 forbids — nothing may delay the
 * board.
 *
 * The count measures ONE continuous stretch of being committed but unfinished.
 * That is what makes it actionable: "this has slipped three times running"
 * prompts a decision, where a lifetime tally of every boundary a card ever
 * crossed is just a number that grows.
 */

/**
 * Columns where a card counts as committed and unfinished.
 *
 * Backlog is uncommitted; Done is finished. Everything between is work the user
 * said they would do and has not (FR-435).
 */
const CARRYING_COLUMNS: ReadonlySet<string> = new Set<ColumnKey>([
  'iteration_items',
  'in_progress',
  'test',
  'po_review',
]);

export interface CarryOverInputs {
  columnKey: string;
  carried: number;
  /** The iteration this card was last observed under. Null when never seen. */
  iterationSeen: string | null;
  /** Null when no iteration could be established, e.g. an unnamed estimate. */
  currentIteration: string | null;
}

export interface CarryOverOutcome {
  carried: number;
  iterationSeen: string | null;
}

export const decideCarryOver = ({
  columnKey,
  carried,
  iterationSeen,
  currentIteration,
}: CarryOverInputs): CarryOverOutcome => {
  // Nothing to count against. An estimated iteration carries no name, and
  // counting against "unknown" would corrupt the sequence.
  if (currentIteration === null) return { carried, iterationSeen };

  // Finished or withdrawn: the stretch is over, whether or not a boundary was
  // crossed. A card parked in Backlog would otherwise keep displaying a count
  // for a fortnight after the commitment was dropped (FR-444).
  if (!CARRYING_COLUMNS.has(columnKey)) {
    return { carried: 0, iterationSeen: currentIteration };
  }

  // First sighting: record where we found it. A card created mid-iteration has
  // not carried through anything.
  if (iterationSeen === null) return { carried: 0, iterationSeen: currentIteration };

  // Same iteration: resolution runs on every board load, and each one must not
  // be mistaken for a fortnight passing.
  if (iterationSeen === currentIteration) return { carried, iterationSeen };

  // One boundary observed, one increment — regardless of how many ordinals lie
  // between. A board left unopened for six weeks saw one transition, not three,
  // and claiming otherwise would mean reconstructing a calendar it never read.
  return { carried: carried + 1, iterationSeen: currentIteration };
};
