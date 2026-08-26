import { describe, expect, it } from 'vitest';
import { backoffDelays } from '../../src/domain/backoff.js';

/** Covers BH-117's policy half. */
describe('backoffDelays', () => {
  it('grows exponentially', () => {
    expect(backoffDelays(3, 500)).toEqual([500, 1000, 2000]);
  });

  it('is bounded', () => {
    // A sync that retries forever against a rate-limited Jira is
    // indistinguishable from an attack, and the poll interval brings another
    // attempt along shortly anyway.
    expect(backoffDelays(3).length).toBe(3);
    expect(backoffDelays(5).length).toBe(5);
  });

  it('can be configured to no retries at all', () => {
    expect(backoffDelays(0)).toEqual([]);
  });

  it('never returns a negative or zero delay', () => {
    expect(backoffDelays(4).every((d) => d > 0)).toBe(true);
  });
});
