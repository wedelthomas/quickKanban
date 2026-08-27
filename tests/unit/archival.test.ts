import { describe, expect, it } from 'vitest';
import { shouldArchive, type ArchivalInput } from '../../src/domain/archival.js';

/**
 * Covers BH-309, BH-309a and BH-310.
 *
 * The window boundary is the whole of this function, so it is tested at the
 * boundary rather than near it: one second under, exactly on, one second over.
 * `now` is an argument precisely so those three cases are three lines instead
 * of three tests with sleeps in them.
 */
const NOW = new Date('2026-08-27T12:00:00.000Z');
const daysBefore = (n: number, ms = 0): Date =>
  new Date(NOW.getTime() - n * 86_400_000 + ms);

const input = (over: Partial<ArchivalInput> = {}): ArchivalInput => ({
  arrivedInDoneAt: daysBefore(10),
  createdAt: daysBefore(30),
  windowDays: 7,
  now: NOW,
  conflicted: false,
  ...over,
});

describe('the window boundary (BH-309)', () => {
  it('archives a card one second past the window', () => {
    expect(shouldArchive(input({ arrivedInDoneAt: daysBefore(7, -1000) }))).toBe(true);
  });

  it('does NOT archive a card exactly at the window', () => {
    // "Longer than the window" (FR-312), not "at least". A card that arrived
    // exactly seven days ago has been there seven days, not longer.
    expect(shouldArchive(input({ arrivedInDoneAt: daysBefore(7) }))).toBe(false);
  });

  it('does not archive a card one second short of the window', () => {
    expect(shouldArchive(input({ arrivedInDoneAt: daysBefore(7, 1000) }))).toBe(false);
  });

  it('archives a card long past the window', () => {
    expect(shouldArchive(input({ arrivedInDoneAt: daysBefore(90) }))).toBe(true);
  });

  it('does not archive a card that arrived today', () => {
    expect(shouldArchive(input({ arrivedInDoneAt: NOW }))).toBe(false);
  });
});

describe('the most recent arrival decides (BH-309)', () => {
  it('measures from the latest arrival, not the first', () => {
    // A card that reached Done weeks ago, was dragged out, and came back
    // yesterday is one day old. The caller passes the most recent arrival;
    // this asserts the function honours it rather than any other date it holds.
    expect(
      shouldArchive(input({ arrivedInDoneAt: daysBefore(1), createdAt: daysBefore(90) })),
    ).toBe(false);
  });
});

describe('a card created directly in Done (BH-309)', () => {
  it('falls back to its creation time when it has no arrival event', () => {
    // Slice 1 writes an event only on a column change, never on creation, so
    // this card genuinely has no arrival. Treating null as "infinitely old"
    // would archive it instantly; as "infinitely new" it would never archive.
    // Both are wrong, and both would be found months later by a user asking
    // where a card went.
    expect(
      shouldArchive(input({ arrivedInDoneAt: null, createdAt: daysBefore(10) })),
    ).toBe(true);
    expect(
      shouldArchive(input({ arrivedInDoneAt: null, createdAt: daysBefore(1) })),
    ).toBe(false);
  });
});

describe("the window is the user's (BH-310)", () => {
  it('a card five days in Done is not archived under a seven-day window', () => {
    expect(shouldArchive(input({ arrivedInDoneAt: daysBefore(5), windowDays: 7 }))).toBe(
      false,
    );
  });

  it('the same card IS archived once the window is three days', () => {
    expect(shouldArchive(input({ arrivedInDoneAt: daysBefore(5), windowDays: 3 }))).toBe(
      true,
    );
  });

  it('a zero window archives anything that arrived at all', () => {
    // Permitted, and the spec calls it the user's choice. Note the sign: the
    // helper subtracts days and then adds `ms`, so a second EARLIER than now is
    // -1000. Written as +1000 first, which put the arrival a second in the
    // future and made the assertion wrong rather than the code.
    expect(
      shouldArchive(input({ arrivedInDoneAt: daysBefore(0, -1000), windowDays: 0 })),
    ).toBe(true);
  });

  it('a zero window still does not archive something arriving this instant', () => {
    expect(shouldArchive(input({ arrivedInDoneAt: NOW, windowDays: 0 }))).toBe(false);
  });
});

describe('a conflicted card is never archived (BH-309a, FR-318a)', () => {
  it('is left alone however far past the window it is', () => {
    // Slice 3 freezes a conflicted card so the disagreement gets resolved
    // deliberately. Archiving it would dispose of the evidence and leave the
    // user unable to act — an automatic process quietly removing the record of
    // an unresolved problem is the worst outcome available here.
    expect(
      shouldArchive(input({ arrivedInDoneAt: daysBefore(365), conflicted: true })),
    ).toBe(false);
  });

  it('outranks even a zero window', () => {
    expect(
      shouldArchive(
        input({ arrivedInDoneAt: daysBefore(90), windowDays: 0, conflicted: true }),
      ),
    ).toBe(false);
  });

  it('archives normally once the conflict is resolved', () => {
    expect(
      shouldArchive(input({ arrivedInDoneAt: daysBefore(90), conflicted: false })),
    ).toBe(true);
  });
});
