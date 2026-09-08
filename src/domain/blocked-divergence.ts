/**
 * Who wins when the board and Jira disagree about a card being stuck.
 *
 * Three-way, like slice 3's sync decision and for the same reason: comparing
 * only local against remote cannot tell "I changed this" from "they changed
 * this". `lastSeenInJira` is what makes the difference legible.
 *
 * Deliberately NOT the conflict model. A status conflict freezes the card and
 * demands a decision, because either side's change may be a deliberate act
 * whose loss is unrecoverable. Blocked is cheaper than that in both directions:
 * the local value simply wins, the disagreement is shown rather than
 * adjudicated, and being wrong costs one click. Freezing a card over it would
 * spend the user's attention on something they can fix by looking at it
 * (FR-418, FR-419).
 */

export interface BlockedInputs {
  /** What the board currently says. */
  local: boolean;
  /** What Jira said at the last sync. Null means never observed. */
  lastSeenInJira: boolean | null;
  /** What Jira says now. */
  nowInJira: boolean;
}

export interface BlockedOutcome {
  blocked: boolean;
  diverges: boolean;
  /** Always recorded, whoever won: the next comparison depends on it. */
  lastSeenInJira: boolean;
}

export const reconcileBlocked = ({
  local,
  lastSeenInJira,
  nowInJira,
}: BlockedInputs): BlockedOutcome => {
  // Never observed: the board has no opinion to defend, so take Jira's.
  if (lastSeenInJira === null) {
    return { blocked: nowInJira, diverges: false, lastSeenInJira: nowInJira };
  }

  // Jira changed since we last looked, and the board had been agreeing with it.
  // Nothing is being overruled, so follow.
  if (nowInJira !== lastSeenInJira && local === lastSeenInJira) {
    return { blocked: nowInJira, diverges: false, lastSeenInJira: nowInJira };
  }

  // Otherwise the board's value stands. It diverges only when it actually
  // disagrees with what Jira says now — a marker that outlived the
  // disagreement would be worse than none (FR-420).
  return { blocked: local, diverges: local !== nowInJira, lastSeenInJira: nowInJira };
};
