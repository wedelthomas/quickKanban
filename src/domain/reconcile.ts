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
  /**
   * Which column the last sync left this card in, or null if no sync has
   * recorded one yet.
   *
   * The board "moved" if this differs from `localColumn` — a comparison of
   * column identity, not of status names. Deriving it from names instead was a
   * live defect: a column can be mapped to only one status, so an issue whose
   * real status is a synonym of that one ("In Progress" where the column is
   * mapped to "Development") looked moved on every sync, and the board tried
   * to transition an issue nobody had touched.
   */
  lastKnownColumn: number | null;
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
 * "Changed" is defined against what the last sync recorded, not against a
 * timestamp. The board moved if the card is in a different column than the one
 * last recorded; Jira moved if its status differs from the status last
 * recorded. Neither test involves comparing two names for the same thing.
 */
export const reconcile = ({
  mappings,
  localColumn,
  lastKnownColumn,
  remoteStatus,
  lastKnownStatus,
}: ReconcileInput): Decision => {
  const localStatus = statusForColumn(mappings, localColumn);
  const remoteChanged = !same(remoteStatus, lastKnownStatus);

  // A card with no recorded column counts as unmoved. Guessing the other way
  // would push every card on the board the first time this ran.
  //
  // An unmapped column still cannot be pushed — the user parked the card
  // somewhere Jira has no word for — so both conditions have to hold.
  const localChanged =
    localStatus !== null && lastKnownColumn !== null && localColumn !== lastKnownColumn;

  if (!remoteChanged) {
    return localChanged
      ? { kind: 'push-local', toStatus: localStatus! }
      : { kind: 'no-op' };
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
