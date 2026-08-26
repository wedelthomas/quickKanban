import { describe, expect, it } from 'vitest';
import { isOverdue, toCalendarDate } from '../../src/domain/overdue.js';

/**
 * Covers BH-029. The boundary is the whole point: a card due today is not
 * overdue, which is what makes the date-only decision worth having.
 */
describe('isOverdue', () => {
  const today = new Date(2026, 7, 26); // 26 August 2026, local time

  it('is not overdue when due today (BH-029)', () => {
    expect(isOverdue('2026-08-26', today)).toBe(false);
  });

  it('is overdue when due yesterday (BH-029)', () => {
    expect(isOverdue('2026-08-25', today)).toBe(true);
  });

  it('is not overdue when due tomorrow', () => {
    expect(isOverdue('2026-08-27', today)).toBe(false);
  });

  it('is never overdue with no due date', () => {
    expect(isOverdue(null, today)).toBe(false);
  });

  it('handles a month boundary', () => {
    expect(isOverdue('2026-07-31', new Date(2026, 7, 1))).toBe(true);
  });

  it('handles a year boundary', () => {
    expect(isOverdue('2025-12-31', new Date(2026, 0, 1))).toBe(true);
  });

  it('uses local date rather than UTC, so a late-evening check does not shift', () => {
    // 23:30 local on the 26th is still the 26th, even where UTC has rolled over.
    const lateEvening = new Date(2026, 7, 26, 23, 30);
    expect(isOverdue('2026-08-26', lateEvening)).toBe(false);
  });
});

describe('toCalendarDate', () => {
  it('pads month and day', () => {
    expect(toCalendarDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
