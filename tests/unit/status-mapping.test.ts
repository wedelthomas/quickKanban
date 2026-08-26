import { describe, expect, it } from 'vitest';
import { columnForStatus, BACKLOG, IN_PROGRESS, TEST, PO_REVIEW, DONE, BLOCKED } from '../../src/domain/status-mapping.js';

/**
 * Covers BH-101 and BH-126.
 *
 * The status names below are the ones this user's Jira actually returns —
 * Open, Development, Test, In Progress — rather than the ones a generic Jira
 * tutorial would use. A mapping built against imagined statuses would have
 * looked right and placed eight of eleven issues wrongly.
 */
describe('columnForStatus', () => {
  it.each([
    ['Open', BACKLOG],
    ['To Do', BACKLOG],
    ['Backlog', BACKLOG],
    ['New', BACKLOG],
    ['In Progress', IN_PROGRESS],
    ['Development', IN_PROGRESS],
    ['In Development', IN_PROGRESS],
    ['Blocked', BLOCKED],
    ['On Hold', BLOCKED],
    ['Test', TEST],
    ['Testing', TEST],
    ['QA', TEST],
    ['In Review', PO_REVIEW],
    ['PO Review', PO_REVIEW],
    ['Code Review', PO_REVIEW],
    ['Done', DONE],
    ['Closed', DONE],
    ['Resolved', DONE],
  ])('maps %s to column %i', (status, column) => {
    expect(columnForStatus(status)).toBe(column);
  });

  it('matches case-insensitively', () => {
    expect(columnForStatus('DEVELOPMENT')).toBe(IN_PROGRESS);
    expect(columnForStatus('in progress')).toBe(IN_PROGRESS);
  });

  it('ignores surrounding whitespace', () => {
    expect(columnForStatus('  Test  ')).toBe(TEST);
  });

  it('falls back to Backlog for an unrecognised status (BH-126)', () => {
    // Dropping the card would lose work; refusing the sync would fail the
    // whole import over one unfamiliar workflow. Backlog is visible and wrong
    // in a way the user can fix in one drag.
    expect(columnForStatus('Awaiting Interstellar Approval')).toBe(BACKLOG);
  });

  it('falls back to Backlog for an empty status', () => {
    expect(columnForStatus('')).toBe(BACKLOG);
  });
});
