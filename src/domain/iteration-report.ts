import type {
  IterationCommitment,
  IterationReport,
  IterationReportPointsSection,
} from '../shared/types.js';
import {
  computeElapsedSeconds,
  firstWorkingEntry,
  lastMovement,
  WORKING_COLUMN_KEYS,
  type BlockedInterval,
  type Movement,
} from './elapsed-time.js';
import type { WorkingCalendar } from './elapsed-time.js';

/**
 * Whether an iteration's report cannot vouch for its own completeness
 * (FR-542, FR-548) — either its span predates the first movement this board
 * ever recorded, or it predates blocked-interval tracking altogether, in
 * which case any card's time may be an upper bound (a blocked stretch
 * before tracking began has no interval to subtract, research.md's
 * "Blocked time can only be excluded from this feature onward").
 *
 * `earliestBlockedEventAt === null` means blocked tracking has never fired
 * at all — conservative, since that says nothing about whether any card in
 * this iteration was ever blocked, only that this board cannot rule it out.
 */
export const determineIncomplete = (
  startsOn: string,
  earliestMovementAt: string | null,
  earliestBlockedEventAt: string | null,
  hasAnyMovement: boolean,
): boolean => {
  const start = new Date(`${startsOn}T00:00:00`);
  const movementIncomplete =
    earliestMovementAt !== null && new Date(earliestMovementAt) > start;
  const blockedIncomplete =
    earliestBlockedEventAt === null
      ? hasAnyMovement
      : new Date(earliestBlockedEventAt) > start;
  return movementIncomplete || blockedIncomplete;
};

export interface ReportInputCard {
  cardId: string;
  title: string;
  /** 'local' or a Jira project key ("AIHUB"), never the literal source enum. */
  project: string;
  points: number | null;
  movements: Movement[];
  blockedEvents: BlockedInterval[];
}

export interface ReportInput {
  ordinalName: string;
  startsOn: string;
  endsOn: string;
  cards: ReportInputCard[];
  calendar: WorkingCalendar;
  commitment: IterationCommitment | null;
  /** True when the period predates this feature's first recorded movement (FR-542). */
  incomplete: boolean;
  now: Date;
}

const share = (part: number, total: number): number => (total > 0 ? part / total : 0);

const withinSpan = (occurredAt: string, startsOn: string, endsOnExclusive: string): boolean =>
  occurredAt >= `${startsOn}T00:00:00` && occurredAt < endsOnExclusive;

/**
 * Assembles one iteration's report from its cards' raw history — the pure
 * core of `ReportService.iterationReport`. Time is computed unconditionally;
 * points are withheld (FR-523) only when no pointed card contributes to this
 * iteration's commitment, completion or scope at all.
 */
export const buildIterationReport = (input: ReportInput): IterationReport => {
  const { ordinalName, startsOn, endsOn, cards, calendar, commitment, incomplete, now } = input;
  const span = { startsOn, endsOn };

  const byCard = cards
    .map((card) => ({
      cardId: card.cardId,
      title: card.title,
      seconds: computeElapsedSeconds(card.movements, card.blockedEvents, calendar, span, now),
    }))
    .filter((row) => row.seconds > 0);

  const byProjectMap = new Map<string, number>();
  for (const card of cards) {
    const seconds = computeElapsedSeconds(card.movements, card.blockedEvents, calendar, span, now);
    if (seconds <= 0) continue;
    byProjectMap.set(card.project, (byProjectMap.get(card.project) ?? 0) + seconds);
  }
  const byProject = [...byProjectMap.entries()].map(([project, seconds]) => ({
    project,
    seconds,
  }));
  const totalTimeSeconds = byCard.reduce((sum, row) => sum + row.seconds, 0);
  const localTimeSeconds = byProjectMap.get('local') ?? 0;

  // Exclusive upper bound for a same-day string comparison against occurredAt's ISO text.
  const endsOnExclusiveDate = new Date(`${endsOn}T00:00:00`);
  endsOnExclusiveDate.setDate(endsOnExclusiveDate.getDate() + 1);
  const endsOnExclusive = endsOnExclusiveDate.toISOString().slice(0, 19);

  const committedPoints = commitment?.committedPoints ?? 0;
  const committedAt = commitment?.committedAt ?? `${startsOn}T00:00:00`;

  let completed = 0;
  let completedLocal = 0;
  let scopeAdded = 0;
  let scopeRemoved = 0;
  let excludedUnpointed = 0;
  let anyPointedContribution = false;

  for (const card of cards) {
    const points = card.points;
    const done = card.movements.find(
      (m) => m.columnKey === 'done' && withinSpan(m.occurredAt, startsOn, endsOnExclusive),
    );
    const entry = firstWorkingEntry(card.movements);
    const last = lastMovement(card.movements);

    const touchesIteration =
      Boolean(done) ||
      (entry !== null && withinSpan(entry.occurredAt, startsOn, endsOnExclusive)) ||
      (entry !== null && entry.occurredAt <= committedAt);
    if (!touchesIteration) continue;

    if (points === null) {
      excludedUnpointed += 1;
      continue;
    }

    if (done) {
      completed += points;
      if (card.project === 'local') completedLocal += points;
      anyPointedContribution = true;
      continue;
    }

    // Joined after the commitment was taken: scope added, not commitment.
    if (entry && entry.occurredAt > committedAt && withinSpan(entry.occurredAt, startsOn, endsOnExclusive)) {
      scopeAdded += points;
      anyPointedContribution = true;
    }

    // Was working at commitment time and has since left every working
    // column (its last movement is out of the working set) — scope removed.
    if (
      entry &&
      entry.occurredAt <= committedAt &&
      last &&
      !WORKING_COLUMN_KEYS.has(last.columnKey) &&
      last.columnKey !== 'done' &&
      withinSpan(last.occurredAt, startsOn, endsOnExclusive)
    ) {
      scopeRemoved += points;
      anyPointedContribution = true;
    }
  }

  const points: IterationReportPointsSection =
    committedPoints === 0 && !anyPointedContribution
      ? { withheld: true, reason: 'No card in this iteration carries a story point value.' }
      : {
          committed: committedPoints,
          completed,
          scopeAdded,
          scopeRemoved,
          localShare: share(completedLocal, completed),
          jiraShare: completed > 0 ? 1 - share(completedLocal, completed) : 0,
          excludedUnpointed,
        };

  return {
    ordinalName,
    startsOn,
    endsOn,
    time: {
      byCard,
      byProject,
      localShare: share(localTimeSeconds, totalTimeSeconds),
      jiraShare: totalTimeSeconds > 0 ? 1 - share(localTimeSeconds, totalTimeSeconds) : 0,
    },
    points,
    incomplete,
  };
};
