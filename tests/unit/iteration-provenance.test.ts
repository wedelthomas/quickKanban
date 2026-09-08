import { describe, expect, it } from 'vitest';
import {
  decideIteration,
  type CachedIteration,
} from '../../src/domain/iteration-provenance.js';

/**
 * TEST-419 (BH-419), TEST-420 (BH-420), TEST-422 (BH-422).
 *
 * The banner's honesty lives here. Showing a stale iteration is fine; showing
 * one *as if* it were fresh is not, because the reader would plan against it.
 */
const read = {
  ordinalName: 'Anchor Team 2026 S18',
  startsOn: '2026-08-24',
  endsOn: '2026-09-07',
};

const cached: CachedIteration = { ...read, observedAt: '2026-08-25T09:00:00.000Z' };

const config = { anchorDate: '2026-08-24', cadenceDays: 14 };
const now = new Date('2026-08-26T09:00:00');

describe('deciding what the banner shows', () => {
  it('prefers what was just read', () => {
    const result = decideIteration({ read, cached, config, now });
    expect(result?.provenance).toBe('read');
    expect(result?.ordinalName).toBe('Anchor Team 2026 S18');
  });

  it('falls back to the cache when nothing could be read, and marks it', () => {
    const result = decideIteration({ read: null, cached, config, now });
    expect(result?.provenance).toBe('cached');
    expect(result?.ordinalName).toBe('Anchor Team 2026 S18');
  });

  it('estimates when there is neither, and carries no ordinal', () => {
    const result = decideIteration({ read: null, cached: null, config, now });
    expect(result?.provenance).toBe('estimated');
    // The ordinal resets at the fiscal year, so counting cadences from the
    // anchor would be wrong every January. An absent number beats a wrong one.
    expect(result?.ordinalName).toBeNull();
    expect(result?.startsOn).toBe('2026-08-24');
    expect(result?.endsOn).toBe('2026-09-07');
  });

  it('advances the estimate by whole cadences', () => {
    const later = decideIteration({
      read: null,
      cached: null,
      config,
      now: new Date('2026-09-10T09:00:00'),
    });
    expect(later?.startsOn).toBe('2026-09-07');
    expect(later?.endsOn).toBe('2026-09-21');
  });

  it('estimates backwards from an anchor in the future', () => {
    const before = decideIteration({
      read: null,
      cached: null,
      config,
      now: new Date('2026-08-10T09:00:00'),
    });
    expect(before?.startsOn).toBe('2026-08-10');
  });

  it('refuses to present a cached iteration that has already ended', () => {
    // FR-432. A board left open across a boundary must not keep asserting the
    // iteration that finished; an estimate is less wrong than a stale claim.
    const result = decideIteration({
      read: null,
      cached,
      config,
      now: new Date('2026-09-20T09:00:00'),
    });
    expect(result?.provenance).toBe('estimated');
  });

  it('still trusts a freshly read iteration whose dates look elapsed', () => {
    // If the source says this is the active sprint, it is — even when the dates
    // disagree, which happens when a team runs late and extends a sprint.
    const result = decideIteration({
      read,
      cached: null,
      config,
      now: new Date('2026-09-20T09:00:00'),
    });
    expect(result?.provenance).toBe('read');
  });

  it('yields nothing when it has nothing to work from', () => {
    expect(decideIteration({ read: null, cached: null, config: null, now })).toBeNull();
  });
});
