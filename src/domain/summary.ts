import type {
  Actor,
  CardSource,
  Summary,
  SummaryCard,
  SummaryMovement,
  SummaryPeriod,
} from '../shared/types.js';

/** A history row joined to the card it describes, as the repository reads it. */
export interface MovementRow {
  cardId: string;
  title: string;
  source: CardSource;
  issueKey: string | null;
  issueUrl: string | null;
  fromColumn: string;
  toColumn: string;
  actor: Actor;
  occurredAt: string;
  archived: boolean;
}

/** A card as it stands now, for the in-progress and blocked groups. */
export interface StateRow {
  cardId: string;
  title: string;
  source: CardSource;
  issueKey: string | null;
  issueUrl: string | null;
  columnId: number;
  /**
   * Slice 5 retired the Blocked column, so "what is blocked" is no longer a
   * question about which column a card sits in (FR-415).
   */
  blocked: boolean;
}

export interface SummaryInput {
  period: SummaryPeriod;
  from: string;
  to: string;
  movements: MovementRow[];
  current: StateRow[];
}

export const IN_PROGRESS_COLUMN_ID = 2;
/**
 * Retired by slice 5. Kept only because the movement history still resolves
 * against it (FR-446); nothing groups by it any more.
 */
export const RETIRED_BLOCKED_COLUMN_ID = 3;

const asCard = (row: StateRow): SummaryCard => ({
  cardId: row.cardId,
  title: row.title,
  source: row.source,
  issueKey: row.issueKey,
  issueUrl: row.issueUrl,
});

/**
 * Turns rows already read into the three groups a standup needs.
 *
 * Movements answer "what happened"; the current board answers "where things
 * stand". Both are needed and neither substitutes for the other — a card can
 * be in progress without having moved this period, and a summary built only
 * from movements would omit exactly the work the standup is about.
 *
 * Pure: no clock, no database. The period boundaries arrive already decided.
 */
export const buildSummary = ({
  period,
  from,
  to,
  movements,
  current,
}: SummaryInput): Omit<Summary, 'text'> => {
  // Order is the repository's, which reads chronologically. Preserved rather
  // than re-sorted so there is one place that decides it.
  const moved: SummaryMovement[] = movements.map((m) => ({ ...m }));

  // Blocked wins over in-progress, so the two groups stay disjoint.
  //
  // They were mutually exclusive by construction until slice 5, because a card
  // was in one column or the other. Now that blocked is a flag they can overlap,
  // and a card listed under both would be read out twice at standup — which is
  // exactly the friction the generated summary exists to remove.
  const inProgress = current
    .filter((c) => c.columnId === IN_PROGRESS_COLUMN_ID && !c.blocked)
    .map(asCard);
  // By the flag, not the column. A blocked card now sits wherever the work
  // actually is — in progress, in test, in review — and grouping by column
  // would report an empty list forever (FR-415).
  const blocked = current.filter((c) => c.blocked).map(asCard);

  return {
    period,
    from,
    to,
    moved,
    inProgress,
    blocked,
    // Computed here rather than left to the client, so "there was nothing to
    // report" has one definition. Note that in-progress work with no movement
    // is NOT empty: a standup saying "nothing to report" while three things
    // are in flight would be actively misleading.
    empty: moved.length === 0 && inProgress.length === 0 && blocked.length === 0,
  };
};
