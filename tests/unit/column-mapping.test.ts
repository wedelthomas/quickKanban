import { describe, expect, it } from 'vitest';
import { statusForColumn, columnForJiraStatus, type Mapping } from '../../src/domain/column-mapping.js';

/** Covers BH-202 and BH-224. */
const mappings: Mapping[] = [
  { columnId: 1, columnPosition: 1, statusName: 'Open' },
  { columnId: 2, columnPosition: 2, statusName: 'Development' },
  // 3 (Blocked) deliberately absent — a column with no mapping is local-only.
  { columnId: 4, columnPosition: 4, statusName: 'Test' },
  { columnId: 5, columnPosition: 5, statusName: 'PO Approve' },
];

describe('statusForColumn', () => {
  it('returns the mapped status', () => {
    expect(statusForColumn(mappings, 2)).toBe('Development');
  });

  it('returns null for an unmapped column, which means local-only', () => {
    // The absence of a mapping is the mechanism that lets Blocked exist on a
    // board whose Jira workflow has no such status.
    expect(statusForColumn(mappings, 3)).toBeNull();
  });

  it('returns null for a column that does not exist', () => {
    expect(statusForColumn(mappings, 99)).toBeNull();
  });
});

describe('columnForJiraStatus', () => {
  it('returns the column mapped to that status', () => {
    expect(columnForJiraStatus(mappings, 'Test')).toBe(4);
  });

  it('matches case-insensitively', () => {
    expect(columnForJiraStatus(mappings, 'development')).toBe(2);
  });

  it('returns null for a status no column maps to', () => {
    // The card stays where it is and the user is told, rather than being moved
    // somewhere arbitrary.
    expect(columnForJiraStatus(mappings, 'Cancelled')).toBeNull();
  });

  it('resolves a shared status to the first column in board order (BH-224)', () => {
    const shared: Mapping[] = [
      { columnId: 4, columnPosition: 4, statusName: 'Review' },
      { columnId: 5, columnPosition: 5, statusName: 'Review' },
    ];
    expect(columnForJiraStatus(shared, 'Review')).toBe(4);
  });

  it('board order, not insertion order, decides a shared status', () => {
    const shared: Mapping[] = [
      { columnId: 5, columnPosition: 5, statusName: 'Review' },
      { columnId: 4, columnPosition: 4, statusName: 'Review' },
    ];
    expect(columnForJiraStatus(shared, 'Review')).toBe(4);
  });

  it('ignores surrounding whitespace', () => {
    expect(columnForJiraStatus(mappings, '  Open  ')).toBe(1);
  });
});
