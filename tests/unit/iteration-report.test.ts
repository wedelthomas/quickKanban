import { describe, expect, it } from 'vitest';
import {
  buildIterationReport,
  type ReportInput,
  type ReportInputCard,
} from '../../src/domain/iteration-report.js';

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

const baseInput = (cards: ReportInputCard[]): ReportInput => ({
  ordinalName: '2026 S18',
  startsOn: '2026-08-24',
  endsOn: '2026-09-07',
  cards,
  calendar: CALENDAR,
  commitment: null,
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
