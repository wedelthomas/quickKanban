import { describe, expect, it } from 'vitest';
import { normalizeTags } from '../../src/domain/tags.js';

/** Covers BH-005 and the vocabulary half of BH-030. */
describe('normalizeTags', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeTags(['  ops  '])).toEqual(['ops']);
  });

  it('folds case so the vocabulary cannot fork (BH-005)', () => {
    expect(normalizeTags(['Ops'])).toEqual(['ops']);
  });

  it('deduplicates case-insensitively within one card (BH-005)', () => {
    expect(normalizeTags(['Ops', 'ops ', 'security'])).toEqual(['ops', 'security']);
  });

  it('drops empty and whitespace-only entries', () => {
    expect(normalizeTags(['ops', '', '   '])).toEqual(['ops']);
  });

  it('returns an empty list for no tags', () => {
    expect(normalizeTags([])).toEqual([]);
  });

  it('preserves the order of first appearance', () => {
    expect(normalizeTags(['zebra', 'ops', 'Zebra'])).toEqual(['zebra', 'ops']);
  });

  it('keeps internal spaces, which are legitimate in a tag', () => {
    expect(normalizeTags(['meeting follow-up'])).toEqual(['meeting follow-up']);
  });
});
