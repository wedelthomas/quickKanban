import { describe, expect, it } from 'vitest';
import { workingDaysRemaining } from '../../src/domain/working-days.js';

/**
 * TEST-416's arithmetic (BH-416).
 *
 * "Days left" is the one number on the banner a reader will act on, and a
 * calendar count would be wrong by two every week.
 */
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri'] as const;

describe('working days remaining in an iteration', () => {
  it('counts only configured working days', () => {
    // Mon 2026-08-24 through Fri 2026-09-04 inclusive: ten working days.
    expect(
      workingDaysRemaining('2026-08-24', '2026-09-04', new Date('2026-08-24T09:00:00'), [
        ...WEEKDAYS,
      ]),
    ).toBe(10);
  });

  it('excludes the weekend from a span that crosses one', () => {
    // Fri 2026-08-28 to Mon 2026-08-31: two working days, not four.
    expect(
      workingDaysRemaining('2026-08-28', '2026-08-31', new Date('2026-08-28T09:00:00'), [
        ...WEEKDAYS,
      ]),
    ).toBe(2);
  });

  it('counts from today rather than from the iteration start', () => {
    // Halfway through: Wed 2026-09-02 to Fri 2026-09-04 is three.
    expect(
      workingDaysRemaining('2026-08-24', '2026-09-04', new Date('2026-09-02T09:00:00'), [
        ...WEEKDAYS,
      ]),
    ).toBe(3);
  });

  it('is zero once the iteration has ended', () => {
    expect(
      workingDaysRemaining('2026-08-24', '2026-09-04', new Date('2026-09-10T09:00:00'), [
        ...WEEKDAYS,
      ]),
    ).toBe(0);
  });

  it('counts the whole span when today is before it starts', () => {
    expect(
      workingDaysRemaining('2026-09-07', '2026-09-18', new Date('2026-09-01T09:00:00'), [
        ...WEEKDAYS,
      ]),
    ).toBe(10);
  });

  it('honours a working week that is not Monday to Friday', () => {
    // A four-day week drops one day from each week it spans.
    expect(
      workingDaysRemaining('2026-08-24', '2026-09-04', new Date('2026-08-24T09:00:00'), [
        'mon',
        'tue',
        'wed',
        'thu',
      ]),
    ).toBe(8);
  });

  it('never returns a negative number', () => {
    expect(
      workingDaysRemaining('2026-08-24', '2026-08-24', new Date('2027-01-01T09:00:00'), [
        ...WEEKDAYS,
      ]),
    ).toBe(0);
  });
});
