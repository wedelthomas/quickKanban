import { describe, expect, it } from 'vitest';
import { decideCarryOver } from '../../src/domain/carry-over.js';

/**
 * TEST-424 (BH-424), TEST-432 (BH-432), and FR-444's reset rule.
 *
 * The count measures ONE continuous stretch of being committed but unfinished.
 * That is what makes it actionable: "this has slipped three times running" is a
 * prompt to do something, where a lifetime tally of every boundary a card ever
 * crossed is only a number.
 */
const COLUMNS = {
  backlog: 'backlog',
  iterationItems: 'iteration_items',
  inProgress: 'in_progress',
  test: 'test',
  poReview: 'po_review',
  done: 'done',
} as const;

describe('deciding a card’s carry-over count at an iteration boundary', () => {
  it('starts counting when committed work crosses its first boundary', () => {
    expect(
      decideCarryOver({
        columnKey: COLUMNS.iterationItems,
        carried: 0,
        iterationSeen: '2026 S17',
        currentIteration: '2026 S18',
      }),
    ).toEqual({ carried: 1, iterationSeen: '2026 S18' });
  });

  it.each([COLUMNS.iterationItems, COLUMNS.inProgress, COLUMNS.test, COLUMNS.poReview])(
    'counts a boundary crossed in %s',
    (columnKey) => {
      expect(
        decideCarryOver({
          columnKey,
          carried: 1,
          iterationSeen: '2026 S17',
          currentIteration: '2026 S18',
        }).carried,
      ).toBe(2);
    },
  );

  it('does not count a boundary that has not been crossed', () => {
    // Same iteration: resolution runs on every board load, and each one must
    // not be mistaken for a fortnight passing.
    expect(
      decideCarryOver({
        columnKey: COLUMNS.inProgress,
        carried: 1,
        iterationSeen: '2026 S18',
        currentIteration: '2026 S18',
      }),
    ).toEqual({ carried: 1, iterationSeen: '2026 S18' });
  });

  it('resets when the card reaches Done', () => {
    expect(
      decideCarryOver({
        columnKey: COLUMNS.done,
        carried: 3,
        iterationSeen: '2026 S17',
        currentIteration: '2026 S18',
      }),
    ).toEqual({ carried: 0, iterationSeen: '2026 S18' });
  });

  it('resets when the card returns to Backlog', () => {
    // Withdrawing the commitment ends the stretch. The next one starts fresh.
    expect(
      decideCarryOver({
        columnKey: COLUMNS.backlog,
        carried: 3,
        iterationSeen: '2026 S17',
        currentIteration: '2026 S18',
      }),
    ).toEqual({ carried: 0, iterationSeen: '2026 S18' });
  });

  it('resets a parked card even without a boundary', () => {
    // A card sitting in Backlog carrying a count of three would keep showing it
    // until the next fortnight, long after the commitment was withdrawn.
    expect(
      decideCarryOver({
        columnKey: COLUMNS.backlog,
        carried: 3,
        iterationSeen: '2026 S18',
        currentIteration: '2026 S18',
      }).carried,
    ).toBe(0);
  });

  it('records the iteration on a card seen for the first time, without counting', () => {
    // A card created mid-iteration has not carried through anything yet.
    expect(
      decideCarryOver({
        columnKey: COLUMNS.inProgress,
        carried: 0,
        iterationSeen: null,
        currentIteration: '2026 S18',
      }),
    ).toEqual({ carried: 0, iterationSeen: '2026 S18' });
  });

  it('counts one boundary at a time, not the gap between ordinals', () => {
    // A board unopened for six weeks observes ONE transition, not three. The
    // count is of observed boundaries; pretending otherwise would require
    // reconstructing a calendar the board never saw.
    expect(
      decideCarryOver({
        columnKey: COLUMNS.inProgress,
        carried: 1,
        iterationSeen: '2026 S15',
        currentIteration: '2026 S18',
      }).carried,
    ).toBe(2);
  });

  it('does nothing at all when there is no current iteration', () => {
    // The banner may be showing an estimate with no name. Counting against
    // "unknown" would corrupt the sequence.
    expect(
      decideCarryOver({
        columnKey: COLUMNS.inProgress,
        carried: 2,
        iterationSeen: '2026 S17',
        currentIteration: null,
      }),
    ).toEqual({ carried: 2, iterationSeen: '2026 S17' });
  });
});
