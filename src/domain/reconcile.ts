import { columnForJiraStatus, statusForColumn, type Mapping } from './column-mapping.js';

export type Decision =
  /** The two sides agree, or neither moved. */
  | { kind: 'no-op' }
  /** Jira moved and the board did not. Move the card. */
  | { kind: 'apply-remote'; toColumnId: number; status: string }
  /** The board moved and Jira did not. Transition the issue. */
  | { kind: 'push-local'; toStatus: string }
  /** Both moved, and they disagree. Ask the user. */
  | { kind: 'conflict'; boardColumnId: number; jiraStatus: string }
  /** Jira moved somewhere the board cannot express. Leave it, say so. */
  | { kind: 'unmapped-remote-status'; status: string };

export interface ReconcileInput {
  mappings: readonly Mapping[];
  /** Where the card sits on the board now. */
  localColumn: number;
  /** What Jira says now. */
  remoteStatus: string;
  /** What Jira said at the last successful sync. */
  lastKnownStatus: string;
}

const same = (a: string | null, b: string | null): boolean =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

/**
 * Decides what to do about one card, from three inputs and nothing else.
 *
 * No clock, no database, no network, no ordering assumptions — which is what
 * makes the whole decision table testable as a table rather than as sixty-four
 * integration scenarios. It is also the function that decides whether to write
 * to a system other people can see, so it is the one most worth being able to
 * exercise exhaustively.
 *
 * "Changed" is defined against the last-known Jira status, not against a
 * timestamp. The board moved if the column it sits in no longer means what
 * Jira last said; Jira moved if its status differs from what was recorded.
 */
export const reconcile = ({
  mappings,
  localColumn,
  remoteStatus,
  lastKnownStatus,
}: ReconcileInput): Decision => {
  const localStatus = statusForColumn(mappings, localColumn);
  const remoteChanged = !same(remoteStatus, lastKnownStatus);

  // An unmapped column cannot express a status, so it cannot have "moved" in
  // Jira's terms — the user parked the card somewhere Jira has no word for.
  const localChanged = localStatus !== null && !same(localStatus, lastKnownStatus);

  if (!remoteChanged) {
    return localChanged ? { kind: 'push-local', toStatus: localStatus! } : { kind: 'no-op' };
  }

  const remoteColumn = columnForJiraStatus(mappings, remoteStatus);
  if (remoteColumn === null) {
    // Nothing to disagree about: the board has no column that means this. Say
    // so rather than inventing a destination or calling it a conflict.
    return { kind: 'unmapped-remote-status', status: remoteStatus };
  }

  if (!localChanged) {
    return { kind: 'apply-remote', toColumnId: remoteColumn, status: remoteStatus };
  }

  // Both moved. If they happen to agree, there is nothing to resolve — bring
  // the recorded state up to date and move on.
  if (same(localStatus, remoteStatus)) return { kind: 'no-op' };

  return { kind: 'conflict', boardColumnId: localColumn, jiraStatus: remoteStatus };
};
