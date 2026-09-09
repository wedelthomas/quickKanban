import type { Burndown, IterationReport } from '../../shared/types.js';
import type { IterationRepository } from '../repositories/iteration-repository.js';
import type { CommitmentRepository } from '../repositories/commitment-repository.js';
import type { ReportRepository } from '../repositories/report-repository.js';
import type { SettingsRepository } from '../repositories/settings-repository.js';
import { buildIterationReport, determineIncomplete } from '../../domain/iteration-report.js';
import { buildBurndown } from '../../domain/burndown.js';
import { iterationNotFound } from '../errors.js';

/**
 * Orchestrates the read-only reporting surface: resolves an ordinal to its
 * span, gathers every card's raw history once, and hands it to the pure
 * domain functions that actually compute a report or a burndown.
 *
 * Everything here is computed on read (research.md R-2) — no report shape
 * is ever stored.
 */
export class ReportService {
  constructor(
    private readonly iterations: IterationRepository,
    private readonly commitments: CommitmentRepository,
    private readonly reports: ReportRepository,
    private readonly settings: SettingsRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async iterationReport(ordinalName: string): Promise<IterationReport> {
    const iteration = await this.iterations.findByOrdinal(ordinalName);
    if (!iteration) throw iterationNotFound(ordinalName);

    const [commitment, cards, settings, earliestMovementAt, earliestBlockedEventAt] =
      await Promise.all([
        this.commitments.find(ordinalName),
        this.reports.allCards(),
        this.settings.read(),
        this.reports.earliestMovementAt(),
        this.reports.earliestBlockedEventAt(),
      ]);

    const incomplete = determineIncomplete(
      iteration.startsOn,
      earliestMovementAt,
      earliestBlockedEventAt,
      cards.some((c) => c.movements.length > 0),
    );

    return buildIterationReport({
      ordinalName: iteration.ordinalName,
      startsOn: iteration.startsOn,
      endsOn: iteration.endsOn,
      cards: cards.map((c) => ({
        cardId: c.cardId,
        title: c.title,
        project: c.source === 'local' ? 'local' : (c.project ?? 'local'),
        points: c.points,
        movements: c.movements,
        blockedEvents: c.blockedEvents,
        cancelledAt: c.cancelledAt,
      })),
      calendar: {
        workingDays: settings.workingDays,
        startHour: settings.workingStartHour,
        endHour: settings.workingEndHour,
      },
      commitment,
      incomplete,
      now: this.now(),
    });
  }

  async burndown(ordinalName: string): Promise<Burndown> {
    const iteration = await this.iterations.findByOrdinal(ordinalName);
    if (!iteration) throw iterationNotFound(ordinalName);

    const [commitment, cards, settings] = await Promise.all([
      this.commitments.find(ordinalName),
      this.reports.allCards(),
      this.settings.read(),
    ]);

    return {
      ordinalName: iteration.ordinalName,
      points: buildBurndown({
        startsOn: iteration.startsOn,
        endsOn: iteration.endsOn,
        commitment,
        cards: cards.map((c) => ({
          cardId: c.cardId,
          title: c.title,
          project: c.source === 'local' ? 'local' : (c.project ?? 'local'),
          points: c.points,
          movements: c.movements,
          blockedEvents: c.blockedEvents,
          cancelledAt: c.cancelledAt,
        })),
        calendar: { workingDays: settings.workingDays },
        now: this.now(),
      }),
    };
  }
}
