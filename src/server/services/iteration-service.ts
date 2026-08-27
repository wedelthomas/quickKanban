import type { Iteration } from '../../shared/types.js';
import type { IterationPort } from '../jira/iteration-port.js';
import type { IterationRepository } from '../repositories/iteration-repository.js';
import type { SettingsRepository } from '../repositories/settings-repository.js';
import { selectSprint } from '../../domain/sprint-selection.js';
import { decideIteration } from '../../domain/iteration-provenance.js';
import { workingDaysRemaining } from '../../domain/working-days.js';
import type { CarryOverService } from './carry-over-service.js';

/**
 * What iteration it is, established as honestly as the circumstances allow.
 *
 * Nothing here throws. Every failure of the source — unreachable, rejected
 * credentials, a board that does not exist, a sprint with no dates — ends in a
 * cached or estimated value, because a board that cannot say which iteration it
 * is must still be a board (FR-429, FR-430). The only thing that must never
 * happen is presenting a guess as a reading, which `provenance` prevents.
 */
export class IterationService {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly iterations: IterationRepository,
    /** Absent when Jira is not configured — a supported state, not a failure. */
    private readonly source: IterationPort | null,
    private readonly now: () => Date = () => new Date(),
    /**
     * Applied here because resolving the iteration is the only moment a
     * boundary can be observed. Optional so the service stays constructible in
     * tests that care only about the banner.
     */
    private readonly carryOver?: CarryOverService,
  ) {}

  async current(): Promise<Iteration | null> {
    const settings = await this.settings.read();
    const now = this.now();

    const read = await this.readFromSource(
      settings.iterationBoardId,
      settings.iterationTeamName,
    );
    if (read) {
      // Recorded before it is returned, so the cache is warm for the first
      // outage rather than the second.
      await this.iterations.record(read).catch(() => {
        // A failed write must not cost the user the iteration we just read.
      });
    }

    const cached = read ? null : await this.iterations.current().catch(() => null);

    const decided = decideIteration({
      read,
      cached,
      config: {
        anchorDate: settings.iterationAnchorDate,
        cadenceDays: settings.iterationCadenceDays,
      },
      now,
    });
    if (!decided) return null;

    // A boundary can only be noticed here. Failures are swallowed: a stale
    // carry-over badge must not cost the user their banner.
    await this.carryOver?.observe(decided.ordinalName).catch(() => {});

    return {
      ...decided,
      workingDaysRemaining: workingDaysRemaining(
        decided.startsOn,
        decided.endsOn,
        now,
        settings.workingDays,
      ),
    };
  }

  /**
   * Reads the reference board, or returns null.
   *
   * Every failure collapses to null on purpose. The caller's next step is the
   * same whichever way the source failed, and distinguishing a timeout from a
   * rejected credential here would only invite someone to surface it — which
   * FR-430 forbids.
   */
  private async readFromSource(
    boardId: number,
    teamName: string,
  ): Promise<{ ordinalName: string; startsOn: string; endsOn: string } | null> {
    if (!this.source) return null;
    try {
      const sprint = selectSprint(await this.source.listActiveSprints(boardId), teamName);
      if (!sprint) return null;
      return {
        ordinalName: sprint.name,
        startsOn: sprint.startsOn,
        endsOn: sprint.endsOn,
      };
    } catch {
      return null;
    }
  }
}
