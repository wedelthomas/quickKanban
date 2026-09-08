import { describe, expect, it } from 'vitest';
import { computeElapsedSeconds, type Movement } from '../../src/domain/elapsed-time.js';

/**
 * TEST-501 through TEST-511, TEST-536. The clock is "running" while a card
 * sits in in_progress, test or po_review; it stops on done or any column not
 * in that set. Working calendar throughout: Mon-Fri, 09:00-17:00.
 */
const CALENDAR = { workingDays: ['mon', 'tue', 'wed', 'thu', 'fri'] as const, startHour: 9, endHour: 17 };

const move = (columnKey: string, occurredAt: string): Movement => ({
  toColumnId: 0,
  columnKey,
  occurredAt,
});

describe('elapsed time', () => {
  it('derives time from movements alone (BH-501)', () => {
    const seconds = computeElapsedSeconds(
      [move('in_progress', '2026-08-24T09:00:00'), move('done', '2026-08-24T12:00:00')],
      [],
      CALENDAR,
      null,
      new Date('2026-08-25T00:00:00'),
    );
    expect(seconds).toBe(3 * 3600);
  });

  it('counts time in test and po_review (BH-502)', () => {
    const seconds = computeElapsedSeconds(
      [
        move('in_progress', '2026-08-24T09:00:00'),
        move('test', '2026-08-24T10:00:00'),
        move('po_review', '2026-08-24T11:00:00'),
        move('done', '2026-08-24T12:00:00'),
      ],
      [],
      CALENDAR,
      null,
      new Date('2026-08-25T00:00:00'),
    );
    expect(seconds).toBe(3 * 3600);
  });

  it('counts only working hours across a weekend (BH-503, SC-502)', () => {
    // Friday 16:00 -> Monday 10:00. Working: Fri 16:00-17:00 (1h) + Mon 09:00-10:00 (1h) = 2h.
    const seconds = computeElapsedSeconds(
      [move('in_progress', '2026-08-21T16:00:00'), move('done', '2026-08-24T10:00:00')],
      [],
      CALENDAR,
      null,
      new Date('2026-08-25T00:00:00'),
    );
    expect(seconds).toBe(2 * 3600);
  });

  it('excludes blocked periods (BH-504)', () => {
    const seconds = computeElapsedSeconds(
      [move('in_progress', '2026-08-24T09:00:00'), move('done', '2026-08-24T15:00:00')],
      [
        { blocked: true, occurredAt: '2026-08-24T10:00:00' },
        { blocked: false, occurredAt: '2026-08-24T12:00:00' },
      ],
      CALENDAR,
      null,
      new Date('2026-08-25T00:00:00'),
    );
    // 09:00-15:00 (6h) minus 10:00-12:00 (2h) blocked = 4h.
    expect(seconds).toBe(4 * 3600);
  });

  it('excludes an overnight-and-blocked overlap exactly once, never negative (BH-505)', () => {
    // Blocked spans the whole card's life and then some — must clamp to 0, not go negative.
    const seconds = computeElapsedSeconds(
      [move('in_progress', '2026-08-24T09:00:00'), move('done', '2026-08-24T12:00:00')],
      [
        { blocked: true, occurredAt: '2026-08-24T08:00:00' },
        { blocked: false, occurredAt: '2026-08-24T18:00:00' },
      ],
      CALENDAR,
      null,
      new Date('2026-08-25T00:00:00'),
    );
    expect(seconds).toBe(0);
  });

  it('accumulates across repeat in-progress passes (BH-506)', () => {
    const seconds = computeElapsedSeconds(
      [
        move('in_progress', '2026-08-24T09:00:00'),
        move('backlog', '2026-08-24T10:00:00'),
        move('in_progress', '2026-08-24T11:00:00'),
        move('done', '2026-08-24T12:00:00'),
      ],
      [],
      CALENDAR,
      null,
      new Date('2026-08-25T00:00:00'),
    );
    expect(seconds).toBe(2 * 3600);
  });

  it('resumes the clock when a card is moved back out of Done (BH-507)', () => {
    const seconds = computeElapsedSeconds(
      [
        move('in_progress', '2026-08-24T09:00:00'),
        move('done', '2026-08-24T10:00:00'),
        move('in_progress', '2026-08-24T11:00:00'),
        move('done', '2026-08-24T13:00:00'),
      ],
      [],
      CALENDAR,
      null,
      new Date('2026-08-25T00:00:00'),
    );
    expect(seconds).toBe(3 * 3600);
  });

  it('reflects a corrected working-hours configuration on recompute (BH-508)', () => {
    const movements = [
      move('in_progress', '2026-08-24T09:00:00'),
      move('done', '2026-08-24T15:00:00'),
    ];
    const under9to17 = computeElapsedSeconds(
      movements,
      [],
      CALENDAR,
      null,
      new Date('2026-08-25T00:00:00'),
    );
    const under9to12 = computeElapsedSeconds(
      movements,
      [],
      { ...CALENDAR, endHour: 12 },
      null,
      new Date('2026-08-25T00:00:00'),
    );
    expect(under9to17).toBe(6 * 3600);
    expect(under9to12).toBe(3 * 3600);
  });

  it('splits time across an iteration boundary, parts summing to the whole (BH-509)', () => {
    const movements = [
      move('in_progress', '2026-08-24T15:00:00'),
      move('done', '2026-08-25T11:00:00'),
    ];
    const now = new Date('2026-08-26T00:00:00');
    const total = computeElapsedSeconds(movements, [], CALENDAR, null, now);
    const first = computeElapsedSeconds(
      movements,
      [],
      CALENDAR,
      { startsOn: '2026-08-17', endsOn: '2026-08-24' },
      now,
    );
    const second = computeElapsedSeconds(
      movements,
      [],
      CALENDAR,
      { startsOn: '2026-08-25', endsOn: '2026-08-31' },
      now,
    );
    expect(first + second).toBe(total);
    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(0);
  });

  it('reports time to date for a still-running card, without implying completion (BH-510)', () => {
    const seconds = computeElapsedSeconds(
      [move('in_progress', '2026-08-24T09:00:00')],
      [],
      CALENDAR,
      null,
      new Date('2026-08-24T11:00:00'),
    );
    expect(seconds).toBe(2 * 3600);
  });
});
