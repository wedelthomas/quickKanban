import { buildSummary } from '../../domain/summary.js';
import { renderSummaryText } from '../../domain/summary-text.js';
import { toCalendarDate } from '../../domain/overdue.js';
import type { SummaryRepository } from '../repositories/summary-repository.js';
import type { Summary, SummaryPeriod } from '../../shared/types.js';

/**
 * Period boundaries, as local calendar days.
 *
 * The same rule due dates use since slice 1, and for a sharper version of the
 * same reason: UTC would move the boundary, so a summary generated at 7pm
 * local would already have rolled into tomorrow and would omit that evening's
 * work — in exactly the hours before the standup it exists to serve.
 *
 * Daily covers yesterday AND today, because a standup update is about what you
 * did yesterday and what you are on now.
 */
export const periodBounds = (
  period: SummaryPeriod,
  now: Date,
): { from: Date; to: Date; fromLabel: string; toLabel: string } => {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysBack = period === 'daily' ? 1 : 6;

  const from = new Date(startOfToday);
  from.setDate(from.getDate() - daysBack);

  // Exclusive upper bound at the start of tomorrow, so everything today counts.
  const to = new Date(startOfToday);
  to.setDate(to.getDate() + 1);

  return { from, to, fromLabel: toCalendarDate(from), toLabel: toCalendarDate(now) };
};

export class SummaryService {
  constructor(
    private readonly summaries: SummaryRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async generate(period: SummaryPeriod): Promise<Summary> {
    const { from, to, fromLabel, toLabel } = periodBounds(period, this.now());

    const [movements, current] = await Promise.all([
      this.summaries.movements(from, to),
      this.summaries.currentState(),
    ]);

    const summary = buildSummary({
      period,
      from: fromLabel,
      to: toLabel,
      movements,
      current,
    });

    // Text derived from the same structure the interface draws, so the two
    // cannot disagree about what the period contained.
    return { ...summary, text: renderSummaryText(summary) };
  }
}
