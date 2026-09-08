import type pg from 'pg';
import { decideCarryOver } from '../../domain/carry-over.js';

/**
 * Applies the carry-over decision to every live card.
 *
 * Runs when the iteration is resolved, which is the only moment a boundary can
 * be observed. One statement over all cards rather than a query per card: the
 * decision is pure and cheap, and the board holds tens of cards, so reading
 * them all is far less work than the round trips would be.
 *
 * Failures are swallowed by the caller on purpose — a carry-over count that
 * failed to update is a stale badge, and a stale badge must not cost the user
 * their banner or their board.
 */
export class CarryOverService {
  constructor(private readonly pool: pg.Pool) {}

  async observe(currentIteration: string | null): Promise<void> {
    // An estimated iteration has no name, so there is nothing to count
    // against. Doing nothing is correct rather than merely safe: counting
    // against "unknown" would corrupt the sequence for every card.
    if (currentIteration === null) return;

    const { rows } = await this.pool.query<{
      id: string;
      column_key: string;
      carried_iterations: number;
      iteration_seen: string | null;
    }>(
      `SELECT c.id, col.key AS column_key, c.carried_iterations, c.iteration_seen
         FROM cards c JOIN columns col ON col.id = c.column_id
        WHERE c.deleted_at IS NULL AND c.archived_at IS NULL`,
    );

    for (const row of rows) {
      const outcome = decideCarryOver({
        columnKey: row.column_key,
        carried: row.carried_iterations,
        iterationSeen: row.iteration_seen,
        currentIteration,
      });

      // Written only when something changed. On a board that has not crossed a
      // boundary this makes the whole pass a read, which is what lets it run on
      // every resolution without thought.
      if (
        outcome.carried === row.carried_iterations &&
        outcome.iterationSeen === row.iteration_seen
      ) {
        continue;
      }

      await this.pool.query(
        'UPDATE cards SET carried_iterations = $2, iteration_seen = $3 WHERE id = $1',
        [row.id, outcome.carried, outcome.iterationSeen],
      );
    }
  }
}
