import { describe, expect, it } from 'vitest';
import {
  BLOCKED_COLUMN_ID,
  IN_PROGRESS_COLUMN_ID,
  buildSummary,
  type MovementRow,
  type StateRow,
  type SummaryInput,
} from '../../src/domain/summary.js';

/**
 * Covers BH-316, BH-319 and BH-321.
 *
 * Pure over rows already read, so the grouping rules are testable without a
 * database and without a clock — the period boundaries arrive as arguments.
 */
const movement = (over: Partial<MovementRow> = {}): MovementRow => ({
  cardId: 'card-1',
  title: 'Rotate staging certificates',
  source: 'local',
  issueKey: null,
  issueUrl: null,
  fromColumn: 'Backlog',
  toColumn: 'In Progress',
  actor: 'user',
  occurredAt: '2026-08-26T14:02:00.000Z',
  archived: false,
  ...over,
});

const state = (over: Partial<StateRow> = {}): StateRow => ({
  cardId: 'card-2',
  title: 'Draft the quarterly report',
  source: 'local',
  issueKey: null,
  issueUrl: null,
  columnId: IN_PROGRESS_COLUMN_ID,
  ...over,
});

const input = (over: Partial<SummaryInput> = {}): SummaryInput => ({
  period: 'daily',
  from: '2026-08-26',
  to: '2026-08-27',
  movements: [],
  current: [],
  ...over,
});

describe('the three groups (BH-316)', () => {
  it('lists what moved in the period', () => {
    const s = buildSummary(input({ movements: [movement()] }));
    expect(s.moved).toHaveLength(1);
    expect(s.moved[0]).toMatchObject({
      title: 'Rotate staging certificates',
      fromColumn: 'Backlog',
      toColumn: 'In Progress',
    });
  });

  it('lists what is in progress now, from state rather than from movements', () => {
    // A card can be in progress without having moved in the period — it was
    // moved there last week and is still being worked on. A summary built only
    // from movements would omit exactly the work the standup is about.
    const s = buildSummary(
      input({ current: [state({ columnId: IN_PROGRESS_COLUMN_ID })] }),
    );
    expect(s.inProgress.map((c) => c.title)).toEqual(['Draft the quarterly report']);
    expect(s.blocked).toEqual([]);
  });

  it('lists what is blocked now', () => {
    const s = buildSummary(input({ current: [state({ columnId: BLOCKED_COLUMN_ID })] }));
    expect(s.blocked.map((c) => c.title)).toEqual(['Draft the quarterly report']);
    expect(s.inProgress).toEqual([]);
  });

  it('ignores cards in other columns entirely', () => {
    const s = buildSummary(
      input({ current: [state({ columnId: 1 }), state({ columnId: 6 })] }),
    );
    expect(s.inProgress).toEqual([]);
    expect(s.blocked).toEqual([]);
  });

  it('keeps the three groups separate even when one card is in two of them', () => {
    // The same card moved into Blocked during the period and is still there.
    // It belongs in both lists: "what happened" and "where things stand" are
    // different questions.
    const s = buildSummary(
      input({
        movements: [movement({ cardId: 'card-9', toColumn: 'Blocked' })],
        current: [state({ cardId: 'card-9', columnId: BLOCKED_COLUMN_ID })],
      }),
    );
    expect(s.moved).toHaveLength(1);
    expect(s.blocked).toHaveLength(1);
  });
});

describe('who caused a movement (BH-319)', () => {
  it('carries the actor through unchanged', () => {
    const s = buildSummary(
      input({ movements: [movement({ actor: 'user' }), movement({ actor: 'sync' })] }),
    );
    expect(s.moved.map((m) => m.actor)).toEqual(['user', 'sync']);
  });

  it('does not drop or merge a sync movement', () => {
    // FR-328 exists so the user does not report a transition a teammate made as
    // their own progress. Hiding it would be worse than not marking it.
    const s = buildSummary(input({ movements: [movement({ actor: 'sync' })] }));
    expect(s.moved).toHaveLength(1);
    expect(s.moved[0]?.actor).toBe('sync');
  });

  it('carries a system movement too', () => {
    const s = buildSummary(input({ movements: [movement({ actor: 'system' })] }));
    expect(s.moved[0]?.actor).toBe('system');
  });
});

describe('both sources appear (BH-318)', () => {
  it('keeps the issue key on a Jira-sourced entry and null on an ad-hoc one', () => {
    const s = buildSummary(
      input({
        movements: [
          movement({ cardId: 'a', source: 'jira', issueKey: 'AIHUB-1' }),
          movement({ cardId: 'b', source: 'local' }),
        ],
      }),
    );
    expect(s.moved.map((m) => m.issueKey)).toEqual(['AIHUB-1', null]);
  });
});

describe('archived work still counts (BH-317)', () => {
  it('includes a movement whose card has since left the board', () => {
    const s = buildSummary(input({ movements: [movement({ archived: true })] }));
    expect(s.moved).toHaveLength(1);
    expect(s.moved[0]?.archived).toBe(true);
  });
});

describe('an empty period (BH-321)', () => {
  it('is marked empty when all three groups are', () => {
    const s = buildSummary(input());
    expect(s.empty).toBe(true);
    expect(s.moved).toEqual([]);
    expect(s.inProgress).toEqual([]);
    expect(s.blocked).toEqual([]);
  });

  it('is NOT empty when only movements exist', () => {
    expect(buildSummary(input({ movements: [movement()] })).empty).toBe(false);
  });

  it('is NOT empty when only in-progress work exists', () => {
    // Nothing moved, but there is work under way. A standup with "nothing to
    // report" while three things are in flight would be actively misleading.
    expect(buildSummary(input({ current: [state()] })).empty).toBe(false);
  });

  it('is NOT empty when only blocked work exists', () => {
    expect(
      buildSummary(input({ current: [state({ columnId: BLOCKED_COLUMN_ID })] })).empty,
    ).toBe(false);
  });
});

describe('the period is reported back', () => {
  it('echoes what it was asked for, so the reader knows what they are looking at', () => {
    const s = buildSummary(
      input({ period: 'weekly', from: '2026-08-21', to: '2026-08-27' }),
    );
    expect(s).toMatchObject({ period: 'weekly', from: '2026-08-21', to: '2026-08-27' });
  });
});

describe('ordering', () => {
  it('keeps movements in the order given, which is chronological', () => {
    const s = buildSummary(
      input({
        movements: [
          movement({ cardId: 'first', occurredAt: '2026-08-26T09:00:00.000Z' }),
          movement({ cardId: 'second', occurredAt: '2026-08-26T17:00:00.000Z' }),
        ],
      }),
    );
    expect(s.moved.map((m) => m.cardId)).toEqual(['first', 'second']);
  });
});
