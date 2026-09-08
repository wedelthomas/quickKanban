import { describe, expect, it } from 'vitest';
import { shortIterationName } from '../../src/domain/iteration-name.js';

/**
 * Every input below is a real sprint name read from yourcompany.atlassian.net, not
 * an invented one — the naming varies more between teams than any single
 * example would suggest.
 */
describe('shortening a sprint name to its ordinal', () => {
  it('drops a spaced team prefix', () => {
    expect(shortIterationName('Anchor Team 2026 S18')).toBe('S18');
    expect(shortIterationName('Signal 2026 S17')).toBe('S17');
  });

  it('drops a prefix run together with the year', () => {
    expect(shortIterationName('OpsTeam2026 S18 (08/25-09/08)')).toBe('S18');
  });

  it('keeps an I-series ordinal', () => {
    expect(shortIterationName('TSPRO 2026 I15')).toBe('I15');
  });

  it('normalises case and stray spacing', () => {
    expect(shortIterationName('Some Team 2026 s 7')).toBe('S7');
  });

  it('strips a leading zero rather than showing S05', () => {
    expect(shortIterationName('Anchor Team 2026 S05')).toBe('S5');
  });

  it('falls back to the whole name when no ordinal is recognisable', () => {
    // Better to show something odd than nothing: a board named in a way this
    // does not anticipate still deserves a banner.
    expect(shortIterationName('Ronin - Automation')).toBe('Ronin - Automation');
  });

  it('passes null through, for the estimated case that has no name', () => {
    expect(shortIterationName(null)).toBeNull();
  });

  it('is not fooled by a year that looks like an ordinal', () => {
    expect(shortIterationName('Anchor Team 2026 S18')).not.toBe('S2026');
  });
});
