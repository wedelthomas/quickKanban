import { describe, expect, it } from 'vitest';
import { planMove, type MovePlan } from '../../src/domain/ordering.js';

const ids = (plan: MovePlan, columnId: number): string[] =>
  plan.assignments
    .filter((a) => a.columnId === columnId)
    .sort((a, b) => a.position - b.position)
    .map((a) => a.cardId);

describe('planMove within one column', () => {
  const column = { columnId: 1, cardIds: ['a', 'b', 'c'] };

  it('moves the last card to the top', () => {
    const plan = planMove({ cardId: 'c', from: column, to: column, toIndex: 1 });
    expect(ids(plan, 1)).toEqual(['c', 'a', 'b']);
    expect(plan.changed).toBe(true);
  });

  it('moves the first card to the bottom', () => {
    const plan = planMove({ cardId: 'a', from: column, to: column, toIndex: 3 });
    expect(ids(plan, 1)).toEqual(['b', 'c', 'a']);
  });

  it('moves a card into the middle', () => {
    const plan = planMove({ cardId: 'a', from: column, to: column, toIndex: 2 });
    expect(ids(plan, 1)).toEqual(['b', 'a', 'c']);
  });

  it('reports no change when the card already occupies that index', () => {
    // The API contract turns this into `moved: false` — no write, no history.
    const plan = planMove({ cardId: 'b', from: column, to: column, toIndex: 2 });
    expect(plan.changed).toBe(false);
    expect(plan.assignments).toEqual([]);
  });

  it('clamps an index past the end rather than leaving a gap', () => {
    const plan = planMove({ cardId: 'a', from: column, to: column, toIndex: 99 });
    expect(ids(plan, 1)).toEqual(['b', 'c', 'a']);
  });

  it('clamps an index below one', () => {
    const plan = planMove({ cardId: 'c', from: column, to: column, toIndex: 0 });
    expect(ids(plan, 1)).toEqual(['c', 'a', 'b']);
  });

  it('handles a single-card column', () => {
    const one = { columnId: 1, cardIds: ['a'] };
    expect(planMove({ cardId: 'a', from: one, to: one, toIndex: 1 }).changed).toBe(false);
  });

  it('assigns contiguous positions starting at one', () => {
    const plan = planMove({ cardId: 'c', from: column, to: column, toIndex: 1 });
    expect(plan.assignments.map((a) => a.position).sort()).toEqual([1, 2, 3]);
  });
});

describe('planMove across columns', () => {
  const from = { columnId: 1, cardIds: ['a', 'b', 'c'] };
  const to = { columnId: 2, cardIds: ['x', 'y'] };

  it('removes the card from its old column and closes the gap', () => {
    const plan = planMove({ cardId: 'b', from, to, toIndex: 1 });
    expect(ids(plan, 1)).toEqual(['a', 'c']);
  });

  it('inserts the card at the requested index in the new column', () => {
    const plan = planMove({ cardId: 'b', from, to, toIndex: 2 });
    expect(ids(plan, 2)).toEqual(['x', 'b', 'y']);
  });

  it('appends when the index is past the end of the destination', () => {
    const plan = planMove({ cardId: 'b', from, to, toIndex: 99 });
    expect(ids(plan, 2)).toEqual(['x', 'y', 'b']);
  });

  it('moves into an empty column', () => {
    const empty = { columnId: 3, cardIds: [] };
    const plan = planMove({ cardId: 'a', from, to: empty, toIndex: 1 });
    expect(ids(plan, 3)).toEqual(['a']);
    expect(ids(plan, 1)).toEqual(['b', 'c']);
  });

  it('is always a change, even to the same index number', () => {
    // Index 1 in another column is a different place, unlike index 1 at home.
    expect(planMove({ cardId: 'a', from, to, toIndex: 1 }).changed).toBe(true);
  });

  it('reports the column change so history can be recorded', () => {
    const plan = planMove({ cardId: 'b', from, to, toIndex: 1 });
    expect(plan.fromColumnId).toBe(1);
    expect(plan.toColumnId).toBe(2);
    expect(plan.columnChanged).toBe(true);
  });

  it('reports no column change for a reorder, so no history is written', () => {
    const plan = planMove({ cardId: 'a', from, to: from, toIndex: 3 });
    expect(plan.columnChanged).toBe(false);
  });
});
