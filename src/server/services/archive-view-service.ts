import type pg from 'pg';
import { archiveByRange } from '../repositories/archive-repository.js';
import { toCalendarDate } from '../../domain/overdue.js';
import type { ArchiveDay } from '../../shared/types.js';
import { invalidDateRange } from '../errors.js';

const DEFAULT_DAYS_BACK = 30;

/** Parses YYYY-MM-DD as a LOCAL date. `new Date('2026-08-26')` is UTC midnight,
 *  which is the previous day west of Greenwich — the exact bug this avoids. */
const parseLocalDate = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(date.getTime()) ? null : date;
};

export class ArchiveViewService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async read(
    fromRaw?: string,
    toRaw?: string,
  ): Promise<{ from: string; to: string; days: ArchiveDay[]; total: number }> {
    const now = this.now();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const defaultFrom = new Date(today);
    defaultFrom.setDate(defaultFrom.getDate() - DEFAULT_DAYS_BACK);

    const from = fromRaw ? parseLocalDate(fromRaw) : defaultFrom;
    const to = toRaw ? parseLocalDate(toRaw) : today;
    if (!from) throw invalidDateRange(`"${fromRaw}" is not a date in YYYY-MM-DD form.`);
    if (!to) throw invalidDateRange(`"${toRaw}" is not a date in YYYY-MM-DD form.`);
    if (from > to) {
      throw invalidDateRange(
        'The range starts after it ends. Check which date is which.',
      );
    }

    // The upper bound is exclusive in SQL but inclusive to the reader: a range
    // of one day means that day, which is what a person asking for one day
    // means. So the query runs to the start of the day AFTER `to`.
    const exclusiveTo = new Date(to);
    exclusiveTo.setDate(exclusiveTo.getDate() + 1);

    const cards = await archiveByRange(this.pool, from, exclusiveTo);

    // Grouped on the LOCAL calendar date, which is why this is here rather than
    // in SQL — Postgres would group by the container's timezone regardless.
    const byDate = new Map<string, ArchiveDay>();
    for (const card of cards) {
      const date = toCalendarDate(new Date(card.archivedAt));
      const day = byDate.get(date) ?? { date, cards: [] };
      day.cards.push(card);
      byDate.set(date, day);
    }

    return {
      from: toCalendarDate(from),
      to: toCalendarDate(to),
      // Newest first, and days with nothing in them are absent rather than
      // empty: a run of blank dates is noise, not information.
      days: [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date)),
      total: cards.length,
    };
  }
}
