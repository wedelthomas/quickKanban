import { describe, expect, it } from 'vitest';
import {
  buildIterationReport,
  determineIncomplete,
  type ReportInput,
  type ReportInputCard,
} from '../../src/domain/iteration-report.js';
import type { IterationCommitment } from '../../src/shared/types.js';

/**
 * TEST-516, TEST-517, TEST-528, TEST-539. US2 — the local/Jira invisible-work
 * split for both time and points.
 */

// Wide open so elapsed time equals wall-clock duration, keeping these tests
// about the points/share arithmetic rather than the working-calendar rules
// elapsed-time.test.ts already covers.
const CALENDAR = {
  workingDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const,
  startHour: 0,
  endHour: 24,
};

const baseInput = (
  cards: ReportInputCard[],
  commitment: IterationCommitment | null = null,
): ReportInput => ({
  ordinalName: '2026 S18',
  startsOn: '2026-08-24',
  endsOn: '2026-09-07',
  cards,
  calendar: CALENDAR,
  commitment,
  incomplete: false,
  now: new Date('2026-09-08T00:00:00'),
});

const doneCard = (
  cardId: string,
  project: string,
  points: number | null,
): ReportInputCard => ({
  cardId,
  title: cardId,
  project,
  points,
  movements: [
    { toColumnId: 0, columnKey: 'in_progress', occurredAt: '2026-08-25T09:00:00' },
    { toColumnId: 0, columnKey: 'done', occurredAt: '2026-08-25T13:00:00' },
  ],
  blockedEvents: [],
});

const workingCard = (
  cardId: string,
  project: string,
  points: number | null,
  enteredAt: string,
): ReportInputCard => ({
  cardId,
  title: cardId,
  project,
  points,
  movements: [{ toColumnId: 0, columnKey: 'in_progress', occurredAt: enteredAt }],
  blockedEvents: [],
});

const COMMITMENT: IterationCommitment = {
  ordinalName: '2026 S18',
  committedPoints: 10,
  committedAt: '2026-08-24T00:00:00',
};

describe('iteration report — commitment, completion and scope (US4)', () => {
  it('reports a mid-iteration addition as scope added, commitment unchanged (BH-520)', () => {
    const report = buildIterationReport(
      baseInput(
        [
          workingCard('already-committed', 'local', 4, '2026-08-20T09:00:00'),
          workingCard('added-later', 'local', 3, '2026-08-26T09:00:00'),
        ],
        COMMITMENT,
      ),
    );

    expect(report.points).toMatchObject({ committed: 10, scopeAdded: 3 });
  });

  it('counts local and Jira-sourced cards alike toward velocity (BH-521)', () => {
    const report = buildIterationReport(
      baseInput(
        [doneCard('local-done', 'local', 4), doneCard('jira-done', 'AIHUB', 6)],
        COMMITMENT,
      ),
    );

    expect(report.points).toMatchObject({ completed: 10 });
  });

  it('reports commitment, completion and scope change as three distinct figures (BH-522)', () => {
    const report = buildIterationReport(
      baseInput(
        [
          workingCard('still-open', 'local', 4, '2026-08-20T09:00:00'),
          doneCard('finished', 'local', 5),
          workingCard('added-later', 'AIHUB', 3, '2026-08-26T09:00:00'),
        ],
        COMMITMENT,
      ),
    );

    expect(report.points).toMatchObject({ committed: 10, completed: 5, scopeAdded: 3 });
  });
});

describe('iteration report — local/Jira split', () => {
  it('states local and Jira shares of time and of points, summing to 1 (BH-528)', () => {
    const report = buildIterationReport(
      baseInput([doneCard('local-1', 'local', 4), doneCard('jira-1', 'AIHUB', 6)]),
    );

    expect(report.time.localShare + report.time.jiraShare).toBeCloseTo(1);
    expect(report.points).toMatchObject({
      completed: 10,
      localShare: 0.4,
      jiraShare: 0.6,
    });
  });

  it('reads a zero share as zero, not omitted (FR-539)', () => {
    // Entirely Jira-sourced: the local share is a real zero, not a missing key.
    const report = buildIterationReport(baseInput([doneCard('jira-1', 'AIHUB', 5)]));

    expect(report.time.localShare).toBe(0);
    if ('localShare' in report.points) {
      expect(report.points.localShare).toBe(0);
    } else {
      throw new Error('points unexpectedly withheld');
    }
  });

  it('reports a local share of zero when every card is Jira-sourced (spec.md US2 scenario 3)', () => {
    const report = buildIterationReport(
      baseInput([doneCard('jira-1', 'AIHUB', 3), doneCard('jira-2', 'AIHUB', 2)]),
    );

    expect(report.time.localShare).toBe(0);
    expect(report.time.jiraShare).toBe(1);
  });

  it('excludes unpointed cards from the points figures and counts them (BH-516)', () => {
    const report = buildIterationReport(
      baseInput([doneCard('pointed', 'local', 5), doneCard('unpointed', 'local', null)]),
    );

    expect(report.points).toMatchObject({ completed: 5, excludedUnpointed: 1 });
  });

  it('withholds the points figure with a reason when no card carries points (BH-517)', () => {
    const report = buildIterationReport(
      baseInput([doneCard('unpointed-1', 'local', null), doneCard('unpointed-2', 'AIHUB', null)]),
    );

    expect(report.points).toMatchObject({ withheld: true });
    expect('reason' in report.points && report.points.reason.length > 0).toBe(true);
  });
});

describe('determineIncomplete — blocked-tracking gap (BH-536, FR-548)', () => {
  it('is complete when both movements and blocked tracking predate the iteration', () => {
    expect(
      determineIncomplete('2026-08-24', '2026-01-01T00:00:00', '2026-01-01T00:00:00', true),
    ).toBe(false);
  });

  it('is incomplete when the earliest movement postdates the iteration start (FR-542)', () => {
    expect(
      determineIncomplete('2026-08-24', '2026-08-25T00:00:00', '2026-01-01T00:00:00', true),
    ).toBe(true);
  });

  it('is incomplete when blocked tracking started after the iteration began (BH-536)', () => {
    expect(
      determineIncomplete('2026-08-24', '2026-01-01T00:00:00', '2026-08-25T00:00:00', true),
    ).toBe(true);
  });

  it('is incomplete when blocked tracking has never fired at all, and there is history to worry about', () => {
    expect(determineIncomplete('2026-08-24', '2026-01-01T00:00:00', null, true)).toBe(true);
  });

  it('is complete when blocked tracking has never fired but the iteration has no movements either', () => {
    expect(determineIncomplete('2026-08-24', null, null, false)).toBe(false);
  });
});

describe('time and points never combine into one score (BH-532, FR-543)', () => {
  it('reports time and points as separate top-level figures only', () => {
    const report = buildIterationReport(
      baseInput([doneCard('local-1', 'local', 4), doneCard('jira-1', 'AIHUB', 6)]),
    );

    // Exactly the documented shape (contracts/api.md) — no blended score
    // field sits alongside them.
    expect(Object.keys(report).sort()).toEqual(
      ['endsOn', 'incomplete', 'ordinalName', 'points', 'startsOn', 'time'].sort(),
    );
  });
});
