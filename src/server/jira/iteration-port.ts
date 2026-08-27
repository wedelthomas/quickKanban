import type { Sprint } from '../../domain/sprint-selection.js';

/**
 * Where the iteration comes from.
 *
 * A separate port from JiraPort, addressing the same host. That looks like
 * duplication and is not: JiraPort's failures must be LOUD — a refused
 * transition reverts a card and tells the user why — while every failure here
 * is absorbed into a cached or estimated value and never reaches the user
 * (FR-430). Putting a degrade-silently method behind an interface whose whole
 * contract is fail-loudly would blur the distinction that interface exists to
 * protect.
 *
 * It also sits on a different API surface — Jira's Agile endpoints rather than
 * its REST v3 ones — so the two would not have shared a client anyway.
 */
export interface IterationPort {
  /**
   * Every active sprint on the board, unfiltered.
   *
   * Choosing among them is the caller's job, not the adapter's: board 1391
   * carries two at all times, one per team sharing it, and which one is "ours"
   * is configuration rather than a property of the response.
   */
  listActiveSprints(boardId: number): Promise<Sprint[]>;
}
