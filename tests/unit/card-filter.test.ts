import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTER,
  isActive,
  matches,
  type Filter,
} from '../../src/domain/card-filter.js';
import type { Card } from '../../src/shared/types.js';

/**
 * Covers BH-301 through BH-304, and SC-302's requirement that every filter
 * combination returns exactly the cards matching all of them — no false
 * positives, no omissions.
 *
 * That is a claim about combinations, not about examples, so the combination
 * cases below are enumerated rather than sampled.
 */
const card = (over: Partial<Card> = {}): Card => ({
  id: over.id ?? 'card-1',
  source: 'local',
  title: 'Rotate staging certificates',
  description: 'Expiring next month',
  priority: 'medium',
  dueDate: null,
  overdue: false,
  columnId: 1,
  position: 1,
  tags: [],
  issueKey: null,
  issueUrl: null,
  hasConflict: false,
  blocked: false,
  blockedDivergesFromJira: false,
  carriedIterations: 0,
  points: null,
  pointsDivergesFromJira: false,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  ...over,
});

const filter = (over: Partial<Filter> = {}): Filter => ({ ...EMPTY_FILTER, ...over });

describe('the empty filter', () => {
  it('is not active', () => {
    expect(isActive(EMPTY_FILTER)).toBe(false);
  });

  it('matches every card, so an unfiltered board hides nothing', () => {
    expect(matches(card(), EMPTY_FILTER)).toBe(true);
    expect(
      matches(card({ source: 'jira', priority: 'high', overdue: true }), EMPTY_FILTER),
    ).toBe(true);
  });

  it('treats whitespace-only text as no filter at all', () => {
    // Otherwise a stray space empties the board and the user cannot see why.
    expect(isActive(filter({ text: '   ' }))).toBe(false);
    expect(matches(card(), filter({ text: '   ' }))).toBe(true);
  });
});

describe('text filtering (BH-301)', () => {
  it('matches a word in the title', () => {
    expect(matches(card(), filter({ text: 'staging' }))).toBe(true);
  });

  it('matches a word in the description', () => {
    expect(matches(card(), filter({ text: 'expiring' }))).toBe(true);
  });

  it('is case-insensitive in both directions', () => {
    expect(matches(card({ title: 'ROTATE' }), filter({ text: 'rotate' }))).toBe(true);
    expect(matches(card({ title: 'rotate' }), filter({ text: 'ROTATE' }))).toBe(true);
  });

  it('does not match a word that appears in neither', () => {
    expect(matches(card(), filter({ text: 'invoice' }))).toBe(false);
  });

  it('handles a card with no description without matching everything', () => {
    expect(matches(card({ description: null }), filter({ text: 'expiring' }))).toBe(
      false,
    );
  });

  it('does NOT match a tag name', () => {
    // Tags have their own control. A card tagged "ops" must not be pulled in by
    // typing "ops" into the text box — the spec calls this out as a surprising
    // overlap worth preventing, not an edge case to shrug at.
    expect(matches(card({ tags: ['ops'] }), filter({ text: 'ops' }))).toBe(false);
  });
});

describe('tag and priority filtering (BH-302)', () => {
  it('keeps a card carrying the tag', () => {
    expect(matches(card({ tags: ['ops', 'security'] }), filter({ tag: 'ops' }))).toBe(
      true,
    );
  });

  it('drops a card without it', () => {
    expect(matches(card({ tags: ['security'] }), filter({ tag: 'ops' }))).toBe(false);
  });

  it('drops an untagged card', () => {
    expect(matches(card({ tags: [] }), filter({ tag: 'ops' }))).toBe(false);
  });

  it('keeps only the chosen priority', () => {
    expect(matches(card({ priority: 'high' }), filter({ priority: 'high' }))).toBe(true);
    expect(matches(card({ priority: 'low' }), filter({ priority: 'high' }))).toBe(false);
  });
});

describe('source and overdue filtering (BH-303)', () => {
  it('separates Jira-sourced from ad-hoc cards', () => {
    expect(matches(card({ source: 'jira' }), filter({ source: 'jira' }))).toBe(true);
    expect(matches(card({ source: 'local' }), filter({ source: 'jira' }))).toBe(false);
    expect(matches(card({ source: 'local' }), filter({ source: 'local' }))).toBe(true);
  });

  it('keeps only overdue cards when asked', () => {
    expect(matches(card({ overdue: true }), filter({ overdueOnly: true }))).toBe(true);
    expect(matches(card({ overdue: false }), filter({ overdueOnly: true }))).toBe(false);
  });

  it('keeps overdue cards too when not asked — it narrows, never excludes', () => {
    expect(matches(card({ overdue: true }), filter({ overdueOnly: false }))).toBe(true);
  });
});

describe('combined filters intersect (BH-304, SC-302)', () => {
  const subject = card({
    tags: ['ops'],
    priority: 'high',
    source: 'jira',
    overdue: true,
  });

  // Every pair of the five clauses, both matching. If any clause were treated
  // as a disjunction this table would catch it wherever the pair disagrees.
  const clauses: [string, Filter][] = [
    ['text', filter({ text: 'staging' })],
    ['tag', filter({ tag: 'ops' })],
    ['priority', filter({ priority: 'high' })],
    ['source', filter({ source: 'jira' })],
    ['overdue', filter({ overdueOnly: true })],
  ];

  for (const [nameA, a] of clauses) {
    for (const [nameB, b] of clauses) {
      if (nameA >= nameB) continue;
      it(`${nameA} + ${nameB}: both matching keeps the card`, () => {
        expect(matches(subject, { ...a, ...pick(b, nameB) })).toBe(true);
      });

      it(`${nameA} + ${nameB}: one failing drops the card`, () => {
        const failing = { ...a, ...pick(b, nameB) };
        expect(matches(card({ title: 'nothing', description: null }), failing)).toBe(
          false,
        );
      });
    }
  }

  it('a tag that matches and a priority that does not drops the card', () => {
    expect(matches(subject, filter({ tag: 'ops', priority: 'low' }))).toBe(false);
  });

  it('a priority that matches and a tag that does not drops the card', () => {
    expect(matches(subject, filter({ tag: 'billing', priority: 'high' }))).toBe(false);
  });

  it('all five matching keeps the card', () => {
    expect(
      matches(
        subject,
        filter({
          text: 'staging',
          tag: 'ops',
          priority: 'high',
          source: 'jira',
          overdueOnly: true,
        }),
      ),
    ).toBe(true);
  });
});

/** The one clause of `b` that `b` actually sets, so pairs compose cleanly. */
const pick = (f: Filter, which: string): Partial<Filter> => {
  if (which === 'text') return { text: f.text };
  if (which === 'tag') return { tag: f.tag };
  if (which === 'priority') return { priority: f.priority };
  if (which === 'source') return { source: f.source };
  return { overdueOnly: f.overdueOnly };
};

describe('isActive', () => {
  it('is true for any single set clause', () => {
    expect(isActive(filter({ text: 'x' }))).toBe(true);
    expect(isActive(filter({ tag: 'ops' }))).toBe(true);
    expect(isActive(filter({ priority: 'low' }))).toBe(true);
    expect(isActive(filter({ source: 'jira' }))).toBe(true);
    expect(isActive(filter({ overdueOnly: true }))).toBe(true);
  });
});
