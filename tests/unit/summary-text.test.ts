import { describe, expect, it } from 'vitest';
import { renderSummaryText } from '../../src/domain/summary-text.js';
import type { Summary } from '../../src/shared/types.js';

/**
 * Covers BH-318 and BH-320.
 *
 * These are the exact bytes the user pastes into a chat, so they are asserted
 * as exact bytes. Rendering server-side is what makes that possible at all —
 * were this done in the browser, the thing under test would be React markup
 * and a clipboard API, and no acceptance test could see the text.
 */
const summary = (over: Partial<Omit<Summary, 'text'>> = {}): Omit<Summary, 'text'> => ({
  period: 'daily',
  from: '2026-08-26',
  to: '2026-08-27',
  moved: [],
  inProgress: [],
  blocked: [],
  empty: false,
  ...over,
});

const movement = (over = {}) => ({
  cardId: 'card-1',
  title: 'Rotate staging certificates',
  source: 'local' as const,
  issueKey: null,
  issueUrl: null,
  fromColumn: 'Backlog',
  toColumn: 'In Progress',
  actor: 'user' as const,
  occurredAt: '2026-08-26T14:02:00.000Z',
  archived: false,
  ...over,
});

const card = (over = {}) => ({
  cardId: 'card-2',
  title: 'Draft the quarterly report',
  source: 'local' as const,
  issueKey: null,
  issueUrl: null,
  ...over,
});

describe('an empty summary (BH-321)', () => {
  it('says there was nothing rather than printing empty headings', () => {
    // Three empty headings read like a bug. One sentence reads like an answer.
    expect(renderSummaryText(summary({ empty: true }))).toBe(
      'No activity between 26 Aug and 27 Aug.',
    );
  });
});

describe('a daily summary (BH-316, BH-320)', () => {
  it('renders the three groups with headings, and nothing else', () => {
    const text = renderSummaryText(
      summary({
        moved: [movement()],
        inProgress: [card()],
        blocked: [card({ cardId: 'card-3', title: 'Waiting on legal' })],
      }),
    );

    expect(text).toBe(
      [
        'Moved',
        '• Rotate staging certificates — Backlog → In Progress',
        '',
        'In progress',
        '• Draft the quarterly report',
        '',
        'Blocked',
        '• Waiting on legal',
      ].join('\n'),
    );
  });

  it('omits a group that is empty rather than printing a bare heading', () => {
    const text = renderSummaryText(summary({ inProgress: [card()] }));
    expect(text).toBe(['In progress', '• Draft the quarterly report'].join('\n'));
  });
});

describe('issue keys (BH-318)', () => {
  it('prefixes a Jira-sourced entry with its key', () => {
    const text = renderSummaryText(
      summary({ moved: [movement({ source: 'jira', issueKey: 'AIHUB-1' })] }),
    );
    expect(text).toContain(
      '• AIHUB-1 Rotate staging certificates — Backlog → In Progress',
    );
  });

  it('prefixes a Jira-sourced card in the state groups too', () => {
    const text = renderSummaryText(
      summary({ inProgress: [card({ source: 'jira', issueKey: 'AIP-190' })] }),
    );
    expect(text).toContain('• AIP-190 Draft the quarterly report');
  });

  it('adds no prefix to an ad-hoc card', () => {
    const text = renderSummaryText(summary({ moved: [movement()] }));
    expect(text).toContain('• Rotate staging certificates —');
  });
});

describe('who caused it (BH-319)', () => {
  it('marks a sync movement as having come from Jira', () => {
    // So the user does not read out a transition a teammate made as their own
    // progress. The mark is on the line itself, because the line is what gets
    // pasted — a marker that only exists in the interface would be lost.
    const text = renderSummaryText(
      summary({
        moved: [movement({ actor: 'sync', source: 'jira', issueKey: 'AIHUB-1' })],
      }),
    );
    expect(text).toBe(
      'Moved\n• AIHUB-1 Rotate staging certificates — Backlog → In Progress (in Jira)',
    );
  });

  it('marks a system movement as automatic', () => {
    const text = renderSummaryText(summary({ moved: [movement({ actor: 'system' })] }));
    expect(text).toContain('(automatic)');
  });

  it('marks a user movement with nothing at all', () => {
    const text = renderSummaryText(summary({ moved: [movement({ actor: 'user' })] }));
    expect(text).not.toContain('(');
  });
});

describe('plain text, suitable for pasting (BH-320)', () => {
  it('contains no HTML and no markdown emphasis', () => {
    const text = renderSummaryText(
      summary({
        moved: [movement({ source: 'jira', issueKey: 'AIHUB-1' })],
        inProgress: [card()],
      }),
    );
    expect(text).not.toMatch(/[<>]/);
    expect(text).not.toMatch(/\*\*|__|\[.*\]\(/);
  });

  it('ends without a trailing newline, so a paste adds no blank line', () => {
    const text = renderSummaryText(summary({ moved: [movement()] }));
    expect(text).not.toMatch(/\n$/);
  });
});
