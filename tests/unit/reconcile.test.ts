import { describe, expect, it } from 'vitest';
import { reconcile, type Decision } from '../../src/domain/reconcile.js';
import { columnForJiraStatus, type Mapping } from '../../src/domain/column-mapping.js';

/**
 * Covers BH-209 through BH-214, and SC-203's requirement that every
 * combination of the three inputs is exercised.
 *
 * This is the function that decides whether to write to a system other people
 * can see. It is pure precisely so this table can exist: no database, no
 * clock, no network, so every case is a line rather than a scenario.
 */
const mappings: Mapping[] = [
  { columnId: 1, columnPosition: 1, statusName: 'Open' },
  { columnId: 2, columnPosition: 2, statusName: 'Development' },
  { columnId: 4, columnPosition: 4, statusName: 'Test' },
  // Column 3 (Blocked) is unmapped on purpose.
];

/**
 * The recorded column is derived from the last-known status here, which models
 * the ordinary case: the previous sync left the card wherever that status
 * belongs. Cases where the two come apart — the reason this input exists at
 * all — are exercised in "a card nobody moved" below, with it passed directly.
 */
const decide = (localColumn: number, remoteStatus: string, lastKnown: string): Decision =>
  reconcile({
    mappings,
    localColumn,
    lastKnownColumn: columnForJiraStatus(mappings, lastKnown),
    remoteStatus,
    lastKnownStatus: lastKnown,
  });

describe('reconcile — the four outcomes', () => {
  it('neither side changed: nothing to do', () => {
    // Card in Open's column, Jira says Open, last sync said Open.
    expect(decide(1, 'Open', 'Open')).toEqual({ kind: 'no-op' });
  });

  it('only Jira changed: adopt it', () => {
    expect(decide(1, 'Development', 'Open')).toEqual({
      kind: 'apply-remote',
      toColumnId: 2,
      status: 'Development',
    });
  });

  it('only the board changed: push it', () => {
    expect(decide(2, 'Open', 'Open')).toEqual({
      kind: 'push-local',
      toStatus: 'Development',
    });
  });

  it('both changed and they disagree: conflict', () => {
    // User moved the card to Test; someone moved the issue to Development.
    expect(decide(4, 'Development', 'Open')).toEqual({
      kind: 'conflict',
      boardColumnId: 4,
      jiraStatus: 'Development',
    });
  });

  it('both changed and they agree: no conflict, just catch up', () => {
    // User moved the card to Development's column; Jira moved there too.
    expect(decide(2, 'Development', 'Open')).toEqual({ kind: 'no-op' });
  });
});

describe('reconcile — unmapped columns and statuses', () => {
  it('a card parked in an unmapped column is never pushed', () => {
    // Blocked has no Jira meaning; the board is the user's own arrangement.
    expect(decide(3, 'Open', 'Open')).toEqual({ kind: 'no-op' });
  });

  it('a card in an unmapped column still adopts a remote change', () => {
    // The user parked it in Blocked; Jira moved on. Jira's change is real.
    expect(decide(3, 'Development', 'Open')).toEqual({
      kind: 'apply-remote',
      toColumnId: 2,
      status: 'Development',
    });
  });

  it('a remote status no column maps to leaves the card alone, and says so', () => {
    expect(decide(1, 'Cancelled', 'Open')).toEqual({
      kind: 'unmapped-remote-status',
      status: 'Cancelled',
    });
  });

  it('an unmapped remote status is not a conflict even when the board moved too', () => {
    // There is nothing to disagree about: the board cannot express "Cancelled".
    expect(decide(4, 'Cancelled', 'Open')).toEqual({
      kind: 'unmapped-remote-status',
      status: 'Cancelled',
    });
  });
});

describe('reconcile — properties that must always hold', () => {
  const columns = [1, 2, 3, 4];
  const statuses = ['Open', 'Development', 'Test', 'Cancelled'];

  it('covers every combination of the three inputs without throwing', () => {
    let count = 0;
    for (const column of columns) {
      for (const remote of statuses) {
        for (const known of statuses) {
          expect(() => decide(column, remote, known)).not.toThrow();
          count += 1;
        }
      }
    }
    expect(count).toBe(64);
  });

  it('never pushes when the board did not change', () => {
    for (const remote of statuses) {
      for (const column of columns) {
        // lastKnown equals the column's own status means the board is unmoved.
        const known = mappings.find((m) => m.columnId === column)?.statusName;
        if (!known) continue;
        expect(decide(column, remote, known).kind).not.toBe('push-local');
      }
    }
  });

  it('never raises a conflict unless both sides moved', () => {
    for (const column of columns) {
      const known = mappings.find((m) => m.columnId === column)?.statusName;
      if (!known) continue;
      // Board unmoved: whatever Jira did, this cannot be a conflict.
      expect(decide(column, 'Development', known).kind).not.toBe('conflict');
    }
  });

  it('is deterministic across repeated evaluation (SC-204)', () => {
    const first = decide(4, 'Development', 'Open');
    for (let i = 0; i < 100; i++) expect(decide(4, 'Development', 'Open')).toEqual(first);
  });
});

/**
 * Found by the live check against real Jira (T353), not by any fixture.
 *
 * TASK-11976 was imported with the real status "In Progress" and placed in the
 * In Progress column — correctly. That column is mapped to "Development",
 * because a column can only be mapped to one status. The reconciler then
 * compared the column's mapped status name against the issue's actual status,
 * found them different, concluded the *board* had changed, and tried to
 * transition a real issue nobody had touched. It failed only because that
 * project's workflow has no "Development" status.
 *
 * "The board changed" has to mean the card moved columns, not that two names
 * for the same column disagree.
 */
describe('reconcile — a card nobody moved', () => {
  const mappings = [
    { columnId: 1, columnPosition: 1, statusName: 'Open' },
    { columnId: 2, columnPosition: 2, statusName: 'Development' },
  ];

  it('does not push when the issue sits in the column it was imported into', () => {
    const decision = reconcile({
      mappings,
      localColumn: 2,
      lastKnownColumn: 2,
      // A real status that means the same stage as the column's mapped status
      // without being spelled the same way.
      remoteStatus: 'In Progress',
      lastKnownStatus: 'In Progress',
    });

    expect(decision).toEqual({ kind: 'no-op' });
  });

  it('still pushes when the card actually moved columns', () => {
    const decision = reconcile({
      mappings,
      localColumn: 2,
      lastKnownColumn: 1,
      remoteStatus: 'Open',
      lastKnownStatus: 'Open',
    });

    expect(decision).toEqual({ kind: 'push-local', toStatus: 'Development' });
  });

  it('treats a card with no recorded column as unmoved rather than as moved', () => {
    // A link written before this column was recorded. Guessing "moved" here
    // would push every pre-existing card on the first sync after upgrade.
    const decision = reconcile({
      mappings,
      localColumn: 2,
      lastKnownColumn: null,
      remoteStatus: 'In Progress',
      lastKnownStatus: 'In Progress',
    });

    expect(decision).toEqual({ kind: 'no-op' });
  });
});
