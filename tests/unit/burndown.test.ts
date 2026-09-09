import { describe, expect, it } from 'vitest';
import { buildBurndown, type BurndownInput } from '../../src/domain/burndown.js';
import type { ReportInputCard } from '../../src/domain/iteration-report.js';
import type { IterationCommitment, WorkingDay } from '../../src/shared/types.js';

/**
 * TEST-523 through TEST-526 (BH-523..BH-526). Every day here is a working
 * day (Mon-Fri) inside the span, so the calendar's weekend exclusion is
 * exercised implicitly rather than duplicated as its own case — working-days
 * filtering itself is already proven in working-days.test.ts.
 */

const COMMITMENT: IterationCommitment = {
  ordinalName: '2026 S18',
  committedPoints: 10,
  committedAt: '2026-08-24T00:00:00',
};

const CALENDAR = { workingDays: ['mon', 'tue', 'wed', 'thu', 'fri'] as WorkingDay[] };

const card = (
  cardId: string,
  points: number | null,
  movements: ReportInputCard['movements'],
): ReportInputCard => ({
  cardId,
  title: cardId,
  project: 'local',
  points,
  movements,
  blockedEvents: [],
  cancelledAt: null,
});

const cancelledCard = (
  cardId: string,
  points: number | null,
  enteredAt: string,
  cancelledAt: string,
): ReportInputCard => ({
  cardId,
  title: cardId,
  project: 'local',
  points,
  movements: [{ toColumnId: 0, columnKey: 'in_progress', occurredAt: enteredAt }],
  blockedEvents: [],
  cancelledAt,
});

const baseInput = (
  cards: ReportInputCard[],
  overrides: Partial<BurndownInput> = {},
): BurndownInput => ({
  startsOn: '2026-08-24',
  endsOn: '2026-08-28',
  commitment: COMMITMENT,
  cards,
  calendar: CALENDAR,
  now: new Date('2026-09-08T00:00:00'),
  ...overrides,
});

describe('burndown', () => {
  it('gives outstanding points at the close of each working day (BH-523)', () => {
    const points = buildBurndown(baseInput([]));
    // Mon 24 through Fri 28, five working days, nothing happening: flat at 10.
    expect(points.map((p) => p.date)).toEqual([
      '2026-08-24',
      '2026-08-25',
      '2026-08-26',
      '2026-08-27',
      '2026-08-28',
    ]);
    expect(points.every((p) => p.outstanding === 10)).toBe(true);
  });

  it('attributes a fall to completed work (BH-524)', () => {
    const points = buildBurndown(
      baseInput([
        card('done-tue', 4, [
          { toColumnId: 0, columnKey: 'in_progress', occurredAt: '2026-08-24T09:00:00' },
          { toColumnId: 0, columnKey: 'done', occurredAt: '2026-08-25T15:00:00' },
        ]),
      ]),
    );
    const tue = points.find((p) => p.date === '2026-08-25')!;
    expect(tue.completedThatDay).toBe(4);
    expect(tue.outstanding).toBe(6);
    // The fall persists — it is not undone the following day.
    expect(points.find((p) => p.date === '2026-08-26')!.outstanding).toBe(6);
  });

  it('attributes a rise to scope added, distinguishable from no progress (BH-524)', () => {
    const points = buildBurndown(
      baseInput([
        card('added-wed', 3, [
          { toColumnId: 0, columnKey: 'in_progress', occurredAt: '2026-08-26T09:00:00' },
        ]),
      ]),
    );
    const wed = points.find((p) => p.date === '2026-08-26')!;
    expect(wed.scopeAddedThatDay).toBe(3);
    expect(wed.completedThatDay).toBe(0);
    expect(wed.outstanding).toBe(13);
  });

  it('nets scope added and removed on the same day without implying progress', () => {
    const points = buildBurndown(
      baseInput([
        card('added-thu', 5, [
          { toColumnId: 0, columnKey: 'in_progress', occurredAt: '2026-08-27T09:00:00' },
        ]),
        card('removed-thu', 2, [
          { toColumnId: 0, columnKey: 'in_progress', occurredAt: '2026-08-20T09:00:00' },
          { toColumnId: 0, columnKey: 'backlog', occurredAt: '2026-08-27T10:00:00' },
        ]),
      ]),
    );
    const thu = points.find((p) => p.date === '2026-08-27')!;
    expect(thu.scopeAddedThatDay).toBe(5);
    expect(thu.scopeRemovedThatDay).toBe(2);
    expect(thu.outstanding).toBe(13); // 10 + 5 - 2, not zero net hidden as "no change"
  });

  it('attributes a fall to withdrawn scope, dated the day of cancellation (BH-617, slice 7)', () => {
    const points = buildBurndown(
      baseInput([cancelledCard('withdrawn-wed', 4, '2026-08-20T09:00:00', '2026-08-26T14:00:00')]),
    );
    const wed = points.find((p) => p.date === '2026-08-26')!;
    expect(wed.withdrawnThatDay).toBe(4);
    expect(wed.completedThatDay).toBe(0);
    expect(wed.outstanding).toBe(6);
    // The fall persists — it is not undone the following day.
    expect(points.find((p) => p.date === '2026-08-27')!.outstanding).toBe(6);
  });

  it('reports no withdrawal for a card never committed to any iteration (slice 7)', () => {
    const points = buildBurndown(
      baseInput([cancelledCard('never-committed', 4, '2026-08-26T09:00:00', '2026-08-27T14:00:00')]),
    );
    const thu = points.find((p) => p.date === '2026-08-27')!;
    expect(thu.withdrawnThatDay).toBe(0);
    expect(thu.scopeAddedThatDay).toBe(0);
    expect(thu.outstanding).toBe(10);
  });

  it('covers only elapsed working days for a running iteration (BH-525)', () => {
    const points = buildBurndown(
      baseInput([], { now: new Date('2026-08-26T12:00:00') }),
    );
    expect(points.map((p) => p.date)).toEqual(['2026-08-24', '2026-08-25', '2026-08-26']);
  });

  it('covers the full span for a completed iteration (BH-526)', () => {
    const points = buildBurndown(
      baseInput([], { now: new Date('2026-09-08T00:00:00') }),
    );
    expect(points.map((p) => p.date)).toEqual([
      '2026-08-24',
      '2026-08-25',
      '2026-08-26',
      '2026-08-27',
      '2026-08-28',
    ]);
  });
});
